package config

import "testing"

func TestLoadDefaultCacheBackendIsMemory(t *testing.T) {
	t.Setenv("CACHE_BACKEND", "")
	cfg := Load()
	if cfg.CacheBackend != "memory" {
		t.Fatalf("default CacheBackend = %q, want memory", cfg.CacheBackend)
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
