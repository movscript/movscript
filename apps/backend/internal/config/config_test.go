package config

import "testing"

func TestValidateStartupRequiresStrongSecrets(t *testing.T) {
	cfg := &Config{
		DBHost:            "localhost",
		DBPort:            "5432",
		DBUser:            "postgres",
		DBName:            "movscript",
		ServerPort:        "8765",
		EncryptionKey:     "",
		AuthTokenSecret:   "",
		AuthTokenTTLHours: 24,
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
		DBPort:            "5432",
		DBUser:            "postgres",
		DBName:            "movscript",
		ServerPort:        "8765",
		EncryptionKey:     "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		AuthTokenSecret:   "test-auth-secret",
		AuthTokenTTLHours: 24,
		MinIOEndpoint:     "localhost:9000",
		MinIOAccessKey:    "access",
		MinIOSecretKey:    "secret",
		MinIOBucket:       "movscript",
	}
	if err := cfg.ValidateStartup(); err != nil {
		t.Fatalf("ValidateStartup returned error for valid config: %v", err)
	}
}
