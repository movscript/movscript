package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost            string
	DBPort            string
	DBUser            string
	DBPassword        string
	DBName            string
	ServerPort        string
	EncryptionKey     string // 32-byte hex string for AES-256-GCM
	MCPToken          string // optional Bearer token for MCP endpoint; empty = no auth
	AuthTokenSecret   string
	AuthTokenTTLHours int

	// MinIO object storage
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string
	MinIOUseSSL    bool
}

func Load() *Config {
	_ = godotenv.Load()

	authSecret := getEnv("AUTH_TOKEN_SECRET", getEnv("ENCRYPTION_KEY", ""))
	return &Config{
		DBHost:            getEnv("DB_HOST", "localhost"),
		DBPort:            getEnv("DB_PORT", "5432"),
		DBUser:            getEnv("DB_USER", "postgres"),
		DBPassword:        getEnv("DB_PASSWORD", "postgres"),
		DBName:            getEnv("DB_NAME", "movscript"),
		ServerPort:        getEnv("SERVER_PORT", "8765"),
		EncryptionKey:     getEnv("ENCRYPTION_KEY", ""),
		MCPToken:          getEnv("MCP_TOKEN", ""),
		AuthTokenSecret:   authSecret,
		AuthTokenTTLHours: getEnvInt("AUTH_TOKEN_TTL_HOURS", 24),

		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "movscript"),
		MinIOUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
