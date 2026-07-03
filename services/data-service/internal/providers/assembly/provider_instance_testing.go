package assembly

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	"github.com/movscript/movscript/internal/infra/config"
	infradb "github.com/movscript/movscript/internal/infra/db"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var ErrProviderInstanceNotFound = errors.New("provider instance not found")

var postgresPing = pingPostgresDatabase

type ProviderTestResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}

func TestStartupProviderInstance(ctx context.Context, cfg *config.Config, id string) (ProviderTestResult, error) {
	start := time.Now()
	instance, ok := findStartupProviderInstance(cfg, id)
	if !ok {
		return ProviderTestResult{}, ErrProviderInstanceNotFound
	}
	if !instance.Configured {
		return ProviderTestResult{Success: false, Message: "startup configuration is missing required settings", LatencyMs: time.Since(start).Milliseconds()}, nil
	}

	err, handled := coreStartupProviderInstanceTest(ctx, cfg, instance)
	if !handled {
		err, handled = distributionProfileStartupProviderInstanceTest(ctx, cfg, instance)
	}
	if !handled {
		err = fmt.Errorf("provider instance %q is not testable yet", id)
	}
	if err != nil {
		return ProviderTestResult{Success: false, Message: err.Error(), LatencyMs: time.Since(start).Milliseconds()}, nil
	}
	return ProviderTestResult{Success: true, Message: "provider instance test passed", LatencyMs: time.Since(start).Milliseconds()}, nil
}

func coreStartupProviderInstanceTest(ctx context.Context, cfg *config.Config, instance config.ProviderInstance) (error, bool) {
	switch instance.Type + ":" + instance.Adapter {
	case providercontract.TypeDatabase + ":" + providercontract.AdapterSQLite:
		return testSQLiteConfig(cfg), true
	case providercontract.TypeDatabase + ":" + providercontract.AdapterPostgres:
		return testPostgresConfig(ctx, cfg), true
	case providercontract.TypeBlobStorage + ":" + providercontract.AdapterFilesystem:
		return testFilesystemStorage(ctx, cfg), true
	case providercontract.TypeBlobStorage + ":" + providercontract.AdapterMinIO:
		return testBlobStorageHealth(ctx, cfg), true
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitHTTP:
		return testLocalGitHTTPConfig(cfg), true
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitea:
		return testGiteaConfig(ctx, cfg), true
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitHubSelfHosted:
		return testGitHubSelfHostedConfig(ctx, cfg), true
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitLab:
		return testGitLabConfig(ctx, cfg), true
	case providercontract.TypeAIGateway + ":" + providercontract.AdapterLocal:
		return nil, true
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterLocalIndex:
		return nil, true
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterPgVector:
		return testPgVectorConfig(ctx, cfg), true
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterQdrant:
		return testQdrantConfig(ctx, cfg), true
	case providercontract.TypeCache + ":" + providercontract.AdapterMemory,
		providercontract.TypeCache + ":" + providercontract.AdapterNoop,
		providercontract.TypeCache + ":" + providercontract.AdapterRedis:
		return testCache(ctx, cfg), true
	case providercontract.TypeMediaProcessing + ":" + providercontract.AdapterDesktopManagedMedia,
		providercontract.TypeMediaProcessing + ":" + providercontract.AdapterExternalMediaWorker:
		return testMediaProcessingConfig(ctx, cfg), true
	case providercontract.TypeAgentRuntime + ":" + providercontract.AdapterDesktopManagedAgent,
		providercontract.TypeAgentRuntime + ":" + providercontract.AdapterRemoteAgentRuntime,
		providercontract.TypeAgentRuntime + ":" + providercontract.AdapterMova:
		return testAgentRuntimeConfig(ctx, cfg), true
	default:
		return nil, false
	}
}

func findStartupProviderInstance(cfg *config.Config, id string) (config.ProviderInstance, bool) {
	for _, instance := range cfg.EffectiveProviderInstances() {
		if instance.ID == strings.TrimSpace(id) {
			return instance, true
		}
	}
	return config.ProviderInstance{}, false
}
func testBlobStorageHealth(ctx context.Context, cfg *config.Config) error {
	store, err := BuildBlobStorage(cfg)
	if err != nil {
		return err
	}
	health := store.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("blob storage health check failed: %s", health.Message)
	}
	return nil
}

func testSQLiteConfig(cfg *config.Config) error {
	if cfg == nil || strings.TrimSpace(cfg.DBPath) == "" {
		return fmt.Errorf("sqlite db path is required")
	}
	parent := filepath.Dir(cfg.DBPath)
	return os.MkdirAll(parent, 0o755)
}

func testPostgresConfig(ctx context.Context, cfg *config.Config) error {
	if cfg == nil {
		return fmt.Errorf("postgres config is required")
	}
	if err := postgresPing(ctx, cfg); err != nil {
		return fmt.Errorf("postgres health check failed: %s", redactProviderSecret(err.Error(), cfg.DBPassword))
	}
	return nil
}

func pingPostgresDatabase(ctx context.Context, cfg *config.Config) error {
	db, err := sql.Open("pgx", postgresDSN(cfg))
	if err != nil {
		return err
	}
	defer db.Close()
	return db.PingContext(ctx)
}

func postgresDSN(cfg *config.Config) string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)
}

func redactProviderSecret(message string, secret string) string {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return message
	}
	return strings.ReplaceAll(message, secret, "[redacted]")
}

func testFilesystemStorage(ctx context.Context, cfg *config.Config) error {
	store, err := BuildBlobStorage(cfg)
	if err != nil {
		return err
	}
	key := "provider-health/.startup-test"
	payload := []byte("movscript-provider-test")
	if err := store.Put(ctx, key, bytes.NewReader(payload), int64(len(payload)), "text/plain"); err != nil {
		return err
	}
	defer store.Delete(context.WithoutCancel(ctx), key)
	rc, size, _, err := store.GetObject(ctx, key, -1, -1)
	if err != nil {
		return err
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return err
	}
	if size != int64(len(payload)) || !bytes.Equal(data, payload) {
		return fmt.Errorf("filesystem storage round trip mismatch")
	}
	return nil
}

func testLocalGitHTTPConfig(cfg *config.Config) error {
	if cfg == nil {
		return fmt.Errorf("config is required")
	}
	if strings.TrimSpace(cfg.GitHTTPRoot) == "" {
		return fmt.Errorf("git http root is required")
	}
	if err := os.MkdirAll(cfg.GitHTTPRoot, 0o755); err != nil {
		return err
	}
	gitBinary := strings.TrimSpace(cfg.GitBinary)
	if gitBinary == "" {
		gitBinary = "git"
	}
	if strings.ContainsRune(gitBinary, filepath.Separator) {
		if _, err := os.Stat(gitBinary); err != nil {
			return err
		}
		return nil
	}
	_, err := exec.LookPath(gitBinary)
	return err
}

func testGiteaConfig(ctx context.Context, cfg *config.Config) error {
	provider := BuildWorkspaceRepositoryProvider(cfg)
	if provider.Provider != projectrepoapp.ProviderGitea || provider.GiteaAdapter == nil {
		return fmt.Errorf("gitea provider is not configured")
	}
	health := provider.GiteaAdapter.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("gitea health check failed: %s", health.Message)
	}
	return nil
}

func testGitHubSelfHostedConfig(ctx context.Context, cfg *config.Config) error {
	provider := BuildWorkspaceRepositoryProvider(cfg)
	if provider.Provider != projectrepoapp.ProviderGitHubSelfHosted || provider.GitHubAdapter == nil {
		return fmt.Errorf("github self-hosted provider is not configured")
	}
	health := provider.GitHubAdapter.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("github self-hosted health check failed: %s", health.Message)
	}
	return nil
}

func testGitLabConfig(ctx context.Context, cfg *config.Config) error {
	provider := BuildWorkspaceRepositoryProvider(cfg)
	if provider.Provider != projectrepoapp.ProviderGitLab || provider.GitLabAdapter == nil {
		return fmt.Errorf("gitlab provider is not configured")
	}
	health := provider.GitLabAdapter.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("gitlab health check failed: %s", health.Message)
	}
	return nil
}

func testCache(ctx context.Context, cfg *config.Config) error {
	store, err := BuildCache(cfg)
	if err != nil {
		return err
	}
	defer store.Close()
	key := "provider-health:startup-test"
	value := map[string]string{"status": "ok"}
	if err := store.SetJSON(ctx, key, value, time.Minute); err != nil {
		return err
	}
	defer store.Delete(context.WithoutCancel(ctx), key)
	if strings.TrimSpace(cfg.CacheBackend) == "noop" || strings.TrimSpace(cfg.CacheBackend) == "" {
		return nil
	}
	var got map[string]string
	ok, err := store.GetJSON(ctx, key, &got)
	if err != nil {
		return err
	}
	if !ok || got["status"] != "ok" {
		return fmt.Errorf("cache round trip mismatch")
	}
	return nil
}

func testQdrantConfig(ctx context.Context, cfg *config.Config) error {
	provider := BuildVectorIndexProvider(nil, cfg)
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok || healthChecker == nil {
		return fmt.Errorf("qdrant provider is not configured")
	}
	health := healthChecker.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("qdrant health check failed: %s", health.Message)
	}
	return nil
}

func testPgVectorConfig(ctx context.Context, cfg *config.Config) error {
	if cfg == nil || strings.TrimSpace(cfg.DBDriver) != providercontract.AdapterPostgres {
		return fmt.Errorf("pgvector requires postgres database configuration")
	}
	db, err := infradb.Connect(cfg)
	if err != nil {
		return fmt.Errorf("pgvector database connection failed: %s", redactProviderSecret(err.Error(), cfg.DBPassword))
	}
	sqlDB, err := db.DB()
	if err == nil {
		defer sqlDB.Close()
	}
	provider := BuildVectorIndexProvider(db, cfg)
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok || healthChecker == nil {
		return fmt.Errorf("pgvector provider is not configured")
	}
	health := healthChecker.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("pgvector health check failed: %s", redactProviderSecret(health.Message, cfg.DBPassword))
	}
	return nil
}

func testAgentRuntimeConfig(ctx context.Context, cfg *config.Config) error {
	_, healthChecker, ok := BuildAgentRuntimeProvider(cfg)
	if !ok || healthChecker == nil {
		return fmt.Errorf("agent runtime provider is not configured")
	}
	health := healthChecker.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("agent runtime health check failed: %s", health.Message)
	}
	return nil
}

func testMediaProcessingConfig(ctx context.Context, cfg *config.Config) error {
	_, healthChecker, ok := BuildMediaProcessingProvider(cfg)
	if !ok || healthChecker == nil {
		return fmt.Errorf("media processing provider is not configured")
	}
	health := healthChecker.Health(ctx)
	if health.Status != providercontract.HealthStatusOK {
		return fmt.Errorf("media processing health check failed: %s", health.Message)
	}
	return nil
}
