package config

import "testing"

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
