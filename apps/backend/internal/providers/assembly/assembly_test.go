package assembly

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	shotreferenceapp "github.com/movscript/movscript/internal/app/shotreference"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
)

func TestBuildWorkspaceRepositoryProviderUsesLocalGitHTTP(t *testing.T) {
	cfg := &config.Config{
		WorkspaceStorageBackend: "git-http-backend",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
		GiteaRepoPrefix:         "movscript-project-",
		GiteaBranch:             "main",
	}

	provider := BuildWorkspaceRepositoryProvider(cfg)

	if provider.Provider != projectrepoapp.ProviderGitHTTP {
		t.Fatalf("Provider = %q, want %q", provider.Provider, projectrepoapp.ProviderGitHTTP)
	}
	if provider.Adapter == nil {
		t.Fatal("Adapter is nil, want local Git adapter")
	}
	if provider.GiteaAdapter != nil || provider.GiteaBaseURL != "" || provider.GiteaToken != "" {
		t.Fatalf("Gitea fields should be empty for local Git provider: %+v", provider)
	}
	if provider.GitHTTPRoot != cfg.GitHTTPRoot || provider.GitBinary != "git" {
		t.Fatalf("local Git config = root %q binary %q, want configured values", provider.GitHTTPRoot, provider.GitBinary)
	}
}

func TestBuildWorkspaceRepositoryProviderUsesGitea(t *testing.T) {
	cfg := &config.Config{
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://gitea.local",
		GiteaToken:              "token",
		GiteaRepoPrefix:         "movscript-project-",
		GiteaBranch:             "main",
		GiteaOrgPrefix:          "movscript-org-",
		GiteaUserEmailDomain:    "users.movscript.local",
		GiteaUserTokenName:      "movscript-desktop",
	}

	provider := BuildWorkspaceRepositoryProvider(cfg)

	if provider.Provider != projectrepoapp.ProviderGitea {
		t.Fatalf("Provider = %q, want %q", provider.Provider, projectrepoapp.ProviderGitea)
	}
	if provider.Adapter == nil || provider.GiteaAdapter == nil {
		t.Fatalf("Gitea provider adapters not configured: %+v", provider)
	}
	if provider.GiteaBaseURL != cfg.GiteaBaseURL || provider.GiteaToken != cfg.GiteaToken {
		t.Fatalf("Gitea proxy fields = baseURL %q token %q, want configured values", provider.GiteaBaseURL, provider.GiteaToken)
	}
	if provider.GitIdentityConfig.UserEmailDomain != cfg.GiteaUserEmailDomain || provider.GitIdentityConfig.UserTokenName != cfg.GiteaUserTokenName {
		t.Fatalf("GitIdentityConfig = %+v, want cfg values", provider.GitIdentityConfig)
	}
}

func TestBuildWorkspaceRepositoryProviderUsesGitHubEnterprise(t *testing.T) {
	cfg := &config.Config{
		WorkspaceStorageBackend:    "github-enterprise",
		GitHubEnterpriseBaseURL:    "https://github.example.com",
		GitHubEnterpriseToken:      "token",
		GitHubEnterpriseRepoPrefix: "gh-project-",
		GitHubEnterpriseBranch:     "main",
		GitHubEnterpriseOrgPrefix:  "gh-org-",
	}

	provider := BuildWorkspaceRepositoryProvider(cfg)

	if provider.Provider != projectrepoapp.ProviderGitHubEnterprise {
		t.Fatalf("Provider = %q, want %q", provider.Provider, projectrepoapp.ProviderGitHubEnterprise)
	}
	if provider.Adapter == nil || provider.GitHubAdapter == nil {
		t.Fatalf("GitHub Enterprise provider adapters not configured: %+v", provider)
	}
	if provider.Config.RepoPrefix != "gh-project-" || provider.Config.OrgPrefix != "gh-org-" || provider.Config.DefaultBranch != "main" {
		t.Fatalf("workspace repo config = %+v, want GitHub Enterprise settings", provider.Config)
	}
	if provider.GitHubBaseURL != cfg.GitHubEnterpriseBaseURL || provider.GitHubToken != cfg.GitHubEnterpriseToken {
		t.Fatalf("GitHub Enterprise fields = baseURL %q token %q, want configured values", provider.GitHubBaseURL, provider.GitHubToken)
	}
	if provider.GiteaAdapter != nil || provider.GiteaBaseURL != "" || provider.GiteaToken != "" {
		t.Fatalf("Gitea fields should be empty for GitHub Enterprise provider: %+v", provider)
	}
}

func TestBuildWorkspaceRepositoryProviderUsesGitLab(t *testing.T) {
	cfg := &config.Config{
		WorkspaceStorageBackend: "gitlab",
		GitLabBaseURL:           "https://gitlab.example.com",
		GitLabToken:             "token",
		GitLabRepoPrefix:        "gl-project-",
		GitLabBranch:            "main",
		GitLabOrgPrefix:         "gl-org-",
	}

	provider := BuildWorkspaceRepositoryProvider(cfg)

	if provider.Provider != projectrepoapp.ProviderGitLab {
		t.Fatalf("Provider = %q, want %q", provider.Provider, projectrepoapp.ProviderGitLab)
	}
	if provider.Adapter == nil || provider.GitLabAdapter == nil {
		t.Fatalf("GitLab provider adapters not configured: %+v", provider)
	}
	if provider.Config.RepoPrefix != "gl-project-" || provider.Config.OrgPrefix != "gl-org-" || provider.Config.DefaultBranch != "main" {
		t.Fatalf("workspace repo config = %+v, want GitLab settings", provider.Config)
	}
	if provider.GitLabBaseURL != cfg.GitLabBaseURL || provider.GitLabToken != cfg.GitLabToken {
		t.Fatalf("GitLab fields = baseURL %q token %q, want configured values", provider.GitLabBaseURL, provider.GitLabToken)
	}
	if provider.GiteaAdapter != nil || provider.GiteaBaseURL != "" || provider.GiteaToken != "" {
		t.Fatalf("Gitea fields should be empty for GitLab provider: %+v", provider)
	}
}

func TestBuildRuntimeProvidersUsesStartupComposition(t *testing.T) {
	cfg := &config.Config{
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memory",
		AIGatewayProvider:     "local",
	}

	providers, err := BuildRuntimeProviders(context.Background(), nil, cfg, nil)
	if err != nil {
		t.Fatalf("BuildRuntimeProviders returned error: %v", err)
	}
	if providers.Store == nil || providers.Store.Backend() != "filesystem" {
		t.Fatalf("Store = %#v, want filesystem storage", providers.Store)
	}
	if providers.Cache == nil {
		t.Fatal("Cache is nil, want memory cache")
	}
	if providers.VectorIndex == nil {
		t.Fatal("VectorIndex is nil, want assembled vector provider")
	}
	if providers.Registry == nil || providers.AIService == nil {
		t.Fatalf("AI providers not assembled: registry=%#v service=%#v", providers.Registry, providers.AIService)
	}
}

func TestBuildVectorIndexProviderUsesLocalAdapter(t *testing.T) {
	db := testutil.OpenSQLite(t, "assembly-vector-index.db", &persistencemodel.ShotVectorDocument{})
	provider := BuildVectorIndexProvider(db)
	if provider == nil {
		t.Fatal("BuildVectorIndexProvider returned nil")
	}
	if err := provider.Upsert(context.Background(), providercontract.VectorDocument{
		ID:        "default:1:zh-CN:combined",
		Namespace: "default",
		SourceID:  "default",
		Locale:    "zh-CN",
		Kind:      "combined",
		Text:      "delayed reveal",
		Metadata:  map[string]any{"reference_id": float64(1)},
	}); err != nil {
		t.Fatalf("vector provider upsert: %v", err)
	}
	results, err := provider.Search(context.Background(), providercontract.VectorSearchRequest{Query: "delayed reveal", Locale: "zh-CN"})
	if err != nil {
		t.Fatalf("vector provider search: %v", err)
	}
	if len(results) != 1 || results[0].Document.ID != "default:1:zh-CN:combined" {
		t.Fatalf("vector provider results = %+v, want inserted document", results)
	}
}

func TestBuildVectorIndexProviderUsesQdrantAdapter(t *testing.T) {
	provider := BuildVectorIndexProvider(nil, &config.Config{
		VectorIndexProvider: providercontract.AdapterQdrant,
		QdrantBaseURL:       "http://qdrant.local",
		QdrantCollection:    "shot_vectors",
	})
	if provider == nil {
		t.Fatal("BuildVectorIndexProvider returned nil")
	}
	if _, ok := provider.(providercontract.HealthChecker); !ok {
		t.Fatalf("BuildVectorIndexProvider returned %#v, want qdrant health checker", provider)
	}
}

func TestBuildVectorIndexProviderUsesPgVectorAdapter(t *testing.T) {
	provider := BuildVectorIndexProvider(nil, &config.Config{VectorIndexProvider: providercontract.AdapterPgVector})
	if provider == nil {
		t.Fatal("BuildVectorIndexProvider returned nil")
	}
	if _, ok := provider.(*shotreferenceapp.PgVectorIndexProvider); !ok {
		t.Fatalf("BuildVectorIndexProvider returned %#v, want pgvector adapter", provider)
	}
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok {
		t.Fatalf("BuildVectorIndexProvider returned %#v, want pgvector health checker", provider)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusMissingConfig {
		t.Fatalf("pgvector health = %+v, want missing config with nil db", health)
	}
}

func TestBuildExternalResourceProviderUsesProviderAdapter(t *testing.T) {
	provider, ok := BuildExternalResourceProvider("pexels", map[string]string{"api_key": "test"}, nil)
	if !ok || provider == nil {
		t.Fatalf("BuildExternalResourceProvider returned provider=%#v ok=%v, want Pexels adapter", provider, ok)
	}
	if _, ok := BuildExternalResourceProvider("unknown", nil, nil); ok {
		t.Fatal("BuildExternalResourceProvider accepted unknown provider")
	}
}

func TestBuildAgentRuntimeProviderUsesControlPlaneAdapter(t *testing.T) {
	provider, healthChecker, ok := BuildAgentRuntimeProvider(&config.Config{AgentRuntimeProvider: providercontract.AdapterMova})
	if !ok || provider == nil || healthChecker == nil {
		t.Fatalf("BuildAgentRuntimeProvider returned provider=%#v health=%#v ok=%v, want Mova provider", provider, healthChecker, ok)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusOK || health.Adapter != providercontract.AdapterMova {
		t.Fatalf("agent runtime health = %+v, want Mova ok", health)
	}
	session, err := provider.EnsureRuntime(context.Background(), providercontract.AgentRuntimeProfile{ID: "mova-home"})
	if err != nil {
		t.Fatalf("EnsureRuntime returned error: %v", err)
	}
	if session.ID != "mova-home" || session.State != "desktop_managed" {
		t.Fatalf("agent runtime session = %+v, want desktop-managed Mova session", session)
	}
	if _, err := provider.StartSession(context.Background(), providercontract.AgentSessionRequest{WorkspaceRef: "project:1"}); err == nil {
		t.Fatal("StartSession returned nil error, want lifecycle-owned-by-host error")
	}
}

func TestBuildAgentRuntimeProviderRemoteRuntimeProbesHealth(t *testing.T) {
	var sawHealth bool
	var sawCapabilities bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer runtime-token" {
			t.Fatalf("authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/health":
			sawHealth = true
			return &http.Response{
				StatusCode: http.StatusNoContent,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		case "/capabilities":
			sawCapabilities = true
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"capabilities":["agent_session.proxy","agent_permission.probe"]}`)),
			}, nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	_, healthChecker, ok := BuildAgentRuntimeProvider(&config.Config{
		AgentRuntimeProvider: providercontract.AdapterRemoteAgentRuntime,
		AgentRuntimeBaseURL:  "http://runtime.local",
		AgentRuntimeToken:    "runtime-token",
	})
	if !ok || healthChecker == nil {
		t.Fatalf("BuildAgentRuntimeProvider returned ok=%v health=%#v, want remote health checker", ok, healthChecker)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusOK || health.Message != "remote agent runtime health probe succeeded" {
		t.Fatalf("remote runtime health = %+v, want ok", health)
	}
	if !sawHealth {
		t.Fatal("expected remote runtime /health probe")
	}
	if !sawCapabilities {
		t.Fatal("expected remote runtime /capabilities probe")
	}
	for _, capability := range []string{providercontract.AgentRuntimeCapabilitySessionProxy, providercontract.AgentRuntimeCapabilityPermissionProbe} {
		if !containsString(health.Capabilities, capability) {
			t.Fatalf("remote runtime capabilities = %+v, want %s", health.Capabilities, capability)
		}
	}
}

func TestBuildAgentRuntimeProviderRemoteRuntimeAllowsMissingCapabilitiesEndpoint(t *testing.T) {
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/health":
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		case "/capabilities":
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	_, healthChecker, ok := BuildAgentRuntimeProvider(&config.Config{
		AgentRuntimeProvider: providercontract.AdapterRemoteAgentRuntime,
		AgentRuntimeBaseURL:  "http://runtime.local",
	})
	if !ok || healthChecker == nil {
		t.Fatalf("BuildAgentRuntimeProvider returned ok=%v health=%#v, want remote health checker", ok, healthChecker)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusOK {
		t.Fatalf("remote runtime health = %+v, want ok", health)
	}
	if containsString(health.Capabilities, providercontract.AgentRuntimeCapabilitySessionProxy) {
		t.Fatalf("remote runtime capabilities = %+v, should not claim dynamic proxy capability without /capabilities", health.Capabilities)
	}
}

func TestBuildAgentRuntimeProviderRemoteRuntimeRequiresBaseURL(t *testing.T) {
	_, healthChecker, ok := BuildAgentRuntimeProvider(&config.Config{AgentRuntimeProvider: providercontract.AdapterRemoteAgentRuntime})
	if !ok || healthChecker == nil {
		t.Fatalf("BuildAgentRuntimeProvider returned ok=%v health=%#v, want remote health checker", ok, healthChecker)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusMissingConfig {
		t.Fatalf("remote runtime health = %+v, want missing_config", health)
	}
}

func TestBuildMediaProcessingProviderUsesControlPlaneAdapter(t *testing.T) {
	provider, healthChecker, ok := BuildMediaProcessingProvider(&config.Config{MediaProcessingProvider: providercontract.AdapterDesktopManagedMedia})
	if !ok || provider == nil || healthChecker == nil {
		t.Fatalf("BuildMediaProcessingProvider returned provider=%#v health=%#v ok=%v, want desktop-managed provider", provider, healthChecker, ok)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusOK || health.Adapter != providercontract.AdapterDesktopManagedMedia {
		t.Fatalf("media processing health = %+v, want desktop-managed ok", health)
	}
	if _, err := provider.Transcode(context.Background(), providercontract.MediaTranscodeRequest{InputLocation: "resource:1"}); err == nil {
		t.Fatal("Transcode returned nil error, want execution-owned-by-runtime-host error")
	}
}

func TestBuildMediaProcessingProviderExternalWorkerProbesHealth(t *testing.T) {
	var sawHealth bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/health" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer media-token" {
			t.Fatalf("authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		sawHealth = true
		return &http.Response{
			StatusCode: http.StatusNoContent,
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	_, healthChecker, ok := BuildMediaProcessingProvider(&config.Config{
		MediaProcessingProvider: providercontract.AdapterExternalMediaWorker,
		MediaWorkerBaseURL:      "http://media-worker.local",
		MediaWorkerToken:        "media-token",
	})
	if !ok || healthChecker == nil {
		t.Fatalf("BuildMediaProcessingProvider returned ok=%v health=%#v, want external worker health checker", ok, healthChecker)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusOK || health.Message != "external media worker health probe succeeded" {
		t.Fatalf("external worker health = %+v, want ok", health)
	}
	if !sawHealth {
		t.Fatal("expected external media worker /health probe")
	}
}

func TestBuildMediaProcessingProviderExternalWorkerRequiresBaseURL(t *testing.T) {
	_, healthChecker, ok := BuildMediaProcessingProvider(&config.Config{MediaProcessingProvider: providercontract.AdapterExternalMediaWorker})
	if !ok || healthChecker == nil {
		t.Fatalf("BuildMediaProcessingProvider returned ok=%v health=%#v, want external worker health checker", ok, healthChecker)
	}
	health := healthChecker.Health(context.Background())
	if health.Status != providercontract.HealthStatusMissingConfig {
		t.Fatalf("external worker health = %+v, want missing_config", health)
	}
}

func TestBuildProviderHealthSnapshotUsesAssemblyConfigReadiness(t *testing.T) {
	cfg := &config.Config{
		DependencyProfile:       "local",
		DBDriver:                "sqlite",
		DBPath:                  "movscript.db",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "http",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
		MediaProcessingProvider: providercontract.AdapterDesktopManagedMedia,
		AgentRuntimeProvider:    providercontract.AdapterDesktopManagedAgent,
	}

	items := BuildProviderHealthSnapshot(cfg)

	if len(items) != 8 {
		t.Fatalf("health item count = %d, want 8: %+v", len(items), items)
	}
	for _, item := range items {
		if item.Status != "ok" {
			t.Fatalf("health item = %+v, want ok", item)
		}
		if len(item.Capabilities) == 0 {
			t.Fatalf("health item = %+v, want capabilities", item)
		}
	}
}

func TestBuildProviderHealthSnapshotReportsMissingConfig(t *testing.T) {
	cfg := &config.Config{
		DependencyProfile:       "custom",
		DBDriver:                "postgres",
		StorageBackend:          "minio",
		WorkspaceStorageBackend: "gitea",
		AIGatewayProvider:       "new-api",
		CacheBackend:            "redis",
		MediaProcessingProvider: providercontract.AdapterExternalMediaWorker,
		AgentRuntimeProvider:    providercontract.AdapterRemoteAgentRuntime,
	}

	items := BuildProviderHealthSnapshot(cfg)

	missing := map[string]bool{}
	for _, item := range items {
		if item.Status == "missing_config" {
			missing[item.Type+":"+item.Adapter] = true
		}
	}
	for _, key := range []string{"database:postgres", "blob_storage:minio", "workspace_repository:gitea", "cache:redis", "media_processing:external-worker", "agent_runtime:remote-runtime"} {
		if !missing[key] {
			t.Fatalf("missing health statuses = %+v, want %s", missing, key)
		}
	}
}

func TestStartupProviderInstanceTestsLocalProfileProviders(t *testing.T) {
	cfg := &config.Config{
		DependencyProfile:       "local",
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "http",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
	}

	for _, id := range []string{
		"database:sqlite",
		"blob_storage:filesystem",
		"workspace_repository:http",
		"ai_gateway:local",
		"vector_index:local-index",
		"cache:memory",
		"media_processing:desktop-managed",
		"agent_runtime:desktop-managed",
	} {
		result, err := TestStartupProviderInstance(context.Background(), cfg, id)
		if err != nil {
			t.Fatalf("TestStartupProviderInstance(%q) returned error: %v", id, err)
		}
		if !result.Success {
			t.Fatalf("TestStartupProviderInstance(%q) = %+v, want success", id, result)
		}
	}
}

func TestStartupProviderInstanceTestsGiteaHealth(t *testing.T) {
	var sawUserProbe bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/user" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		sawUserProbe = true
		if r.Header.Get("Authorization") != "token admin-token" {
			t.Fatalf("authorization = %q, want token auth", r.Header.Get("Authorization"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"username":"admin"}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})
	cfg := &config.Config{
		DependencyProfile:       "custom",
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://gitea.local",
		GiteaToken:              "admin-token",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "workspace_repository:gitea")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawUserProbe {
		t.Fatal("expected Gitea /api/v1/user probe")
	}
}

func TestStartupProviderInstanceTestsGitHubEnterpriseHealth(t *testing.T) {
	var sawUserProbe bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v3/user" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		sawUserProbe = true
		if r.Header.Get("Authorization") != "Bearer admin-token" {
			t.Fatalf("authorization = %q, want bearer auth", r.Header.Get("Authorization"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"login":"admin"}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})
	cfg := &config.Config{
		DependencyProfile:          "custom",
		WorkspaceStorageBackend:    "github-enterprise",
		GitHubEnterpriseBaseURL:    "https://github.example.com",
		GitHubEnterpriseToken:      "admin-token",
		GitHubEnterpriseRepoPrefix: "movscript-project-",
		GitHubEnterpriseOrgPrefix:  "movscript-org-",
		GitHubEnterpriseBranch:     "main",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "workspace_repository:github-enterprise")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawUserProbe {
		t.Fatal("expected GitHub Enterprise /api/v3/user probe")
	}
}

func TestStartupProviderInstanceTestsGitLabHealth(t *testing.T) {
	var sawUserProbe bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v4/user" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		sawUserProbe = true
		if r.Header.Get("PRIVATE-TOKEN") != "admin-token" {
			t.Fatalf("private token = %q, want token auth", r.Header.Get("PRIVATE-TOKEN"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"username":"admin"}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})
	cfg := &config.Config{
		DependencyProfile:       "custom",
		WorkspaceStorageBackend: "gitlab",
		GitLabBaseURL:           "https://gitlab.example.com",
		GitLabToken:             "admin-token",
		GitLabRepoPrefix:        "movscript-project-",
		GitLabOrgPrefix:         "movscript-org-",
		GitLabBranch:            "main",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "workspace_repository:gitlab")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawUserProbe {
		t.Fatal("expected GitLab /api/v4/user probe")
	}
}

func TestStartupProviderInstanceTestsQdrantHealth(t *testing.T) {
	var sawCollectionProbe bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/collections/shot_vectors" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		sawCollectionProbe = true
		if r.Header.Get("api-key") != "qdrant-token" {
			t.Fatalf("api-key = %q, want token auth", r.Header.Get("api-key"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"result":{"points_count":7}}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})
	cfg := &config.Config{
		DependencyProfile:   "custom",
		VectorIndexProvider: providercontract.AdapterQdrant,
		QdrantBaseURL:       "http://qdrant.local",
		QdrantToken:         "qdrant-token",
		QdrantCollection:    "shot_vectors",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "vector_index:qdrant")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawCollectionProbe {
		t.Fatal("expected Qdrant collection probe")
	}
}

func TestStartupProviderInstanceTestsMinIOBucketHealth(t *testing.T) {
	var sawLocationProbe bool
	var sawBucketProbe bool
	restoreTransport := storage.SetMinIOTransportForTest(roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") == "" {
			t.Fatal("expected signed MinIO request")
		}
		if r.Method == http.MethodGet && r.URL.Path == "/movscript/" && r.URL.Query().Has("location") {
			sawLocationProbe = true
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/xml"}},
				Body:       io.NopCloser(strings.NewReader(`<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></LocationConstraint>`)),
			}, nil
		}
		if r.Method == http.MethodHead && r.URL.Path == "/movscript/" {
			sawBucketProbe = true
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		}
		t.Fatalf("unexpected MinIO request %s %s", r.Method, r.URL.String())
		return nil, nil
	}))
	t.Cleanup(restoreTransport)

	cfg := &config.Config{
		DependencyProfile: "custom",
		StorageBackend:    "minio",
		MinIOEndpoint:     "minio.local",
		MinIOAccessKey:    "access-key",
		MinIOSecretKey:    "secret-key",
		MinIOBucket:       "movscript",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "blob_storage:minio")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawLocationProbe || !sawBucketProbe {
		t.Fatalf("expected MinIO location and bucket health probes, got location=%v bucket=%v", sawLocationProbe, sawBucketProbe)
	}
}

func TestStartupProviderInstanceTestsPostgresPing(t *testing.T) {
	var sawPostgresPing bool
	previousPing := postgresPing
	postgresPing = func(ctx context.Context, cfg *config.Config) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		sawPostgresPing = true
		if cfg.DBHost != "postgres.local" || cfg.DBPort != "5433" || cfg.DBUser != "movscript" || cfg.DBPassword != "db-secret" || cfg.DBName != "movscript_prod" {
			t.Fatalf("postgres cfg = %+v, want configured connection fields", cfg)
		}
		return nil
	}
	t.Cleanup(func() {
		postgresPing = previousPing
	})

	cfg := &config.Config{
		DependencyProfile: "custom",
		DBDriver:          "postgres",
		DBHost:            "postgres.local",
		DBPort:            "5433",
		DBUser:            "movscript",
		DBPassword:        "db-secret",
		DBName:            "movscript_prod",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "database:postgres")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawPostgresPing {
		t.Fatal("expected postgres ping")
	}
}

func TestStartupProviderInstanceRedactsPostgresPingSecret(t *testing.T) {
	previousPing := postgresPing
	postgresPing = func(context.Context, *config.Config) error {
		return errors.New("pq: password db-secret rejected")
	}
	t.Cleanup(func() {
		postgresPing = previousPing
	})

	cfg := &config.Config{
		DependencyProfile: "custom",
		DBDriver:          "postgres",
		DBHost:            "postgres.local",
		DBPort:            "5432",
		DBUser:            "movscript",
		DBPassword:        "db-secret",
		DBName:            "movscript_prod",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "database:postgres")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want failure", result)
	}
	if strings.Contains(result.Message, "db-secret") || !strings.Contains(result.Message, "[redacted]") {
		t.Fatalf("postgres failure message = %q, want redacted password", result.Message)
	}
}

func TestStartupProviderInstanceTestsExternalMediaWorkerHealth(t *testing.T) {
	var sawHealth bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/health" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer media-token" {
			t.Fatalf("authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		sawHealth = true
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	cfg := &config.Config{
		DependencyProfile:       "custom",
		MediaProcessingProvider: providercontract.AdapterExternalMediaWorker,
		MediaWorkerBaseURL:      "http://media-worker.local",
		MediaWorkerToken:        "media-token",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "media_processing:external-worker")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawHealth {
		t.Fatal("expected external media worker /health probe")
	}
}

func TestStartupProviderInstanceTestsRemoteAgentRuntimeHealth(t *testing.T) {
	var sawHealth bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer runtime-token" {
			t.Fatalf("authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/health":
			sawHealth = true
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		case "/capabilities":
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader("")),
			}, nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	cfg := &config.Config{
		DependencyProfile:    "custom",
		AgentRuntimeProvider: providercontract.AdapterRemoteAgentRuntime,
		AgentRuntimeBaseURL:  "http://runtime.local",
		AgentRuntimeToken:    "runtime-token",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "agent_runtime:remote-runtime")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if !result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want success", result)
	}
	if !sawHealth {
		t.Fatal("expected remote runtime /health probe")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func TestStartupProviderInstanceReportsMissingConfig(t *testing.T) {
	cfg := &config.Config{
		DependencyProfile: "custom",
		DBDriver:          "postgres",
		StorageBackend:    "filesystem",
		CacheBackend:      "redis",
	}

	result, err := TestStartupProviderInstance(context.Background(), cfg, "database:postgres")
	if err != nil {
		t.Fatalf("TestStartupProviderInstance returned error: %v", err)
	}
	if result.Success {
		t.Fatalf("TestStartupProviderInstance = %+v, want missing config failure", result)
	}
}
