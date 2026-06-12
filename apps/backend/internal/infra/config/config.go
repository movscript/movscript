package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	AppMode            string
	DeploymentMode     string
	DependencyProfile  string
	Dependencies       DependencyProviders
	DataDir            string
	DBDriver           string
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	DBPath             string
	DBSlowThresholdMS  int
	ServerPort         string
	MaxUploadBytes     int64
	EncryptionKey      string // 32-byte hex string for AES-256-GCM
	MCPToken           string // optional Bearer token for MCP endpoint; empty = no auth
	AuthTokenSecret    string
	AuthTokenTTLHours  int
	HubAdminToken      string
	CORSAllowedOrigins []string
	AdminStaticDir     string

	// Server-side workspace storage. Clients always use the MovScript HTTP API.
	WorkspaceStorageBackend string
	GiteaBaseURL            string
	GiteaToken              string
	GiteaAdminUsername      string
	GiteaAdminPassword      string
	GiteaOrgPrefix          string
	GiteaRepo               string
	GiteaRepoPrefix         string
	GiteaBranch             string
	GiteaUserEmailDomain    string
	GiteaUserTokenName      string
	GitHTTPRoot             string
	GitBinary               string

	// Cache
	CacheBackend   string
	CacheKeyPrefix string
	RedisURL       string
	RedisAddr      string
	RedisUsername  string
	RedisPassword  string
	RedisDB        int

	// Object storage
	StorageBackend     string
	ImageVerifyBaseURL string
	ImageVerifyAPIKey  string
	AIGatewayProvider  string

	// Filesystem object storage
	FilesystemStorageRoot string

	// MinIO object storage
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string
	MinIOUseSSL    bool
}

type DependencyProviders struct {
	Profile          string `json:"profile"`
	Database         string `json:"database"`
	ObjectStorage    string `json:"object_storage"`
	WorkspaceStorage string `json:"workspace_storage"`
	AIGateway        string `json:"ai_gateway"`
	Cache            string `json:"cache"`
}

func Load() *Config {
	_ = godotenv.Load()

	authSecret := getEnv("AUTH_TOKEN_SECRET", getEnv("ENCRYPTION_KEY", ""))
	dataDir := getEnv("MOVSCRIPT_DATA_DIR", defaultDataDir())
	appMode := getEnv("MOVSCRIPT_APP_MODE", "cloud")
	profile := normalizeDependencyProfile(getEnv("MOVSCRIPT_DEPENDENCY_PROFILE", defaultDependencyProfile(appMode)))
	providers := defaultDependencyProviders(profile)
	cfg := &Config{
		AppMode:            getEnv("MOVSCRIPT_APP_MODE", "cloud"),
		DeploymentMode:     getEnv("MOVSCRIPT_DEPLOYMENT_MODE", defaultDeploymentMode(appMode)),
		DependencyProfile:  profile,
		DataDir:            dataDir,
		DBDriver:           getEnv("DB_DRIVER", providers.Database),
		DBHost:             getEnv("DB_HOST", "localhost"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "postgres"),
		DBPassword:         getEnv("DB_PASSWORD", "postgres"),
		DBName:             getEnv("DB_NAME", "movscript"),
		DBPath:             getEnv("DB_PATH", filepath.Join(dataDir, "movscript.db")),
		DBSlowThresholdMS:  getEnvInt("DB_SLOW_THRESHOLD_MS", 200),
		ServerPort:         getEnv("SERVER_PORT", "8765"),
		MaxUploadBytes:     getEnvInt64("MAX_UPLOAD_BYTES", 100*1024*1024),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", ""),
		MCPToken:           getEnv("MCP_TOKEN", ""),
		AuthTokenSecret:    authSecret,
		AuthTokenTTLHours:  getEnvInt("AUTH_TOKEN_TTL_HOURS", 24),
		HubAdminToken:      getEnv("HUB_ADMIN_TOKEN", ""),
		CORSAllowedOrigins: getEnvCSV("MOVSCRIPT_CORS_ALLOWED_ORIGINS", defaultCORSAllowedOrigins()),
		AdminStaticDir:     getEnv("MOVSCRIPT_ADMIN_DIR", "admin"),

		WorkspaceStorageBackend: normalizeWorkspaceStorageBackend(getEnv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", getEnv("MOVSCRIPT_WORKSPACE_BACKEND", providers.WorkspaceStorage))),
		GiteaBaseURL:            getEnv("MOVSCRIPT_GITEA_BASE_URL", ""),
		GiteaToken:              getEnv("MOVSCRIPT_GITEA_TOKEN", ""),
		GiteaAdminUsername:      getEnv("MOVSCRIPT_GITEA_ADMIN_USERNAME", getEnv("GITEA_ADMIN_USERNAME", "")),
		GiteaAdminPassword:      getEnv("MOVSCRIPT_GITEA_ADMIN_PASSWORD", getEnv("GITEA_ADMIN_PASSWORD", "")),
		GiteaOrgPrefix:          getEnv("MOVSCRIPT_GITEA_ORG_PREFIX", "movscript-org-"),
		GiteaRepo:               getEnv("MOVSCRIPT_GITEA_REPO", ""),
		GiteaRepoPrefix:         getEnv("MOVSCRIPT_GITEA_REPO_PREFIX", "movscript-project-"),
		GiteaBranch:             getEnv("MOVSCRIPT_GITEA_BRANCH", "main"),
		GiteaUserEmailDomain:    getEnv("MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN", "users.movscript.local"),
		GiteaUserTokenName:      getEnv("MOVSCRIPT_GITEA_USER_TOKEN_NAME", "movscript-desktop"),
		GitHTTPRoot:             getEnv("MOVSCRIPT_GIT_HTTP_ROOT", filepath.Join(dataDir, "git")),
		GitBinary:               getEnv("MOVSCRIPT_GIT_BINARY", "git"),

		CacheBackend:   getEnv("CACHE_BACKEND", providers.Cache),
		CacheKeyPrefix: getEnv("CACHE_KEY_PREFIX", "movscript"),
		RedisURL:       getEnv("REDIS_URL", ""),
		RedisAddr:      getEnv("REDIS_ADDR", "localhost:6379"),
		RedisUsername:  getEnv("REDIS_USERNAME", ""),
		RedisPassword:  getEnv("REDIS_PASSWORD", ""),
		RedisDB:        getEnvInt("REDIS_DB", 0),

		StorageBackend:        getEnv("STORAGE_BACKEND", providers.ObjectStorage),
		ImageVerifyBaseURL:    getEnv("IMAGE_VERIFY_BASE_URL", ""),
		ImageVerifyAPIKey:     getEnv("IMAGE_VERIFY_API_KEY", ""),
		AIGatewayProvider:     getEnv("MOVSCRIPT_AI_GATEWAY_PROVIDER", providers.AIGateway),
		FilesystemStorageRoot: getEnv("FILESYSTEM_STORAGE_ROOT", filepath.Join(dataDir, "resources")),

		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "movscript"),
		MinIOUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
	}
	cfg.Dependencies = cfg.EffectiveDependencyProviders()
	return cfg
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
	if c.MaxUploadBytes < 0 {
		problems = append(problems, "MAX_UPLOAD_BYTES must be greater than or equal to 0")
	}
	switch normalizeDependencyProfile(c.DependencyProfile) {
	case "", "custom", "local", "external":
	default:
		problems = append(problems, "MOVSCRIPT_DEPENDENCY_PROFILE must be one of: custom, local, external")
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
	switch c.CacheBackend {
	case "", "noop", "memory", "redis":
	default:
		problems = append(problems, "CACHE_BACKEND must be one of: noop, memory, redis")
	}
	if c.CacheBackend == "redis" && c.RedisURL == "" && c.RedisAddr == "" {
		problems = append(problems, "REDIS_URL or REDIS_ADDR is required when CACHE_BACKEND=redis")
	}
	workspaceStorageBackend := normalizeWorkspaceStorageBackend(c.WorkspaceStorageBackend)
	switch workspaceStorageBackend {
	case "", "http", "gitea":
	default:
		problems = append(problems, "MOVSCRIPT_WORKSPACE_STORAGE_BACKEND must be one of: http, gitea")
	}
	switch strings.TrimSpace(c.AIGatewayProvider) {
	case "", "builtin", "local", "new-api":
	default:
		problems = append(problems, "MOVSCRIPT_AI_GATEWAY_PROVIDER must be one of: builtin, local, new-api")
	}
	if workspaceStorageBackend == "gitea" {
		if c.GiteaBaseURL == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_BASE_URL is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaToken == "" && (strings.TrimSpace(c.GiteaAdminUsername) == "" || strings.TrimSpace(c.GiteaAdminPassword) == "") {
			problems = append(problems, "MOVSCRIPT_GITEA_TOKEN or MOVSCRIPT_GITEA_ADMIN_USERNAME/MOVSCRIPT_GITEA_ADMIN_PASSWORD is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaRepoPrefix == "" && c.GiteaRepo == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_REPO_PREFIX or MOVSCRIPT_GITEA_REPO is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaBranch == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_BRANCH is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaOrgPrefix == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_ORG_PREFIX is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaUserEmailDomain == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
		if c.GiteaUserTokenName == "" {
			problems = append(problems, "MOVSCRIPT_GITEA_USER_TOKEN_NAME is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitea")
		}
	}
	if workspaceStorageBackend == "http" {
		if c.GitHTTPRoot == "" {
			problems = append(problems, "MOVSCRIPT_GIT_HTTP_ROOT or MOVSCRIPT_DATA_DIR is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=http")
		}
		if c.GitBinary == "" {
			problems = append(problems, "MOVSCRIPT_GIT_BINARY is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=http")
		}
	}
	if len(problems) > 0 {
		return errors.New("invalid startup configuration: " + joinProblems(problems))
	}
	return nil
}

func (c *Config) SafeSummary() map[string]any {
	return map[string]any{
		"app_mode":                  c.AppMode,
		"deployment_mode":           c.DeploymentMode,
		"dependency_profile":        c.DependencyProfile,
		"dependency_providers":      c.EffectiveDependencyProviders(),
		"data_dir":                  c.DataDir,
		"db_driver":                 c.DBDriver,
		"db_host":                   c.DBHost,
		"db_port":                   c.DBPort,
		"db_name":                   c.DBName,
		"db_path":                   c.DBPath,
		"db_slow_threshold_ms":      c.DBSlowThresholdMS,
		"server_port":               c.ServerPort,
		"max_upload_bytes":          c.MaxUploadBytes,
		"auth_ttl_hours":            c.AuthTokenTTLHours,
		"cors_allowed_origins":      c.CORSAllowedOrigins,
		"storage_backend":           c.StorageBackend,
		"ai_gateway_provider":       c.AIGatewayProvider,
		"image_verify_set":          c.ImageVerifyBaseURL != "",
		"filesystem_root":           c.FilesystemStorageRoot,
		"minio_endpoint":            c.MinIOEndpoint,
		"minio_bucket":              c.MinIOBucket,
		"minio_use_ssl":             c.MinIOUseSSL,
		"mcp_token_set":             c.MCPToken != "",
		"auth_secret_set":           c.AuthTokenSecret != "",
		"hub_admin_token_set":       c.HubAdminToken != "",
		"admin_static_dir":          c.AdminStaticDir,
		"cache_backend":             c.CacheBackend,
		"cache_key_prefix":          c.CacheKeyPrefix,
		"redis_addr":                c.RedisAddr,
		"redis_url_set":             c.RedisURL != "",
		"redis_db":                  c.RedisDB,
		"workspace_storage_backend": c.WorkspaceStorageBackend,
		"gitea_base_url":            c.GiteaBaseURL,
		"gitea_token_set":           c.GiteaToken != "",
		"gitea_admin_username":      c.GiteaAdminUsername,
		"gitea_admin_password_set":  strings.TrimSpace(c.GiteaAdminPassword) != "",
		"gitea_org_prefix":          c.GiteaOrgPrefix,
		"gitea_repo_set":            c.GiteaRepo != "",
		"gitea_repo_prefix":         c.GiteaRepoPrefix,
		"gitea_branch":              c.GiteaBranch,
		"gitea_user_email_domain":   c.GiteaUserEmailDomain,
		"gitea_user_token_name":     c.GiteaUserTokenName,
		"git_http_root":             c.GitHTTPRoot,
		"git_binary":                c.GitBinary,
	}
}

func (c *Config) EffectiveDependencyProviders() DependencyProviders {
	if c == nil {
		return defaultDependencyProviders("custom")
	}
	profile := normalizeDependencyProfile(c.DependencyProfile)
	if profile == "" {
		profile = "custom"
	}
	return DependencyProviders{
		Profile:          profile,
		Database:         strings.TrimSpace(c.DBDriver),
		ObjectStorage:    strings.TrimSpace(c.StorageBackend),
		WorkspaceStorage: normalizeWorkspaceStorageBackend(c.WorkspaceStorageBackend),
		AIGateway:        strings.TrimSpace(c.AIGatewayProvider),
		Cache:            strings.TrimSpace(c.CacheBackend),
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

func defaultDependencyProfile(appMode string) string {
	if strings.TrimSpace(appMode) == "local" {
		return "local"
	}
	return "custom"
}

func normalizeDependencyProfile(profile string) string {
	switch strings.TrimSpace(profile) {
	case "":
		return ""
	case "desktop-local", "personal-local":
		return "local"
	case "cloud", "self-hosted", "self-hosted-team":
		return "external"
	default:
		return strings.TrimSpace(profile)
	}
}

func defaultDependencyProviders(profile string) DependencyProviders {
	switch normalizeDependencyProfile(profile) {
	case "local":
		return DependencyProviders{
			Profile:          "local",
			Database:         "sqlite",
			ObjectStorage:    "filesystem",
			WorkspaceStorage: "http",
			AIGateway:        "local",
			Cache:            "memory",
		}
	case "external":
		return DependencyProviders{
			Profile:          "external",
			Database:         "postgres",
			ObjectStorage:    "minio",
			WorkspaceStorage: "gitea",
			AIGateway:        "new-api",
			Cache:            "redis",
		}
	default:
		return DependencyProviders{
			Profile:          "custom",
			Database:         "postgres",
			ObjectStorage:    "minio",
			WorkspaceStorage: "http",
			AIGateway:        "builtin",
			Cache:            "memory",
		}
	}
}

func normalizeWorkspaceStorageBackend(backend string) string {
	switch strings.TrimSpace(backend) {
	case "git-http", "git-http-backend":
		return "http"
	default:
		return strings.TrimSpace(backend)
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

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
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
		return filepath.Join(dir, ".movscript")
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
