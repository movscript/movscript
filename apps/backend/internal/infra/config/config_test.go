package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultCacheBackendMatchesEditionDefaults(t *testing.T) {
	t.Setenv("CACHE_BACKEND", "")
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "")
	t.Setenv("MOVSCRIPT_APP_MODE", "")
	cfg := Load()
	want := defaultDependencyProviders(defaultDependencyProfile("cloud")).Cache
	if cfg.CacheBackend != want {
		t.Fatalf("default CacheBackend = %q, want %q", cfg.CacheBackend, want)
	}
}

func TestLoadLocalDependencyProfileSelectsLocalProviders(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "local")
	t.Setenv("MOVSCRIPT_DATA_DIR", "/tmp/movscript-test-data")
	cfg := Load()

	got := cfg.EffectiveDependencyProviders()
	if got.Profile != "local" || got.Database != "sqlite" || got.ObjectStorage != "filesystem" || got.WorkspaceStorage != "http" || got.AIGateway != "local" || got.VectorIndex != "local-index" || got.Cache != "memory" || got.MediaProcessing != "desktop-managed" || got.AgentRuntime != "desktop-managed" {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want local sqlite/filesystem/http/local/local-index/memory/desktop-managed/desktop-managed-agent", got)
	}
	if cfg.GitHTTPRoot != "/tmp/movscript-test-data/git" || cfg.GitBinary != "git" {
		t.Fatalf("local Git HTTP config = root %q binary %q, want data dir git defaults", cfg.GitHTTPRoot, cfg.GitBinary)
	}
}

func TestLoadExternalDependencyProfileSelectsExternalProviders(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "external")
	cfg := Load()

	got := cfg.EffectiveDependencyProviders()
	want := defaultDependencyProviders("external")
	if got != want {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want %+v", got, want)
	}
}

func TestLoadProviderEnvOverlayOverridesStartupProviders(t *testing.T) {
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	t.Setenv("MOVSCRIPT_PROVIDER_ENV_PATH", envPath)
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "local")
	t.Setenv("STORAGE_BACKEND", "filesystem")
	if err := os.WriteFile(envPath, []byte("STORAGE_BACKEND=\"minio\"\nMINIO_ENDPOINT=\"minio.example.com\"\nMINIO_BUCKET=\"media\"\nMINIO_ACCESS_KEY=\"access\"\nMINIO_SECRET_KEY=\"secret\"\n"), 0o600); err != nil {
		t.Fatalf("write provider overlay: %v", err)
	}

	cfg := Load()

	if cfg.ProviderEnvPath != envPath {
		t.Fatalf("ProviderEnvPath = %q, want %q", cfg.ProviderEnvPath, envPath)
	}
	if cfg.StorageBackend != "minio" || cfg.MinIOEndpoint != "minio.example.com" || cfg.MinIOBucket != "media" {
		t.Fatalf("provider overlay not applied: storage=%q endpoint=%q bucket=%q", cfg.StorageBackend, cfg.MinIOEndpoint, cfg.MinIOBucket)
	}
}

func TestLoadProviderActivationRolloutWebhookConfig(t *testing.T) {
	t.Setenv("MOVSCRIPT_PROVIDER_ACTIVATION_ROLLOUT_WEBHOOK_URL", "https://deploy.example.com/rollout")
	t.Setenv("MOVSCRIPT_PROVIDER_ACTIVATION_ROLLOUT_WEBHOOK_TOKEN", "token")

	cfg := Load()

	if cfg.ProviderActivationRolloutWebhookURL != "https://deploy.example.com/rollout" {
		t.Fatalf("ProviderActivationRolloutWebhookURL = %q", cfg.ProviderActivationRolloutWebhookURL)
	}
	if cfg.ProviderActivationRolloutWebhookToken != "token" {
		t.Fatalf("ProviderActivationRolloutWebhookToken = %q", cfg.ProviderActivationRolloutWebhookToken)
	}
}

func TestLoadProviderActivationRolloutWebhookLegacyConfig(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPLOYMENT_ROLLOUT_WEBHOOK_URL", "https://legacy.example.com/rollout")
	t.Setenv("MOVSCRIPT_DEPLOYMENT_ROLLOUT_WEBHOOK_TOKEN", "legacy-token")

	cfg := Load()

	if cfg.ProviderActivationRolloutWebhookURL != "https://legacy.example.com/rollout" {
		t.Fatalf("ProviderActivationRolloutWebhookURL = %q", cfg.ProviderActivationRolloutWebhookURL)
	}
	if cfg.ProviderActivationRolloutWebhookToken != "legacy-token" {
		t.Fatalf("ProviderActivationRolloutWebhookToken = %q", cfg.ProviderActivationRolloutWebhookToken)
	}
}

func TestEffectiveProviderAssemblyDescribesStartupProviders(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "local")
	t.Setenv("MOVSCRIPT_DATA_DIR", "/tmp/movscript-test-data")
	cfg := Load()

	assembly := cfg.EffectiveProviderAssembly()
	if assembly.Profile != "local" || assembly.DeploymentProfile != "personal-local" || assembly.AssemblyMode != "startup" {
		t.Fatalf("ProviderAssembly profile = %+v, want local personal-local startup", assembly)
	}
	if len(assembly.Providers) != 8 {
		t.Fatalf("ProviderAssembly providers len = %d, want 8", len(assembly.Providers))
	}
	want := map[string]string{
		"database":             "sqlite",
		"blob_storage":         "filesystem",
		"workspace_repository": "http",
		"ai_gateway":           "local",
		"vector_index":         "local-index",
		"cache":                "memory",
		"media_processing":     "desktop-managed",
		"agent_runtime":        "desktop-managed",
	}
	for _, provider := range assembly.Providers {
		if want[provider.Type] != provider.Adapter {
			t.Fatalf("provider %q adapter = %q, want %q in %+v", provider.Type, provider.Adapter, want[provider.Type], assembly.Providers)
		}
		if provider.Assembly != "startup" || provider.ManagedBy != "profile" || !provider.Configured {
			t.Fatalf("provider %q assembly metadata = %+v, want startup/profile/configured", provider.Type, provider)
		}
	}
}

func TestEffectiveProviderAssemblyMapsExternalProfileToTeamCloud(t *testing.T) {
	cfg := &Config{
		DependencyProfile:       "external",
		DBDriver:                "postgres",
		DBHost:                  "db",
		DBPort:                  "5432",
		DBUser:                  "postgres",
		DBName:                  "movscript",
		StorageBackend:          "minio",
		MinIOEndpoint:           "minio:9000",
		MinIOAccessKey:          "access",
		MinIOSecretKey:          "secret",
		MinIOBucket:             "movscript",
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://gitea:3000",
		GiteaToken:              "token",
		AIGatewayProvider:       "local",
		CacheBackend:            "redis",
		RedisAddr:               "redis:6379",
		MediaProcessingProvider: "external-worker",
		MediaWorkerBaseURL:      "http://media-worker:8767",
		AgentRuntimeProvider:    "remote-runtime",
		AgentRuntimeBaseURL:     "http://runtime:8766",
	}

	assembly := cfg.EffectiveProviderAssembly()
	if assembly.Profile != "external" || assembly.DeploymentProfile != "team-cloud" {
		t.Fatalf("ProviderAssembly profile = %+v, want external team-cloud", assembly)
	}
	for _, provider := range assembly.Providers {
		if !provider.Configured {
			t.Fatalf("provider %q should be configured in external profile assembly: %+v", provider.Type, provider)
		}
	}
}

func TestEffectiveProviderAssemblyKeepsCustomProfileDistinctFromDeploymentMode(t *testing.T) {
	cfg := &Config{
		DependencyProfile: "custom",
		DeploymentMode:    "self-hosted-team",
		DBDriver:          "postgres",
		StorageBackend:    "minio",
		AIGatewayProvider: "local",
		CacheBackend:      "memory",
	}

	assembly := cfg.EffectiveProviderAssembly()
	if assembly.Profile != "custom" || assembly.DeploymentProfile != "custom" {
		t.Fatalf("ProviderAssembly profile = %+v, want custom/custom", assembly)
	}
}

func TestLoadDependencyProfileAllowsComponentOverrides(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "external")
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("STORAGE_BACKEND", "filesystem")
	t.Setenv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", "git-http-backend")
	t.Setenv("MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY", "direct")
	t.Setenv("MOVSCRIPT_VECTOR_INDEX_PROVIDER", "qdrant")
	t.Setenv("MOVSCRIPT_QDRANT_BASE_URL", "http://qdrant.local")
	t.Setenv("CACHE_BACKEND", "memory")
	t.Setenv("MOVSCRIPT_MEDIA_PROCESSING_PROVIDER", "desktop-managed")
	t.Setenv("MOVSCRIPT_MEDIA_WORKER_BASE_URL", "http://media-worker.local")
	t.Setenv("MOVSCRIPT_AGENT_RUNTIME_PROVIDER", "remote-runtime")
	t.Setenv("MOVSCRIPT_AGENT_RUNTIME_BASE_URL", "http://runtime.local")

	cfg := Load()
	got := cfg.EffectiveDependencyProviders()
	wantAIGateway := defaultDependencyProviders("external").AIGateway
	if got.Profile != "external" || got.Database != "sqlite" || got.ObjectStorage != "filesystem" || got.WorkspaceStorage != "http" || got.AIGateway != wantAIGateway || got.VectorIndex != "qdrant" || got.Cache != "memory" || got.MediaProcessing != "desktop-managed" || got.AgentRuntime != "remote-runtime" {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want explicit component overrides", got)
	}
	if cfg.AgentRuntimeBaseURL != "http://runtime.local" {
		t.Fatalf("AgentRuntimeBaseURL = %q, want env override", cfg.AgentRuntimeBaseURL)
	}
	if cfg.MediaWorkerBaseURL != "http://media-worker.local" {
		t.Fatalf("MediaWorkerBaseURL = %q, want env override", cfg.MediaWorkerBaseURL)
	}
	if cfg.WorkspaceCloneURLStrategy != "direct" {
		t.Fatalf("WorkspaceCloneURLStrategy = %q, want env override", cfg.WorkspaceCloneURLStrategy)
	}
}

func TestLoadWorkspaceStorageBackendPrefersStorageEnv(t *testing.T) {
	t.Setenv("MOVSCRIPT_WORKSPACE_BACKEND", "http")
	t.Setenv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", "gitea")
	cfg := Load()
	if cfg.WorkspaceStorageBackend != "gitea" {
		t.Fatalf("WorkspaceStorageBackend = %q, want gitea", cfg.WorkspaceStorageBackend)
	}
}

func TestLoadWorkspaceStorageBackendNormalizesGitHubEnterpriseAliases(t *testing.T) {
	t.Setenv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", "ghe")
	t.Setenv("MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL", "https://github.example.com")
	t.Setenv("MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN", "token")

	cfg := Load()

	if cfg.WorkspaceStorageBackend != "github-enterprise" {
		t.Fatalf("WorkspaceStorageBackend = %q, want github-enterprise", cfg.WorkspaceStorageBackend)
	}
	if cfg.GitHubEnterpriseBaseURL != "https://github.example.com" || cfg.GitHubEnterpriseToken != "token" {
		t.Fatalf("GitHub Enterprise config = baseURL %q token %q", cfg.GitHubEnterpriseBaseURL, cfg.GitHubEnterpriseToken)
	}
}

func TestLoadWorkspaceStorageBackendNormalizesGitLabAliases(t *testing.T) {
	t.Setenv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", "gitlab-self-hosted")
	t.Setenv("MOVSCRIPT_GITLAB_BASE_URL", "https://gitlab.example.com")
	t.Setenv("MOVSCRIPT_GITLAB_TOKEN", "token")

	cfg := Load()

	if cfg.WorkspaceStorageBackend != "gitlab" {
		t.Fatalf("WorkspaceStorageBackend = %q, want gitlab", cfg.WorkspaceStorageBackend)
	}
	if cfg.GitLabBaseURL != "https://gitlab.example.com" || cfg.GitLabToken != "token" {
		t.Fatalf("GitLab config = baseURL %q token %q", cfg.GitLabBaseURL, cfg.GitLabToken)
	}
}

func TestValidateStartupRequiresStrongSecrets(t *testing.T) {
	cfg := &Config{
		DBHost:            "localhost",
		DBDriver:          "postgres",
		DBPort:            "5432",
		DBUser:            "postgres",
		DBName:            "movscript",
		ServerPort:        "8765",
		EncryptionKey:     "",
		AuthTokenSecret:   "",
		AuthTokenTTLHours: 24,
		StorageBackend:    "minio",
		MinIOEndpoint:     "localhost:9000",
		MinIOAccessKey:    "access",
		MinIOSecretKey:    "secret",
		MinIOBucket:       "movscript",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for missing required secrets")
	}
}

func TestValidateStartupAcceptsValidConfig(t *testing.T) {
	cfg := &Config{
		DBHost:            "localhost",
		DBDriver:          "postgres",
		DBPort:            "5432",
		DBUser:            "postgres",
		DBName:            "movscript",
		ServerPort:        "8765",
		EncryptionKey:     "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:   "test-auth-secret",
		AuthTokenTTLHours: 24,
		NewAPIBaseURL:     "http://new-api.local",
		StorageBackend:    "minio",
		MinIOEndpoint:     "localhost:9000",
		MinIOAccessKey:    "access",
		MinIOSecretKey:    "secret",
		MinIOBucket:       "movscript",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for valid config: %v", err)
	}
}

func TestValidateStartupAcceptsFilesystemStorage(t *testing.T) {
	cfg := &Config{
		DBHost:                "localhost",
		DBDriver:              "postgres",
		DBPort:                "5432",
		DBUser:                "postgres",
		DBName:                "movscript",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		NewAPIBaseURL:         "http://new-api.local",
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for filesystem storage config: %v", err)
	}
}

func TestValidateStartupAcceptsSQLiteConfig(t *testing.T) {
	cfg := &Config{
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		NewAPIBaseURL:         "http://new-api.local",
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for sqlite config: %v", err)
	}
}

func TestValidateStartupAcceptsLocalGitHTTPWorkspaceStorage(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		NewAPIBaseURL:           "http://new-api.local",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "http",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for local Git HTTP workspace storage config: %v", err)
	}
}

func TestValidateStartupAcceptsCacheBackends(t *testing.T) {
	for _, backend := range []string{"", "noop", "memory", "redis"} {
		cfg := &Config{
			DBDriver:              "sqlite",
			DBPath:                t.TempDir() + "/movscript.db",
			ServerPort:            "8765",
			EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			AuthTokenSecret:       "test-auth-secret",
			AuthTokenTTLHours:     24,
			NewAPIBaseURL:         "http://new-api.local",
			StorageBackend:        "filesystem",
			FilesystemStorageRoot: t.TempDir(),
			CacheBackend:          backend,
			RedisAddr:             "localhost:6379",
		}
		if err := cfg.ValidateStartup(); err != nil {
			t.Fatalf("ValidateStartup returned error for cache backend %q: %v", backend, err)
		}
	}
}

func TestValidateStartupRequiresGiteaManagementCredentialForGiteaWorkspaceStorage(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		NewAPIBaseURL:           "http://new-api.local",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://localhost:3003",
		GiteaOrgPrefix:          "movscript-org-",
		GiteaRepoPrefix:         "movscript-project-",
		GiteaBranch:             "main",
		GiteaUserEmailDomain:    "users.movscript.local",
		GiteaUserTokenName:      "movscript-desktop",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for missing Gitea management credential")
	}
}

func TestValidateStartupAcceptsGitHubEnterpriseWorkspaceStorage(t *testing.T) {
	cfg := &Config{
		DBDriver:                   "sqlite",
		DBPath:                     t.TempDir() + "/movscript.db",
		ServerPort:                 "8765",
		EncryptionKey:              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:            "test-auth-secret",
		AuthTokenTTLHours:          24,
		NewAPIBaseURL:              "http://new-api.local",
		StorageBackend:             "filesystem",
		FilesystemStorageRoot:      t.TempDir(),
		WorkspaceStorageBackend:    "github-enterprise",
		GitHubEnterpriseBaseURL:    "https://github.example.com",
		GitHubEnterpriseToken:      "token",
		GitHubEnterpriseOrgPrefix:  "movscript-org-",
		GitHubEnterpriseRepoPrefix: "movscript-project-",
		GitHubEnterpriseBranch:     "main",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for GitHub Enterprise workspace storage: %v", err)
	}
}

func TestValidateStartupRequiresGitHubEnterpriseToken(t *testing.T) {
	cfg := &Config{
		DBDriver:                   "sqlite",
		DBPath:                     t.TempDir() + "/movscript.db",
		ServerPort:                 "8765",
		EncryptionKey:              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:            "test-auth-secret",
		AuthTokenTTLHours:          24,
		StorageBackend:             "filesystem",
		FilesystemStorageRoot:      t.TempDir(),
		WorkspaceStorageBackend:    "github-enterprise",
		GitHubEnterpriseBaseURL:    "https://github.example.com",
		GitHubEnterpriseOrgPrefix:  "movscript-org-",
		GitHubEnterpriseRepoPrefix: "movscript-project-",
		GitHubEnterpriseBranch:     "main",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for missing GitHub Enterprise token")
	}
}

func TestValidateStartupAcceptsGitLabWorkspaceStorage(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		NewAPIBaseURL:           "http://new-api.local",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "gitlab",
		GitLabBaseURL:           "https://gitlab.example.com",
		GitLabToken:             "token",
		GitLabOrgPrefix:         "movscript-org-",
		GitLabRepoPrefix:        "movscript-project-",
		GitLabBranch:            "main",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for GitLab workspace storage: %v", err)
	}
}

func TestValidateStartupRequiresGitLabToken(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		NewAPIBaseURL:           "http://new-api.local",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "gitlab",
		GitLabBaseURL:           "https://gitlab.example.com",
		GitLabOrgPrefix:         "movscript-org-",
		GitLabRepoPrefix:        "movscript-project-",
		GitLabBranch:            "main",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for missing GitLab token")
	}
}

func TestValidateStartupAcceptsGiteaAdminBasicCredential(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		NewAPIBaseURL:           "http://new-api.local",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://localhost:3003",
		GiteaAdminUsername:      "movscript",
		GiteaAdminPassword:      "movscript12345",
		GiteaOrgPrefix:          "movscript-org-",
		GiteaRepoPrefix:         "movscript-project-",
		GiteaBranch:             "main",
		GiteaUserEmailDomain:    "users.movscript.local",
		GiteaUserTokenName:      "movscript-desktop",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for Gitea admin BasicAuth credential: %v", err)
	}
}

func TestValidateStartupRejectsInvalidDependencyProfile(t *testing.T) {
	cfg := &Config{
		DependencyProfile:     "surprise",
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memory",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid dependency profile")
	}
}

func TestValidateStartupHandlesUnknownAIGatewayProviderByEdition(t *testing.T) {
	cfg := &Config{
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memory",
		AIGatewayProvider:     "mystery",
	}
	_, editionOwnsAIGateway := editionAIGatewayProvider(cfg)
	err := cfg.ValidateStartup()
	if editionOwnsAIGateway {
		if err == nil {
			t.Fatal("ValidateStartup returned nil for unknown edition AI gateway provider")
		}
		return
	}
	if err != nil {
		t.Fatalf("ValidateStartup returned error = %v", err)
	}
	if cfg.AIGatewayProvider != "local" {
		t.Fatalf("AIGatewayProvider = %q, want local", cfg.AIGatewayProvider)
	}
}

func TestValidateStartupRejectsInvalidCacheBackend(t *testing.T) {
	cfg := &Config{
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memcached",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid cache backend")
	}
}

func TestValidateStartupRejectsInvalidMediaProcessingProvider(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		CacheBackend:            "memory",
		MediaProcessingProvider: "imaginary",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid media processing provider")
	}
}

func TestValidateStartupRequiresExternalMediaWorkerBaseURL(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		CacheBackend:            "memory",
		MediaProcessingProvider: "external-worker",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for external media worker without base URL")
	}
}

func TestValidateStartupRejectsInvalidAgentRuntimeProvider(t *testing.T) {
	cfg := &Config{
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memory",
		AgentRuntimeProvider:  "imaginary",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid agent runtime provider")
	}
}

func TestValidateStartupRejectsInvalidWorkspaceCloneURLStrategy(t *testing.T) {
	cfg := &Config{
		DBDriver:                  "sqlite",
		DBPath:                    t.TempDir() + "/movscript.db",
		ServerPort:                "8765",
		EncryptionKey:             "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:           "test-auth-secret",
		AuthTokenTTLHours:         24,
		StorageBackend:            "filesystem",
		FilesystemStorageRoot:     t.TempDir(),
		CacheBackend:              "memory",
		WorkspaceCloneURLStrategy: "signed",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid workspace clone URL strategy")
	}
}

func TestValidateStartupRequiresRemoteAgentRuntimeBaseURL(t *testing.T) {
	cfg := &Config{
		DBDriver:              "sqlite",
		DBPath:                t.TempDir() + "/movscript.db",
		ServerPort:            "8765",
		EncryptionKey:         "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:       "test-auth-secret",
		AuthTokenTTLHours:     24,
		StorageBackend:        "filesystem",
		FilesystemStorageRoot: t.TempDir(),
		CacheBackend:          "memory",
		AgentRuntimeProvider:  "remote-runtime",
	}
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for remote agent runtime without base URL")
	}
}
