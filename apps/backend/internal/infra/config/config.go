package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	ServerPort         string
	EncryptionKey      string // 32-byte hex string for AES-256-GCM
	MCPToken           string // optional Bearer token for MCP endpoint; empty = no auth
	AuthTokenSecret    string
	AuthTokenTTLHours  int
	HubAdminToken      string
	CORSAllowedOrigins []string

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
		DBHost:             getEnv("DB_HOST", "localhost"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "postgres"),
		DBPassword:         getEnv("DB_PASSWORD", "postgres"),
		DBName:             getEnv("DB_NAME", "movscript"),
		ServerPort:         getEnv("SERVER_PORT", "8765"),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", ""),
		MCPToken:           getEnv("MCP_TOKEN", ""),
		AuthTokenSecret:    authSecret,
		AuthTokenTTLHours:  getEnvInt("AUTH_TOKEN_TTL_HOURS", 24),
		HubAdminToken:      getEnv("HUB_ADMIN_TOKEN", ""),
		CORSAllowedOrigins: getEnvCSV("MOVSCRIPT_CORS_ALLOWED_ORIGINS", defaultCORSAllowedOrigins()),

		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "movscript"),
		MinIOUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
	}
}

func (c *Config) ValidateStartup() error {
	var problems []string
	if key, err := hex.DecodeString(c.EncryptionKey); err != nil || len(key) != 32 {
		problems = append(problems, "ENCRYPTION_KEY must be a 64-character hex string (generate one with: openssl rand -hex 32)")
	}
	if c.AuthTokenSecret == "" {
		problems = append(problems, "AUTH_TOKEN_SECRET must be set")
	}
	if c.AuthTokenTTLHours <= 0 {
		problems = append(problems, "AUTH_TOKEN_TTL_HOURS must be greater than 0")
	}
	if c.DBHost == "" || c.DBPort == "" || c.DBUser == "" || c.DBName == "" {
		problems = append(problems, "database settings DB_HOST, DB_PORT, DB_USER, and DB_NAME are required")
	}
	if c.MinIOEndpoint == "" || c.MinIOAccessKey == "" || c.MinIOSecretKey == "" || c.MinIOBucket == "" {
		problems = append(problems, "MinIO settings MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET are required")
	}
	if len(problems) > 0 {
		return errors.New("invalid startup configuration: " + joinProblems(problems))
	}
	return nil
}

func (c *Config) SafeSummary() map[string]any {
	return map[string]any{
		"db_host":              c.DBHost,
		"db_port":              c.DBPort,
		"db_name":              c.DBName,
		"server_port":          c.ServerPort,
		"auth_ttl_hours":       c.AuthTokenTTLHours,
		"cors_allowed_origins": c.CORSAllowedOrigins,
		"minio_endpoint":       c.MinIOEndpoint,
		"minio_bucket":         c.MinIOBucket,
		"minio_use_ssl":        c.MinIOUseSSL,
		"mcp_token_set":        c.MCPToken != "",
		"auth_secret_set":      c.AuthTokenSecret != "",
		"hub_admin_token_set":  c.HubAdminToken != "",
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

func getEnvCSV(key string, fallback []string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	if len(values) == 0 {
		return fallback
	}
	return values
}

func defaultCORSAllowedOrigins() []string {
	return []string{
		"http://localhost:3001",
		"http://127.0.0.1:3001",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:5174",
		"http://127.0.0.1:5174",
	}
}

func joinProblems(problems []string) string {
	if len(problems) == 0 {
		return ""
	}
	out := ""
	for i, problem := range problems {
		if i > 0 {
			out += "; "
		}
		out += fmt.Sprintf("%d. %s", i+1, problem)
	}
	return out
}
