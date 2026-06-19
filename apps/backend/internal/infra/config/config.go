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
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	providerdescriptor "github.com/movscript/movscript/internal/providers/descriptor"
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
	AdminUsername      string
	AdminPassword      string
	TurnstileEnabled   bool
	TurnstileSiteKey   string
	TurnstileSecretKey string
	HubAdminToken      string
	SCIMToken          string
	SCIMOrgID          uint
	OIDCAuthURL        string
	OIDCTokenURL       string
	OIDCUserInfoURL    string
	OIDCClientID       string
	OIDCClientSecret   string
	OIDCRedirectURL    string
	OIDCScopes         []string
	SAMLEntryURL       string
	SAMLACSURL         string
	SAMLEntityID       string
	SAMLIDPIssuer      string
	SAMLIDPCertificate string
	CORSAllowedOrigins []string
	AdminStaticDir     string
	ProviderEnvPath    string

	// Provider activation
	ProviderActivationRolloutWebhookURL   string
	ProviderActivationRolloutWebhookToken string

	// Server-side workspace storage. Clients always use the MovScript HTTP API.
	WorkspaceStorageBackend    string
	GiteaBaseURL               string
	GiteaToken                 string
	GiteaAdminUsername         string
	GiteaAdminPassword         string
	GiteaOrgPrefix             string
	GiteaRepo                  string
	GiteaRepoPrefix            string
	GiteaBranch                string
	GiteaUserEmailDomain       string
	GiteaUserTokenName         string
	GitHubEnterpriseBaseURL    string
	GitHubEnterpriseToken      string
	GitHubEnterpriseOrgPrefix  string
	GitHubEnterpriseRepo       string
	GitHubEnterpriseRepoPrefix string
	GitHubEnterpriseBranch     string
	GitLabBaseURL              string
	GitLabToken                string
	GitLabOrgPrefix            string
	GitLabRepo                 string
	GitLabRepoPrefix           string
	GitLabBranch               string
	WorkspaceCloneURLStrategy  string
	GitHTTPRoot                string
	GitBinary                  string

	// Vector index
	VectorIndexProvider string
	QdrantBaseURL       string
	QdrantToken         string
	QdrantCollection    string

	// Cache
	CacheBackend   string
	CacheKeyPrefix string
	RedisURL       string
	RedisAddr      string
	RedisUsername  string
	RedisPassword  string
	RedisDB        int

	// Media processing
	MediaProcessingProvider string
	MediaWorkerBaseURL      string
	MediaWorkerToken        string

	// Agent runtime
	AgentRuntimeProvider string
	AgentRuntimeBaseURL  string
	AgentRuntimeToken    string

	// Object storage
	StorageBackend     string
	ImageVerifyBaseURL string
	ImageVerifyAPIKey  string
	AIGatewayProvider  string
	MeteringProvider   string

	// Enterprise AI gateway and metering extension fields. Community builds keep
	// them empty unless an edition hook populates them.
	NewAPIBaseURL        string
	NewAPIAdminToken     string
	NewAPIAdminTokenFile string
	NewAPIAdminUserID    int
	NewAPIAdminUsername  string
	NewAPIAdminPassword  string
	NewAPIPublicURL      string
	NewAPIPlanMap        string
	NewAPIGroupMap       string
	NewAPIRouteGroupMap  string
	NewAPIUserPrefix     string
	NewAPIOrgUserPrefix  string
	NewAPIUserPassword   string
	NewAPITokenQuota     int
	NewAPITokenGroup     string
	NewAPIRechargeGroup  string

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
	VectorIndex      string `json:"vector_index"`
	Cache            string `json:"cache"`
	MediaProcessing  string `json:"media_processing"`
	AgentRuntime     string `json:"agent_runtime"`
}

type ProviderAssembly struct {
	DependencyProviders
	DeploymentProfile string                 `json:"deployment_profile"`
	AssemblyMode      string                 `json:"assembly_mode"`
	Providers         []ProviderAssemblyItem `json:"providers"`
}

type ProviderAssemblyItem struct {
	Type         string   `json:"type"`
	Adapter      string   `json:"adapter"`
	Label        string   `json:"label"`
	Assembly     string   `json:"assembly"`
	Capabilities []string `json:"capabilities"`
	Configured   bool     `json:"configured"`
	ManagedBy    string   `json:"managed_by"`
}

type ProviderInstance struct {
	ID           string                `json:"id"`
	Type         string                `json:"type"`
	Adapter      string                `json:"adapter"`
	Label        string                `json:"label"`
	Assembly     string                `json:"assembly"`
	ManagedBy    string                `json:"managed_by"`
	Configured   bool                  `json:"configured"`
	Capabilities []string              `json:"capabilities"`
	ConfigFields []ProviderConfigField `json:"config_fields"`
	SecretFields []ProviderSecretField `json:"secret_fields"`
}

type ProviderConfigField struct {
	Key        string `json:"key"`
	Required   bool   `json:"required"`
	Configured bool   `json:"configured"`
}

type ProviderSecretField struct {
	Key        string `json:"key"`
	Required   bool   `json:"required"`
	Configured bool   `json:"configured"`
}

func Load() *Config {
	_ = godotenv.Load()

	dataDir := getEnv("MOVSCRIPT_DATA_DIR", defaultDataDir())
	providerEnvPath := getEnv("MOVSCRIPT_PROVIDER_ENV_PATH", filepath.Join(dataDir, "provider-startup.env"))
	if _, err := os.Stat(providerEnvPath); err == nil {
		_ = godotenv.Overload(providerEnvPath)
	}

	authSecret := getEnv("AUTH_TOKEN_SECRET", getEnv("ENCRYPTION_KEY", ""))
	dataDir = getEnv("MOVSCRIPT_DATA_DIR", dataDir)
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
		TurnstileEnabled:   getEnvBool("MOVSCRIPT_TURNSTILE_ENABLED", false),
		TurnstileSiteKey:   getEnv("MOVSCRIPT_TURNSTILE_SITE_KEY", ""),
		TurnstileSecretKey: getEnv("MOVSCRIPT_TURNSTILE_SECRET_KEY", ""),
		HubAdminToken:      getEnv("HUB_ADMIN_TOKEN", ""),
		CORSAllowedOrigins: getEnvCSV("MOVSCRIPT_CORS_ALLOWED_ORIGINS", defaultCORSAllowedOrigins()),
		ProviderEnvPath:    providerEnvPath,
		ProviderActivationRolloutWebhookURL: getEnv(
			"MOVSCRIPT_PROVIDER_ACTIVATION_ROLLOUT_WEBHOOK_URL",
			getEnv("MOVSCRIPT_DEPLOYMENT_ROLLOUT_WEBHOOK_URL", ""),
		),
		ProviderActivationRolloutWebhookToken: getEnv(
			"MOVSCRIPT_PROVIDER_ACTIVATION_ROLLOUT_WEBHOOK_TOKEN",
			getEnv("MOVSCRIPT_DEPLOYMENT_ROLLOUT_WEBHOOK_TOKEN", ""),
		),

		WorkspaceStorageBackend:    normalizeWorkspaceStorageBackend(getEnv("MOVSCRIPT_WORKSPACE_STORAGE_BACKEND", getEnv("MOVSCRIPT_WORKSPACE_BACKEND", providers.WorkspaceStorage))),
		GiteaBaseURL:               getEnv("MOVSCRIPT_GITEA_BASE_URL", ""),
		GiteaToken:                 getEnv("MOVSCRIPT_GITEA_TOKEN", ""),
		GiteaAdminUsername:         getEnv("MOVSCRIPT_GITEA_ADMIN_USERNAME", getEnv("GITEA_ADMIN_USERNAME", "")),
		GiteaAdminPassword:         getEnv("MOVSCRIPT_GITEA_ADMIN_PASSWORD", getEnv("GITEA_ADMIN_PASSWORD", "")),
		GiteaOrgPrefix:             getEnv("MOVSCRIPT_GITEA_ORG_PREFIX", "movscript-org-"),
		GiteaRepo:                  getEnv("MOVSCRIPT_GITEA_REPO", ""),
		GiteaRepoPrefix:            getEnv("MOVSCRIPT_GITEA_REPO_PREFIX", "movscript-project-"),
		GiteaBranch:                getEnv("MOVSCRIPT_GITEA_BRANCH", "main"),
		GiteaUserEmailDomain:       getEnv("MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN", "users.movscript.local"),
		GiteaUserTokenName:         getEnv("MOVSCRIPT_GITEA_USER_TOKEN_NAME", "movscript-desktop"),
		GitHubEnterpriseBaseURL:    getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL", ""),
		GitHubEnterpriseToken:      getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN", ""),
		GitHubEnterpriseOrgPrefix:  getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_ORG_PREFIX", "movscript-org-"),
		GitHubEnterpriseRepo:       getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_REPO", ""),
		GitHubEnterpriseRepoPrefix: getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_REPO_PREFIX", "movscript-project-"),
		GitHubEnterpriseBranch:     getEnv("MOVSCRIPT_GITHUB_ENTERPRISE_BRANCH", "main"),
		GitLabBaseURL:              getEnv("MOVSCRIPT_GITLAB_BASE_URL", ""),
		GitLabToken:                getEnv("MOVSCRIPT_GITLAB_TOKEN", ""),
		GitLabOrgPrefix:            getEnv("MOVSCRIPT_GITLAB_ORG_PREFIX", "movscript-org-"),
		GitLabRepo:                 getEnv("MOVSCRIPT_GITLAB_REPO", ""),
		GitLabRepoPrefix:           getEnv("MOVSCRIPT_GITLAB_REPO_PREFIX", "movscript-project-"),
		GitLabBranch:               getEnv("MOVSCRIPT_GITLAB_BRANCH", "main"),
		WorkspaceCloneURLStrategy:  getEnv("MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY", ""),
		GitHTTPRoot:                getEnv("MOVSCRIPT_GIT_HTTP_ROOT", filepath.Join(dataDir, "git")),
		GitBinary:                  getEnv("MOVSCRIPT_GIT_BINARY", "git"),
		VectorIndexProvider:        getEnv("MOVSCRIPT_VECTOR_INDEX_PROVIDER", providers.VectorIndex),
		QdrantBaseURL:              getEnv("MOVSCRIPT_QDRANT_BASE_URL", ""),
		QdrantToken:                getEnv("MOVSCRIPT_QDRANT_TOKEN", ""),
		QdrantCollection:           getEnv("MOVSCRIPT_QDRANT_COLLECTION", "movscript_shot_vectors"),

		CacheBackend:   getEnv("CACHE_BACKEND", providers.Cache),
		CacheKeyPrefix: getEnv("CACHE_KEY_PREFIX", "movscript"),
		RedisURL:       getEnv("REDIS_URL", ""),
		RedisAddr:      getEnv("REDIS_ADDR", "localhost:6379"),
		RedisUsername:  getEnv("REDIS_USERNAME", ""),
		RedisPassword:  getEnv("REDIS_PASSWORD", ""),
		RedisDB:        getEnvInt("REDIS_DB", 0),

		MediaProcessingProvider: getEnv("MOVSCRIPT_MEDIA_PROCESSING_PROVIDER", providers.MediaProcessing),
		MediaWorkerBaseURL:      getEnv("MOVSCRIPT_MEDIA_WORKER_BASE_URL", ""),
		MediaWorkerToken:        getEnv("MOVSCRIPT_MEDIA_WORKER_TOKEN", ""),
		AgentRuntimeProvider:    getEnv("MOVSCRIPT_AGENT_RUNTIME_PROVIDER", providers.AgentRuntime),
		AgentRuntimeBaseURL:     getEnv("MOVSCRIPT_AGENT_RUNTIME_BASE_URL", ""),
		AgentRuntimeToken:       getEnv("MOVSCRIPT_AGENT_RUNTIME_TOKEN", ""),

		StorageBackend:        getEnv("STORAGE_BACKEND", providers.ObjectStorage),
		ImageVerifyBaseURL:    getEnv("IMAGE_VERIFY_BASE_URL", ""),
		ImageVerifyAPIKey:     getEnv("IMAGE_VERIFY_API_KEY", ""),
		AIGatewayProvider:     providers.AIGateway,
		FilesystemStorageRoot: getEnv("FILESYSTEM_STORAGE_ROOT", filepath.Join(dataDir, "resources")),

		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "movscript"),
		MinIOUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
	}
	editionApplyLoadedConfig(cfg)
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
	if c.TurnstileEnabled && (strings.TrimSpace(c.TurnstileSiteKey) == "" || strings.TrimSpace(c.TurnstileSecretKey) == "") {
		problems = append(problems, "MOVSCRIPT_TURNSTILE_SITE_KEY and MOVSCRIPT_TURNSTILE_SECRET_KEY are required when MOVSCRIPT_TURNSTILE_ENABLED=true")
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
	switch strings.TrimSpace(c.MediaProcessingProvider) {
	case "", providercontract.AdapterDesktopManagedMedia, providercontract.AdapterExternalMediaWorker:
	default:
		problems = append(problems, "MOVSCRIPT_MEDIA_PROCESSING_PROVIDER must be one of: desktop-managed, external-worker")
	}
	if strings.TrimSpace(c.MediaProcessingProvider) == providercontract.AdapterExternalMediaWorker && strings.TrimSpace(c.MediaWorkerBaseURL) == "" {
		problems = append(problems, "MOVSCRIPT_MEDIA_WORKER_BASE_URL is required when MOVSCRIPT_MEDIA_PROCESSING_PROVIDER=external-worker")
	}
	switch strings.TrimSpace(c.AgentRuntimeProvider) {
	case "", providercontract.AdapterDesktopManagedAgent, providercontract.AdapterRemoteAgentRuntime, providercontract.AdapterMova:
	default:
		problems = append(problems, "MOVSCRIPT_AGENT_RUNTIME_PROVIDER must be one of: desktop-managed, remote-runtime, mova")
	}
	if strings.TrimSpace(c.AgentRuntimeProvider) == providercontract.AdapterRemoteAgentRuntime && strings.TrimSpace(c.AgentRuntimeBaseURL) == "" {
		problems = append(problems, "MOVSCRIPT_AGENT_RUNTIME_BASE_URL is required when MOVSCRIPT_AGENT_RUNTIME_PROVIDER=remote-runtime")
	}
	workspaceStorageBackend := normalizeWorkspaceStorageBackend(c.WorkspaceStorageBackend)
	switch workspaceStorageBackend {
	case "", "http", "gitea", providercontract.AdapterGitHubEnterprise, providercontract.AdapterGitLab:
	default:
		problems = append(problems, "MOVSCRIPT_WORKSPACE_STORAGE_BACKEND must be one of: http, gitea, github-enterprise, gitlab")
	}
	if provider, ok := editionAIGatewayProvider(c); ok {
		c.AIGatewayProvider = provider
	} else {
		c.AIGatewayProvider = providercontract.AdapterLocal
	}
	problems = append(problems, editionValidateStartup(c)...)
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
	if workspaceStorageBackend == providercontract.AdapterGitHubEnterprise {
		if c.GitHubEnterpriseBaseURL == "" {
			problems = append(problems, "MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=github-enterprise")
		}
		if c.GitHubEnterpriseToken == "" {
			problems = append(problems, "MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=github-enterprise")
		}
		if c.GitHubEnterpriseRepoPrefix == "" && c.GitHubEnterpriseRepo == "" {
			problems = append(problems, "MOVSCRIPT_GITHUB_ENTERPRISE_REPO_PREFIX or MOVSCRIPT_GITHUB_ENTERPRISE_REPO is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=github-enterprise")
		}
		if c.GitHubEnterpriseBranch == "" {
			problems = append(problems, "MOVSCRIPT_GITHUB_ENTERPRISE_BRANCH is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=github-enterprise")
		}
		if c.GitHubEnterpriseOrgPrefix == "" {
			problems = append(problems, "MOVSCRIPT_GITHUB_ENTERPRISE_ORG_PREFIX is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=github-enterprise")
		}
	}
	if workspaceStorageBackend == providercontract.AdapterGitLab {
		if c.GitLabBaseURL == "" {
			problems = append(problems, "MOVSCRIPT_GITLAB_BASE_URL is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitlab")
		}
		if c.GitLabToken == "" {
			problems = append(problems, "MOVSCRIPT_GITLAB_TOKEN is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitlab")
		}
		if c.GitLabRepoPrefix == "" && c.GitLabRepo == "" {
			problems = append(problems, "MOVSCRIPT_GITLAB_REPO_PREFIX or MOVSCRIPT_GITLAB_REPO is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitlab")
		}
		if c.GitLabBranch == "" {
			problems = append(problems, "MOVSCRIPT_GITLAB_BRANCH is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitlab")
		}
		if c.GitLabOrgPrefix == "" {
			problems = append(problems, "MOVSCRIPT_GITLAB_ORG_PREFIX is required when MOVSCRIPT_WORKSPACE_STORAGE_BACKEND=gitlab")
		}
	}
	switch strings.TrimSpace(c.VectorIndexProvider) {
	case "", providercontract.AdapterLocalIndex, providercontract.AdapterPgVector, providercontract.AdapterQdrant:
	default:
		problems = append(problems, "MOVSCRIPT_VECTOR_INDEX_PROVIDER must be one of: local-index, pgvector, qdrant")
	}
	switch strings.TrimSpace(c.WorkspaceCloneURLStrategy) {
	case "", providercontract.RepositoryCloneURLStrategyProxy, providercontract.RepositoryCloneURLStrategyDirect, providercontract.RepositoryCloneURLStrategyTemporary:
	default:
		problems = append(problems, "MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY must be one of: proxy, direct, temporary")
	}
	if strings.TrimSpace(c.VectorIndexProvider) == providercontract.AdapterPgVector && strings.TrimSpace(c.DBDriver) != "postgres" {
		problems = append(problems, "DB_DRIVER=postgres is required when MOVSCRIPT_VECTOR_INDEX_PROVIDER=pgvector")
	}
	if strings.TrimSpace(c.VectorIndexProvider) == providercontract.AdapterQdrant && strings.TrimSpace(c.QdrantBaseURL) == "" {
		problems = append(problems, "MOVSCRIPT_QDRANT_BASE_URL is required when MOVSCRIPT_VECTOR_INDEX_PROVIDER=qdrant")
	}
	if strings.TrimSpace(c.VectorIndexProvider) == providercontract.AdapterQdrant && strings.TrimSpace(c.QdrantCollection) == "" {
		problems = append(problems, "MOVSCRIPT_QDRANT_COLLECTION is required when MOVSCRIPT_VECTOR_INDEX_PROVIDER=qdrant")
	}
	if len(problems) > 0 {
		return errors.New("invalid startup configuration: " + joinProblems(problems))
	}
	return nil
}

func (c *Config) SafeSummary() map[string]any {
	summary := map[string]any{
		"app_mode":                     c.AppMode,
		"deployment_mode":              c.DeploymentMode,
		"dependency_profile":           c.DependencyProfile,
		"dependency_providers":         c.EffectiveDependencyProviders(),
		"provider_assembly":            c.EffectiveProviderAssembly(),
		"data_dir":                     c.DataDir,
		"db_driver":                    c.DBDriver,
		"db_host":                      c.DBHost,
		"db_port":                      c.DBPort,
		"db_name":                      c.DBName,
		"db_path":                      c.DBPath,
		"db_slow_threshold_ms":         c.DBSlowThresholdMS,
		"server_port":                  c.ServerPort,
		"max_upload_bytes":             c.MaxUploadBytes,
		"auth_ttl_hours":               c.AuthTokenTTLHours,
		"cors_allowed_origins":         c.CORSAllowedOrigins,
		"storage_backend":              c.StorageBackend,
		"ai_gateway_provider":          c.AIGatewayProvider,
		"image_verify_set":             c.ImageVerifyBaseURL != "",
		"filesystem_root":              c.FilesystemStorageRoot,
		"minio_endpoint":               c.MinIOEndpoint,
		"minio_bucket":                 c.MinIOBucket,
		"minio_use_ssl":                c.MinIOUseSSL,
		"mcp_token_set":                c.MCPToken != "",
		"auth_secret_set":              c.AuthTokenSecret != "",
		"hub_admin_token_set":          c.HubAdminToken != "",
		"cache_backend":                c.CacheBackend,
		"cache_key_prefix":             c.CacheKeyPrefix,
		"redis_addr":                   c.RedisAddr,
		"redis_url_set":                c.RedisURL != "",
		"redis_db":                     c.RedisDB,
		"media_processing_provider":    c.MediaProcessingProvider,
		"media_worker_base_url":        c.MediaWorkerBaseURL,
		"media_worker_token_set":       strings.TrimSpace(c.MediaWorkerToken) != "",
		"agent_runtime_provider":       c.AgentRuntimeProvider,
		"agent_runtime_base_url":       c.AgentRuntimeBaseURL,
		"agent_runtime_token_set":      strings.TrimSpace(c.AgentRuntimeToken) != "",
		"workspace_storage_backend":    c.WorkspaceStorageBackend,
		"workspace_clone_url_strategy": c.WorkspaceCloneURLStrategy,
		"vector_index_provider":        c.VectorIndexProvider,
		"qdrant_base_url":              c.QdrantBaseURL,
		"qdrant_collection":            c.QdrantCollection,
		"qdrant_token_set":             strings.TrimSpace(c.QdrantToken) != "",
		"gitea_base_url":               c.GiteaBaseURL,
		"gitea_token_set":              c.GiteaToken != "",
		"gitea_admin_username":         c.GiteaAdminUsername,
		"gitea_admin_password_set":     strings.TrimSpace(c.GiteaAdminPassword) != "",
		"gitea_org_prefix":             c.GiteaOrgPrefix,
		"gitea_repo_set":               c.GiteaRepo != "",
		"gitea_repo_prefix":            c.GiteaRepoPrefix,
		"gitea_branch":                 c.GiteaBranch,
		"gitea_user_email_domain":      c.GiteaUserEmailDomain,
		"gitea_user_token_name":        c.GiteaUserTokenName,
		"git_http_root":                c.GitHTTPRoot,
		"git_binary":                   c.GitBinary,
	}
	for key, value := range editionSafeSummary(c) {
		summary[key] = value
	}
	return summary
}

func (c *Config) EffectiveDependencyProviders() DependencyProviders {
	if c == nil {
		return defaultDependencyProviders("custom")
	}
	profile := normalizeDependencyProfile(c.DependencyProfile)
	if profile == "" {
		profile = "custom"
	}
	mediaProcessing := strings.TrimSpace(c.MediaProcessingProvider)
	if mediaProcessing == "" {
		mediaProcessing = defaultDependencyProviders(profile).MediaProcessing
	}
	agentRuntime := strings.TrimSpace(c.AgentRuntimeProvider)
	if agentRuntime == "" {
		agentRuntime = defaultDependencyProviders(profile).AgentRuntime
	}
	aiGateway := providercontract.AdapterLocal
	if provider, ok := editionAIGatewayProvider(c); ok {
		aiGateway = provider
	}
	return DependencyProviders{
		Profile:          profile,
		Database:         strings.TrimSpace(c.DBDriver),
		ObjectStorage:    strings.TrimSpace(c.StorageBackend),
		WorkspaceStorage: normalizeWorkspaceStorageBackend(c.WorkspaceStorageBackend),
		AIGateway:        aiGateway,
		VectorIndex:      normalizeVectorIndexProvider(c.VectorIndexProvider),
		Cache:            strings.TrimSpace(c.CacheBackend),
		MediaProcessing:  mediaProcessing,
		AgentRuntime:     agentRuntime,
	}
}

func (c *Config) EffectiveProviderAssembly() ProviderAssembly {
	deps := c.EffectiveDependencyProviders()
	return ProviderAssembly{
		DependencyProviders: deps,
		DeploymentProfile:   deploymentProfileForDependencies(c, deps.Profile),
		AssemblyMode:        providercontract.AssemblyStartup,
		Providers: []ProviderAssemblyItem{
			providerAssemblyItem(providercontract.TypeDatabase, deps.Database, configuredDatabase(c, deps.Database), deps.Profile),
			providerAssemblyItem(providercontract.TypeBlobStorage, deps.ObjectStorage, configuredBlobStorage(c, deps.ObjectStorage), deps.Profile),
			providerAssemblyItem(providercontract.TypeWorkspaceRepository, deps.WorkspaceStorage, configuredWorkspaceRepository(c, deps.WorkspaceStorage), deps.Profile),
			providerAssemblyItem(providercontract.TypeAIGateway, deps.AIGateway, configuredAIGateway(c, deps.AIGateway), deps.Profile),
			providerAssemblyItem(providercontract.TypeVectorIndex, deps.VectorIndex, configuredVectorIndex(c, deps.VectorIndex), deps.Profile),
			providerAssemblyItem(providercontract.TypeCache, deps.Cache, configuredCache(c, deps.Cache), deps.Profile),
			providerAssemblyItem(providercontract.TypeMediaProcessing, deps.MediaProcessing, configuredMediaProcessing(c, deps.MediaProcessing), deps.Profile),
			providerAssemblyItem(providercontract.TypeAgentRuntime, deps.AgentRuntime, configuredAgentRuntime(c, deps.AgentRuntime), deps.Profile),
		},
	}
}

func (c *Config) EffectiveProviderInstances() []ProviderInstance {
	assembly := c.EffectiveProviderAssembly()
	instances := make([]ProviderInstance, 0, len(assembly.Providers))
	for _, provider := range assembly.Providers {
		instances = append(instances, ProviderInstance{
			ID:           provider.Type + ":" + provider.Adapter,
			Type:         provider.Type,
			Adapter:      provider.Adapter,
			Label:        provider.Label,
			Assembly:     provider.Assembly,
			ManagedBy:    provider.ManagedBy,
			Configured:   provider.Configured,
			Capabilities: provider.Capabilities,
			ConfigFields: providerConfigFields(c, provider.Type, provider.Adapter),
			SecretFields: providerSecretFields(c, provider.Type, provider.Adapter),
		})
	}
	return instances
}

func providerAssemblyItem(providerType string, adapter string, configured bool, profile string) ProviderAssemblyItem {
	desc := providerdescriptor.BuiltIn(providerType, adapter)
	return ProviderAssemblyItem{
		Type:         desc.Type,
		Adapter:      desc.Adapter,
		Label:        desc.Label,
		Assembly:     desc.Assembly,
		Capabilities: desc.Capabilities,
		Configured:   configured,
		ManagedBy:    providerManagedBy(profile),
	}
}

func providerManagedBy(profile string) string {
	switch normalizeDependencyProfile(profile) {
	case "local", "external":
		return providercontract.ManagedByProfile
	default:
		return providercontract.ManagedByConfig
	}
}

func deploymentProfileForDependencies(c *Config, profile string) string {
	switch normalizeDependencyProfile(profile) {
	case "local":
		return "personal-local"
	case "external":
		return "team-cloud"
	default:
		return "custom"
	}
}

func configuredDatabase(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch strings.TrimSpace(adapter) {
	case "sqlite":
		return strings.TrimSpace(c.DBPath) != ""
	case "postgres":
		return strings.TrimSpace(c.DBHost) != "" && strings.TrimSpace(c.DBPort) != "" && strings.TrimSpace(c.DBUser) != "" && strings.TrimSpace(c.DBName) != ""
	default:
		return false
	}
}

func configuredBlobStorage(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch strings.TrimSpace(adapter) {
	case "filesystem":
		return strings.TrimSpace(c.FilesystemStorageRoot) != ""
	case "minio":
		return strings.TrimSpace(c.MinIOEndpoint) != "" && strings.TrimSpace(c.MinIOAccessKey) != "" && strings.TrimSpace(c.MinIOSecretKey) != "" && strings.TrimSpace(c.MinIOBucket) != ""
	default:
		return false
	}
}

func configuredAIGateway(c *Config, adapter string) bool {
	if configured, handled := editionConfiguredAIGateway(c, adapter); handled {
		return configured
	}
	return strings.TrimSpace(adapter) != ""
}

func configuredWorkspaceRepository(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch normalizeWorkspaceStorageBackend(adapter) {
	case "http":
		return strings.TrimSpace(c.GitHTTPRoot) != "" && strings.TrimSpace(c.GitBinary) != ""
	case "gitea":
		hasManagementCredential := strings.TrimSpace(c.GiteaToken) != "" || (strings.TrimSpace(c.GiteaAdminUsername) != "" && strings.TrimSpace(c.GiteaAdminPassword) != "")
		return strings.TrimSpace(c.GiteaBaseURL) != "" && hasManagementCredential
	case providercontract.AdapterGitHubEnterprise:
		return strings.TrimSpace(c.GitHubEnterpriseBaseURL) != "" && strings.TrimSpace(c.GitHubEnterpriseToken) != ""
	case providercontract.AdapterGitLab:
		return strings.TrimSpace(c.GitLabBaseURL) != "" && strings.TrimSpace(c.GitLabToken) != ""
	default:
		return false
	}
}

func configuredCache(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch strings.TrimSpace(adapter) {
	case "", "noop", "memory":
		return true
	case "redis":
		return strings.TrimSpace(c.RedisURL) != "" || strings.TrimSpace(c.RedisAddr) != ""
	default:
		return false
	}
}

func configuredVectorIndex(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch normalizeVectorIndexProvider(adapter) {
	case "", providercontract.AdapterLocalIndex:
		return true
	case providercontract.AdapterPgVector:
		return strings.TrimSpace(c.DBDriver) == "postgres"
	case providercontract.AdapterQdrant:
		return strings.TrimSpace(c.QdrantBaseURL) != ""
	default:
		return false
	}
}

func configuredMediaProcessing(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch strings.TrimSpace(adapter) {
	case providercontract.AdapterDesktopManagedMedia:
		return true
	case providercontract.AdapterExternalMediaWorker:
		return strings.TrimSpace(c.MediaWorkerBaseURL) != ""
	default:
		return false
	}
}

func configuredAgentRuntime(c *Config, adapter string) bool {
	if c == nil {
		return false
	}
	switch strings.TrimSpace(adapter) {
	case providercontract.AdapterDesktopManagedAgent,
		providercontract.AdapterMova:
		return true
	case providercontract.AdapterRemoteAgentRuntime:
		return strings.TrimSpace(c.AgentRuntimeBaseURL) != ""
	default:
		return false
	}
}

func providerConfigFields(c *Config, providerType string, adapter string) []ProviderConfigField {
	field := func(key string, required bool, configured bool) ProviderConfigField {
		return ProviderConfigField{Key: key, Required: required, Configured: configured}
	}
	if c == nil {
		c = &Config{}
	}
	if fields, handled := editionProviderConfigFields(c, providerType, adapter); handled {
		return fields
	}
	switch providerType + ":" + strings.TrimSpace(adapter) {
	case providercontract.TypeDatabase + ":" + providercontract.AdapterSQLite:
		return []ProviderConfigField{field("db_path", true, strings.TrimSpace(c.DBPath) != "")}
	case providercontract.TypeDatabase + ":" + providercontract.AdapterPostgres:
		return []ProviderConfigField{
			field("db_host", true, strings.TrimSpace(c.DBHost) != ""),
			field("db_port", true, strings.TrimSpace(c.DBPort) != ""),
			field("db_user", true, strings.TrimSpace(c.DBUser) != ""),
			field("db_name", true, strings.TrimSpace(c.DBName) != ""),
		}
	case providercontract.TypeBlobStorage + ":" + providercontract.AdapterFilesystem:
		return []ProviderConfigField{field("filesystem_storage_root", true, strings.TrimSpace(c.FilesystemStorageRoot) != "")}
	case providercontract.TypeBlobStorage + ":" + providercontract.AdapterMinIO:
		return []ProviderConfigField{
			field("minio_endpoint", true, strings.TrimSpace(c.MinIOEndpoint) != ""),
			field("minio_bucket", true, strings.TrimSpace(c.MinIOBucket) != ""),
			field("minio_use_ssl", false, true),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitHTTP:
		return []ProviderConfigField{
			field("git_http_root", true, strings.TrimSpace(c.GitHTTPRoot) != ""),
			field("git_binary", true, strings.TrimSpace(c.GitBinary) != ""),
			field("workspace_clone_url_strategy", false, strings.TrimSpace(c.WorkspaceCloneURLStrategy) != ""),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitea:
		return []ProviderConfigField{
			field("gitea_base_url", true, strings.TrimSpace(c.GiteaBaseURL) != ""),
			field("gitea_repo_prefix", false, strings.TrimSpace(c.GiteaRepoPrefix) != ""),
			field("gitea_org_prefix", false, strings.TrimSpace(c.GiteaOrgPrefix) != ""),
			field("gitea_branch", false, strings.TrimSpace(c.GiteaBranch) != ""),
			field("workspace_clone_url_strategy", false, strings.TrimSpace(c.WorkspaceCloneURLStrategy) != ""),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitHubEnterprise:
		return []ProviderConfigField{
			field("github_enterprise_base_url", true, strings.TrimSpace(c.GitHubEnterpriseBaseURL) != ""),
			field("github_enterprise_repo_prefix", false, strings.TrimSpace(c.GitHubEnterpriseRepoPrefix) != ""),
			field("github_enterprise_org_prefix", false, strings.TrimSpace(c.GitHubEnterpriseOrgPrefix) != ""),
			field("github_enterprise_branch", false, strings.TrimSpace(c.GitHubEnterpriseBranch) != ""),
			field("workspace_clone_url_strategy", false, strings.TrimSpace(c.WorkspaceCloneURLStrategy) != ""),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitLab:
		return []ProviderConfigField{
			field("gitlab_base_url", true, strings.TrimSpace(c.GitLabBaseURL) != ""),
			field("gitlab_repo_prefix", false, strings.TrimSpace(c.GitLabRepoPrefix) != ""),
			field("gitlab_org_prefix", false, strings.TrimSpace(c.GitLabOrgPrefix) != ""),
			field("gitlab_branch", false, strings.TrimSpace(c.GitLabBranch) != ""),
			field("workspace_clone_url_strategy", false, strings.TrimSpace(c.WorkspaceCloneURLStrategy) != ""),
		}
	case providercontract.TypeAIGateway + ":" + providercontract.AdapterLocal:
		return nil
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterLocalIndex:
		return nil
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterPgVector:
		return []ProviderConfigField{field("vector_index_provider", true, normalizeVectorIndexProvider(c.VectorIndexProvider) == providercontract.AdapterPgVector)}
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterQdrant:
		return []ProviderConfigField{
			field("qdrant_base_url", true, strings.TrimSpace(c.QdrantBaseURL) != ""),
			field("qdrant_collection", false, strings.TrimSpace(c.QdrantCollection) != ""),
		}
	case providercontract.TypeCache + ":" + providercontract.AdapterRedis:
		return []ProviderConfigField{
			field("redis_url", false, strings.TrimSpace(c.RedisURL) != ""),
			field("redis_addr", false, strings.TrimSpace(c.RedisAddr) != ""),
			field("redis_db", false, true),
		}
	case providercontract.TypeMediaProcessing + ":" + providercontract.AdapterExternalMediaWorker:
		return []ProviderConfigField{field("media_worker_base_url", true, strings.TrimSpace(c.MediaWorkerBaseURL) != "")}
	case providercontract.TypeAgentRuntime + ":" + providercontract.AdapterRemoteAgentRuntime:
		return []ProviderConfigField{field("agent_runtime_base_url", true, strings.TrimSpace(c.AgentRuntimeBaseURL) != "")}
	default:
		return nil
	}
}

func providerSecretFields(c *Config, providerType string, adapter string) []ProviderSecretField {
	field := func(key string, required bool, configured bool) ProviderSecretField {
		return ProviderSecretField{Key: key, Required: required, Configured: configured}
	}
	if c == nil {
		c = &Config{}
	}
	if fields, handled := editionProviderSecretFields(c, providerType, adapter); handled {
		return fields
	}
	switch providerType + ":" + strings.TrimSpace(adapter) {
	case providercontract.TypeDatabase + ":" + providercontract.AdapterPostgres:
		return []ProviderSecretField{field("db_password", false, strings.TrimSpace(c.DBPassword) != "")}
	case providercontract.TypeBlobStorage + ":" + providercontract.AdapterMinIO:
		return []ProviderSecretField{
			field("minio_access_key", true, strings.TrimSpace(c.MinIOAccessKey) != ""),
			field("minio_secret_key", true, strings.TrimSpace(c.MinIOSecretKey) != ""),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitea:
		return []ProviderSecretField{
			field("gitea_token", false, strings.TrimSpace(c.GiteaToken) != ""),
			field("gitea_admin_password", false, strings.TrimSpace(c.GiteaAdminPassword) != ""),
		}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitHubEnterprise:
		return []ProviderSecretField{field("github_enterprise_token", true, strings.TrimSpace(c.GitHubEnterpriseToken) != "")}
	case providercontract.TypeWorkspaceRepository + ":" + providercontract.AdapterGitLab:
		return []ProviderSecretField{field("gitlab_token", true, strings.TrimSpace(c.GitLabToken) != "")}
	case providercontract.TypeCache + ":" + providercontract.AdapterRedis:
		return []ProviderSecretField{field("redis_password", false, strings.TrimSpace(c.RedisPassword) != "")}
	case providercontract.TypeVectorIndex + ":" + providercontract.AdapterQdrant:
		return []ProviderSecretField{field("qdrant_token", false, strings.TrimSpace(c.QdrantToken) != "")}
	case providercontract.TypeMediaProcessing + ":" + providercontract.AdapterExternalMediaWorker:
		return []ProviderSecretField{field("media_worker_token", false, strings.TrimSpace(c.MediaWorkerToken) != "")}
	case providercontract.TypeAgentRuntime + ":" + providercontract.AdapterRemoteAgentRuntime:
		return []ProviderSecretField{field("agent_runtime_token", false, strings.TrimSpace(c.AgentRuntimeToken) != "")}
	default:
		return nil
	}
}

func (c *Config) OIDCEnabled() bool {
	return strings.TrimSpace(c.OIDCAuthURL) != "" ||
		strings.TrimSpace(c.OIDCTokenURL) != "" ||
		strings.TrimSpace(c.OIDCUserInfoURL) != "" ||
		strings.TrimSpace(c.OIDCClientID) != "" ||
		strings.TrimSpace(c.OIDCClientSecret) != "" ||
		strings.TrimSpace(c.OIDCRedirectURL) != ""
}

func (c *Config) SAMLEnabled() bool {
	return strings.TrimSpace(c.SAMLEntryURL) != "" ||
		strings.TrimSpace(c.SAMLACSURL) != "" ||
		strings.TrimSpace(c.SAMLEntityID) != "" ||
		strings.TrimSpace(c.SAMLIDPIssuer) != "" ||
		strings.TrimSpace(c.SAMLIDPCertificate) != ""
}

func defaultDeploymentMode(appMode string) string {
	if mode, ok := editionDefaultDeploymentMode(appMode); ok {
		return mode
	}
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
	if providers, ok := editionDefaultDependencyProviders(profile); ok {
		return providers
	}
	switch normalizeDependencyProfile(profile) {
	case "local":
		return DependencyProviders{
			Profile:          "local",
			Database:         "sqlite",
			ObjectStorage:    "filesystem",
			WorkspaceStorage: "http",
			AIGateway:        "local",
			VectorIndex:      providercontract.AdapterLocalIndex,
			Cache:            "memory",
			MediaProcessing:  providercontract.AdapterDesktopManagedMedia,
			AgentRuntime:     providercontract.AdapterDesktopManagedAgent,
		}
	case "external":
		return DependencyProviders{
			Profile:          "external",
			Database:         "postgres",
			ObjectStorage:    "minio",
			WorkspaceStorage: "gitea",
			AIGateway:        providercontract.AdapterLocal,
			VectorIndex:      providercontract.AdapterLocalIndex,
			Cache:            "redis",
			MediaProcessing:  providercontract.AdapterExternalMediaWorker,
			AgentRuntime:     providercontract.AdapterRemoteAgentRuntime,
		}
	default:
		return DependencyProviders{
			Profile:          "custom",
			Database:         "postgres",
			ObjectStorage:    "minio",
			WorkspaceStorage: "http",
			AIGateway:        providercontract.AdapterLocal,
			VectorIndex:      providercontract.AdapterLocalIndex,
			Cache:            "memory",
			MediaProcessing:  providercontract.AdapterDesktopManagedMedia,
			AgentRuntime:     providercontract.AdapterDesktopManagedAgent,
		}
	}
}

func normalizeWorkspaceStorageBackend(backend string) string {
	switch strings.TrimSpace(backend) {
	case "git-http", "git-http-backend":
		return "http"
	case "github", "github-enterprise-server", "ghe":
		return providercontract.AdapterGitHubEnterprise
	case "gitlab-enterprise", "gitlab-self-hosted":
		return providercontract.AdapterGitLab
	default:
		return strings.TrimSpace(backend)
	}
}

func normalizeVectorIndexProvider(provider string) string {
	switch strings.TrimSpace(provider) {
	case "", "local", "local-vector", "local-vector-index":
		return providercontract.AdapterLocalIndex
	default:
		return strings.TrimSpace(provider)
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

func getEnvBool(key string, fallback bool) bool {
	if v := strings.TrimSpace(strings.ToLower(os.Getenv(key))); v != "" {
		return v == "1" || v == "true" || v == "yes" || v == "on"
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
	return editionDefaultCORSAllowedOrigins([]string{
		"http://localhost:3001",
		"http://127.0.0.1:3001",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:5174",
		"http://127.0.0.1:5174",
		"http://localhost:8765",
		"http://127.0.0.1:8765",
		"http://localhost:8766",
		"http://127.0.0.1:8766",
		"file://",
		"movscript-admin://app",
	})
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
