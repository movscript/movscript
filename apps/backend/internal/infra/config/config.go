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
	AppMode            string
	DeploymentMode     string
	DataDir            string
	DBDriver           string
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	DBPath             string
	ServerPort         string
	EncryptionKey      string // 32-byte hex string for AES-256-GCM
	MCPToken           string // optional Bearer token for MCP endpoint; empty = no auth
	AuthTokenSecret    string
	AuthTokenTTLHours  int
	HubAdminToken      string
	CORSAllowedOrigins []string
	AdminStaticDir     string

	// Object storage
	StorageBackend string

	// Filesystem object storage
	FilesystemStorageRoot string

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
	dataDir := getEnv("MOVSCRIPT_DATA_DIR", defaultDataDir())
	return &Config{
		AppMode:            getEnv("MOVSCRIPT_APP_MODE", "cloud"),
		DeploymentMode:     getEnv("MOVSCRIPT_DEPLOYMENT_MODE", defaultDeploymentMode(getEnv("MOVSCRIPT_APP_MODE", "cloud"))),
		DataDir:            dataDir,
		DBDriver:           getEnv("DB_DRIVER", "postgres"),
		DBHost:             getEnv("DB_HOST", "localhost"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "postgres"),
		DBPassword:         getEnv("DB_PASSWORD", "postgres"),
		DBName:             getEnv("DB_NAME", "movscript"),
		DBPath:             getEnv("DB_PATH", dataDir+"/movscript.db"),
		ServerPort:         getEnv("SERVER_PORT", "8765"),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", ""),
		MCPToken:           getEnv("MCP_TOKEN", ""),
		AuthTokenSecret:    authSecret,
		AuthTokenTTLHours:  getEnvInt("AUTH_TOKEN_TTL_HOURS", 24),
		HubAdminToken:      getEnv("HUB_ADMIN_TOKEN", ""),
		CORSAllowedOrigins: getEnvCSV("MOVSCRIPT_CORS_ALLOWED_ORIGINS", defaultCORSAllowedOrigins()),
		AdminStaticDir:     getEnv("MOVSCRIPT_ADMIN_DIR", "admin"),

		StorageBackend:        getEnv("STORAGE_BACKEND", "minio"),
		FilesystemStorageRoot: getEnv("FILESYSTEM_STORAGE_ROOT", dataDir+"/resources"),

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
	switch c.DBDriver {
	case "postgres":
		if c.DBHost == "" || c.DBPort == "" || c.DBUser == "" || c.DBName == "" {
			problems = append(problems, "database settings DB_HOST, DB_PORT, DB_USER, and DB_NAME are required when DB_DRIVER=postgres")
		}
	case "sqlite":
		if c.DBPath == "" {
			problems = append(problems, "DB_PATH or MOVSCRIPT_DATA_DIR is required when DB_DRIVER=sqlite")
		}
	default:
		problems = append(problems, "DB_DRIVER must be one of: postgres, sqlite")
	}
	switch c.StorageBackend {
	case "minio":
		if c.MinIOEndpoint == "" || c.MinIOAccessKey == "" || c.MinIOSecretKey == "" || c.MinIOBucket == "" {
			problems = append(problems, "MinIO settings MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET are required when STORAGE_BACKEND=minio")
		}
	case "filesystem":
		if c.FilesystemStorageRoot == "" {
			problems = append(problems, "FILESYSTEM_STORAGE_ROOT or MOVSCRIPT_DATA_DIR is required when STORAGE_BACKEND=filesystem")
		}
	default:
		problems = append(problems, "STORAGE_BACKEND must be one of: minio, filesystem")
	}
	if len(problems) > 0 {
		return errors.New("invalid startup configuration: " + joinProblems(problems))
	}
	return nil
}

func (c *Config) SafeSummary() map[string]any {
	return map[string]any{
		"app_mode":             c.AppMode,
		"deployment_mode":      c.DeploymentMode,
		"data_dir":             c.DataDir,
		"db_driver":            c.DBDriver,
		"db_host":              c.DBHost,
		"db_port":              c.DBPort,
		"db_name":              c.DBName,
		"db_path":              c.DBPath,
		"server_port":          c.ServerPort,
		"auth_ttl_hours":       c.AuthTokenTTLHours,
		"cors_allowed_origins": c.CORSAllowedOrigins,
		"storage_backend":      c.StorageBackend,
		"filesystem_root":      c.FilesystemStorageRoot,
		"minio_endpoint":       c.MinIOEndpoint,
		"minio_bucket":         c.MinIOBucket,
		"minio_use_ssl":        c.MinIOUseSSL,
		"mcp_token_set":        c.MCPToken != "",
		"auth_secret_set":      c.AuthTokenSecret != "",
		"hub_admin_token_set":  c.HubAdminToken != "",
		"admin_static_dir":     c.AdminStaticDir,
	}
}

func defaultDeploymentMode(appMode string) string {
	switch appMode {
	case "local":
		return "personal-local"
	default:
		return "self-hosted-team"
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

func defaultDataDir() string {
	if dir, err := os.UserHomeDir(); err == nil && dir != "" {
		return dir + "/.movscript"
	}
	return ".movscript"
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
