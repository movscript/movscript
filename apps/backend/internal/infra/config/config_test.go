package config

import "testing"

func TestLoadDefaultCacheBackendIsMemory(t *testing.T) {
	t.Setenv("CACHE_BACKEND", "")
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "")
	t.Setenv("MOVSCRIPT_APP_MODE", "")
	cfg := Load()
	if cfg.CacheBackend != "memory" {
		t.Fatalf("default CacheBackend = %q, want memory", cfg.CacheBackend)
	}
}

func TestLoadLocalDependencyProfileSelectsLocalProviders(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "local")
	t.Setenv("MOVSCRIPT_DATA_DIR", "/tmp/movscript-test-data")
	cfg := Load()

	got := cfg.EffectiveDependencyProviders()
	if got.Profile != "local" || got.Database != "sqlite" || got.ObjectStorage != "filesystem" || got.WorkspaceStorage != "http" || got.AIGateway != "local" || got.Cache != "memory" {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want local sqlite/filesystem/http/local/memory", got)
	}
	if cfg.GitHTTPRoot != "/tmp/movscript-test-data/git" || cfg.GitBinary != "git" {
		t.Fatalf("local Git HTTP config = root %q binary %q, want data dir git defaults", cfg.GitHTTPRoot, cfg.GitBinary)
	}
}

func TestLoadExternalDependencyProfileSelectsExternalProviders(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "external")
	cfg := Load()

	got := cfg.EffectiveDependencyProviders()
	if got.Profile != "external" || got.Database != "postgres" || got.ObjectStorage != "minio" || got.WorkspaceStorage != "gitea" || got.AIGateway != "new-api" || got.Cache != "redis" {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want external postgres/minio/gitea/new-api/redis", got)
	}
}

func TestLoadDependencyProfileAllowsComponentOverrides(t *testing.T) {
	t.Setenv("MOVSCRIPT_DEPENDENCY_PROFILE", "external")
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("STORAGE_BACKEND", "filesystem")
	t.Setenv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", "git-http-backend")
	t.Setenv("MOVSCRIPT_AI_GATEWAY_PROVIDER", "local")
	t.Setenv("CACHE_BACKEND", "memory")

	cfg := Load()
	got := cfg.EffectiveDependencyProviders()
	if got.Profile != "external" || got.Database != "sqlite" || got.ObjectStorage != "filesystem" || got.WorkspaceStorage != "http" || got.AIGateway != "local" || got.Cache != "memory" {
		t.Fatalf("EffectiveDependencyProviders() = %+v, want explicit component overrides", got)
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

func TestValidateStartupAcceptsGiteaAdminBasicCredential(t *testing.T) {
	cfg := &Config{
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		ServerPort:              "8765",
		EncryptionKey:           "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:         "test-auth-secret",
		AuthTokenTTLHours:       24,
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

func TestValidateStartupRejectsInvalidAIGatewayProvider(t *testing.T) {
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
	if err := cfg.ValidateStartup(); err == nil {
		t.Fatal("ValidateStartup returned nil for invalid AI gateway provider")
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
