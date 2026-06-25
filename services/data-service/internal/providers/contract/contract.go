package contract

import (
	"context"
	"encoding/json"
	"io"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
)

const (
	AssemblyStartup = "startup"
)

const (
	ManagedByProfile = "profile"
	ManagedByConfig  = "config"
)

const (
	HealthStatusOK            = "ok"
	HealthStatusMissingConfig = "missing_config"
	HealthStatusError         = "error"
)

const (
	TypeDatabase            = "database"
	TypeBlobStorage         = "blob_storage"
	TypeWorkspaceRepository = "workspace_repository"
	TypeAIGateway           = "ai_gateway"
	TypeCache               = "cache"
	TypeVectorIndex         = "vector_index"
	TypeMediaProcessing     = "media_processing"
	TypeExternalResource    = "external_resource"
	TypeAgentRuntime        = "agent_runtime"
)

const (
	AdapterSQLite              = "sqlite"
	AdapterPostgres            = "postgres"
	AdapterFilesystem          = "filesystem"
	AdapterMinIO               = "minio"
	AdapterGitHTTP             = "http"
	AdapterGitea               = "gitea"
	AdapterGitHubEnterprise    = "github-enterprise"
	AdapterGitLab              = "gitlab"
	AdapterLocal               = "local"
	AdapterBuiltin             = "builtin"
	AdapterMemory              = "memory"
	AdapterRedis               = "redis"
	AdapterNoop                = "noop"
	AdapterLocalIndex          = "local-index"
	AdapterPgVector            = "pgvector"
	AdapterQdrant              = "qdrant"
	AdapterDesktopManagedMedia = "desktop-managed"
	AdapterExternalMediaWorker = "external-worker"
	AdapterPexels              = "pexels"
	AdapterPixabay             = "pixabay"
	AdapterDesktopManagedAgent = "desktop-managed"
	AdapterRemoteAgentRuntime  = "remote-runtime"
	AdapterMova                = "mova"
)

type OwnerType string

const (
	OwnerTypeUser         OwnerType = "user"
	OwnerTypeOrganization OwnerType = "organization"
)

type ProviderHealth struct {
	Type         string   `json:"type"`
	Adapter      string   `json:"adapter"`
	Assembly     string   `json:"assembly"`
	Status       string   `json:"status"`
	Message      string   `json:"message,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}

type HealthChecker interface {
	Health(ctx context.Context) ProviderHealth
}

type EnsureRepositoryInput struct {
	Owner         string
	Repo          string
	DefaultBranch string
	Description   string
	Private       bool
	OwnerType     OwnerType
	OwnerName     string
}

type EnsureRepositoryResult struct {
	ProviderRepoID string
	HeadCommit     string
}

type RepositoryRef struct {
	Provider       string
	ProviderRepoID string
	Owner          string
	Repo           string
	DefaultBranch  string
}

type RepositoryActor struct {
	UserID   uint
	Username string
}

const (
	RepositoryCloneURLStrategyProxy     = "proxy"
	RepositoryCloneURLStrategyDirect    = "direct"
	RepositoryCloneURLStrategyTemporary = "temporary"
)

type RepositoryCloneURLRequest struct {
	Ref               RepositoryRef
	Actor             RepositoryActor
	PublicURL         string
	PreferredStrategy string
}

type RepositoryCloneURLResult struct {
	URL              string
	Strategy         string
	ExpiresAtUnixSec int64
}

type GitHTTPProxyTargetRequest struct {
	Ref RepositoryRef
}

type GitHTTPProxyTarget struct {
	Provider      string
	Owner         string
	Repo          string
	DefaultBranch string
	BaseURL       string
	LocalRoot     string
	GitBinary     string
	AuthUsername  string
	AuthSecret    string
}

type EnsureUserInput struct {
	Username  string
	Email     string
	Password  string
	TokenName string
}

type EnsureUserResult struct {
	ProviderUserID string
	Username       string
	Token          string
}

type RepositoryAccessRequest struct {
	Owner      string
	Repo       string
	Username   string
	Permission string
}

type RepositoryAccessResult struct {
	Allowed    bool
	Permission string
}

type WorkspaceRepository interface {
	EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error)
	GetCloneURL(ctx context.Context, request RepositoryCloneURLRequest) (RepositoryCloneURLResult, error)
	GetGitHTTPProxyTarget(ctx context.Context, request GitHTTPProxyTargetRequest) (GitHTTPProxyTarget, error)
}

type WorkspaceRepositoryIdentity interface {
	EnsureUser(ctx context.Context, input EnsureUserInput) (EnsureUserResult, error)
	EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error
	CheckRepoAccess(ctx context.Context, request RepositoryAccessRequest) (RepositoryAccessResult, error)
}

type TextRequest struct {
	Model       string
	Messages    []Message
	MaxTokens   int
	Temperature float32
	IsReasoning bool
	JSONMode    bool
	PromptName  string
	ExtraParams map[string]any
	Tools       json.RawMessage
	ToolChoice  json.RawMessage
}

type Message struct {
	Role         string
	Content      string
	ContentParts []MessageContentPart
	ToolCallID   string
	ToolCalls    []ToolCall
}

type MessageContentPart map[string]any

type TextResponse struct {
	Content      string
	ToolCalls    []ToolCall
	FinishReason string
	Usage        TokenUsage
	Debug        *DebugCallResult
}

type ResponsesRequest struct {
	Text         TextRequest
	Input        json.RawMessage
	Instructions string
	Tools        json.RawMessage
	ToolChoice   json.RawMessage
}

type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolCallDelta struct {
	Index    int          `json:"index"`
	ID       string       `json:"id,omitempty"`
	Type     string       `json:"type,omitempty"`
	Function ToolFunction `json:"function,omitempty"`
}

type ToolFunction struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

type TextStreamEvent struct {
	Role           string
	ContentDelta   string
	ReasoningDelta string
	ToolCallDeltas []ToolCallDelta
	FinishReason   string
	Usage          TokenUsage
	Error          string
	Done           bool
}

type ResponsesStreamEvent struct {
	Type  string
	Raw   string
	Usage TokenUsage
	Error string
	Done  bool
}

type TokenUsage struct {
	InputTokens       int
	OutputTokens      int
	CachedInputTokens int
	ReasoningTokens   int
}

type ImageRequest struct {
	Model               string
	Prompt              string
	Size                string
	N                   int
	Quality             string
	Style               string
	AspectRatio         string
	Seed                *int64
	GuidanceScale       float64
	Watermark           *bool
	OutputFormat        string
	SequentialMode      string
	SequentialMaxImages int
	WebSearch           bool
	OptimizePromptMode  string
	InputImage          string
	InputImageBytes     []byte
	InputImageMime      string
	InputImageDataList  []MediaData
	ImageFieldName      string
	CloudFileID         string
	EditOnly            bool
}

type ImageResponse struct {
	URLs  []string
	Debug *DebugCallResult
}

type VideoRequest struct {
	Model                 string
	Prompt                string
	Image                 string
	InputImages           []string
	InputImageDataList    []MediaData
	InputVideo            string
	InputVideoData        *MediaData
	InputAudio            string
	InputAudioData        *MediaData
	Duration              int
	Frames                int
	Seed                  *int64
	Width                 int
	Height                int
	AspectRatio           string
	Ratio                 string
	Quality               string
	Size                  string
	ResolutionName        string
	Preset                string
	CameraFixed           *bool
	Watermark             *bool
	GenerateAudio         *bool
	AudioType             string
	ReturnLastFrame       *bool
	ServiceTier           string
	ExecutionExpiresAfter int
	Workspace             *bool
	WebSearch             bool
	MovementAmplitude     string
	OffPeak               *bool
	Payload               string
}

type MediaData struct {
	Bytes        []byte
	MimeType     string
	PresignedURL string
	CloudFileID  string
	ResourceID   uint
}

type VideoResponse struct {
	TaskID       string
	TaskKind     string
	Status       string
	Message      string
	URL          string
	DurationSec  int
	ContentBytes []byte
	Debug        *DebugCallResult
}

const (
	VideoStatusSubmitted  = "submitted"
	VideoStatusQueued     = "queued"
	VideoStatusProcessing = "processing"
	VideoStatusSucceeded  = "succeeded"
	VideoStatusFailed     = "failed"
	VideoStatusCancelled  = "cancelled"
)

type VideoPollRequest struct {
	Model    string
	TaskID   string
	TaskKind string
}

type VideoCancelRequest struct {
	Model    string
	TaskID   string
	TaskKind string
}

type DebugHTTPExchange struct {
	Success        bool                 `json:"success"`
	ModelID        string               `json:"model_id"`
	Endpoint       string               `json:"endpoint"`
	Method         string               `json:"method"`
	RequestHeaders map[string]string    `json:"request_headers,omitempty"`
	RequestBody    string               `json:"request_body"`
	PromptName     string               `json:"prompt_name,omitempty"`
	SystemPrompt   string               `json:"system_prompt,omitempty"`
	UserPrompt     string               `json:"user_prompt,omitempty"`
	CompiledPrompt string               `json:"compiled_prompt,omitempty"`
	PromptMessages []DebugPromptMessage `json:"prompt_messages,omitempty"`
	ResponseStatus int                  `json:"response_status"`
	ResponseBody   string               `json:"response_body"`
	LatencyMs      int64                `json:"latency_ms"`
	Error          string               `json:"error,omitempty"`
}

type DebugCallResult struct {
	JobType             string               `json:"job_type,omitempty"`
	JobModelDefID       string               `json:"job_model_def_id,omitempty"`
	JobResolvedPrompt   string               `json:"job_resolved_prompt,omitempty"`
	JobInputResourceIDs []uint               `json:"job_input_resource_ids,omitempty"`
	ResourceDiagnostics []ResourceDiagnostic `json:"resource_diagnostics,omitempty"`
	Calls               []DebugHTTPExchange  `json:"calls,omitempty"`
	Success             bool                 `json:"success"`
	ModelID             string               `json:"model_id"`
	Endpoint            string               `json:"endpoint"`
	Method              string               `json:"method"`
	RequestHeaders      map[string]string    `json:"request_headers,omitempty"`
	RequestBody         string               `json:"request_body"`
	PromptName          string               `json:"prompt_name,omitempty"`
	SystemPrompt        string               `json:"system_prompt,omitempty"`
	UserPrompt          string               `json:"user_prompt,omitempty"`
	CompiledPrompt      string               `json:"compiled_prompt,omitempty"`
	PromptMessages      []DebugPromptMessage `json:"prompt_messages,omitempty"`
	ResponseStatus      int                  `json:"response_status"`
	ResponseBody        string               `json:"response_body"`
	LatencyMs           int64                `json:"latency_ms"`
	Error               string               `json:"error,omitempty"`
}

type ResourceDiagnostic struct {
	ResourceID                      uint           `json:"resource_id"`
	ResourceType                    string         `json:"resource_type,omitempty"`
	ProviderID                      string         `json:"provider_id,omitempty"`
	ProviderKind                    string         `json:"provider_kind,omitempty"`
	SupportsProviderAssetURI        bool           `json:"supports_provider_asset_uri"`
	Mode                            string         `json:"mode"`
	Reason                          string         `json:"reason"`
	NextAction                      string         `json:"next_action,omitempty"`
	AssetURI                        string         `json:"asset_uri,omitempty"`
	AssetGroupID                    string         `json:"asset_group_id,omitempty"`
	CertificationStatus             string         `json:"certification_status,omitempty"`
	CertificationProviderID         string         `json:"certification_provider_id,omitempty"`
	AvailableCertificationKeys      []string       `json:"available_certification_keys,omitempty"`
	AvailableCertificationProviders []string       `json:"available_certification_providers,omitempty"`
	Trust                           map[string]any `json:"trust,omitempty"`
}

type DebugPromptMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIModelListFilter struct {
	Capability       string   `json:"capability,omitempty"`
	Capabilities     []string `json:"capabilities,omitempty"`
	APIKind          string   `json:"api_kind,omitempty"`
	APIKinds         []string `json:"api_kinds,omitempty"`
	ProviderVariants bool     `json:"provider_variants,omitempty"`
	RouteGroup       string   `json:"route_group,omitempty"`
}

type AIModelDescriptor struct {
	ModelID           string                   `json:"model_id"`
	CatalogEntryID    uint                     `json:"catalog_entry_id,omitempty"`
	CredentialID      uint                     `json:"-"`
	ProviderID        string                   `json:"provider_id,omitempty"`
	ProviderModelID   string                   `json:"provider_model_id,omitempty"`
	ModelDefID        string                   `json:"model_def_id,omitempty"`
	ModelIDOverride   string                   `json:"model_id_override,omitempty"`
	DisplayName       string                   `json:"display_name"`
	ShortName         string                   `json:"short_name,omitempty"`
	ProviderName      string                   `json:"provider_name,omitempty"`
	AdapterType       string                   `json:"adapter_type,omitempty"`
	Capabilities      []string                 `json:"capabilities,omitempty"`
	SupportedAPIKinds []string                 `json:"supported_api_kinds,omitempty"`
	AcceptsImageInput bool                     `json:"accepts_image_input,omitempty"`
	IsDefault         bool                     `json:"is_default,omitempty"`
	LogicalModelID    string                   `json:"logical_model_id,omitempty"`
	ProviderVariants  int                      `json:"provider_variant_count,omitempty"`
	Priority          int                      `json:"priority,omitempty"`
	CapacityWeight    int                      `json:"capacity_weight,omitempty"`
	MaxConcurrency    int                      `json:"max_concurrency,omitempty"`
	SupportedParams   []map[string]any         `json:"supported_params,omitempty"`
	InputRequirements AIModelInputRequirements `json:"input_requirements,omitempty"`
	ParamsSchema      map[string]any           `json:"params_schema,omitempty"`
}

type AIModelResolveRequest struct {
	ModelID        string `json:"model_id,omitempty"`
	CatalogEntryID uint   `json:"catalog_entry_id,omitempty"`
	Capability     string `json:"capability"`
}

type AIModelBinding struct {
	ModelID         string `json:"model_id"`
	CatalogEntryID  uint   `json:"catalog_entry_id,omitempty"`
	ProviderID      string `json:"provider_id,omitempty"`
	ProviderModelID string `json:"provider_model_id"`
	Capability      string `json:"capability"`
	AdapterType     string `json:"adapter_type,omitempty"`
	ProviderName    string `json:"provider_name,omitempty"`
	SelectionReason string `json:"selection_reason,omitempty"`
}

type AIGatewayModelCatalog interface {
	ListModels(ctx context.Context, filter AIModelListFilter) ([]AIModelDescriptor, error)
	ResolveModel(ctx context.Context, request AIModelResolveRequest) (AIModelBinding, error)
}

type AIGatewayRouteRequest struct {
	ModelID               string          `json:"model_id,omitempty"`
	CatalogEntryID        uint            `json:"catalog_entry_id,omitempty"`
	RouteBindingID        uint            `json:"route_binding_id,omitempty"`
	Capability            string          `json:"capability"`
	APIKind               string          `json:"api_kind,omitempty"`
	APIKinds              []string        `json:"api_kinds,omitempty"`
	PreferredAdapterTypes []string        `json:"preferred_adapter_types,omitempty"`
	EstimatedUsage        AIUsageEstimate `json:"estimated_usage,omitempty"`
}

type AIGatewayModelRoute struct {
	ModelID         string `json:"model_id"`
	CatalogEntryID  uint   `json:"catalog_entry_id,omitempty"`
	RouteBindingID  uint   `json:"route_binding_id,omitempty"`
	CredentialID    uint   `json:"-"`
	SourceType      string `json:"source_type,omitempty"`
	RouteGroup      string `json:"route_group,omitempty"`
	ProviderID      string `json:"provider_id,omitempty"`
	ProviderKind    string `json:"provider_kind,omitempty"`
	AdapterKey      string `json:"adapter_key,omitempty"`
	ProviderModelID string `json:"provider_model_id"`
	Capability      string `json:"capability,omitempty"`
	APIKind         string `json:"api_kind,omitempty"`
	SelectionReason string `json:"selection_reason,omitempty"`
}

type AIGatewayModelRoutePlan struct {
	ModelID         string                `json:"model_id"`
	Capability      string                `json:"capability"`
	Routes          []AIGatewayModelRoute `json:"routes"`
	FallbackEnabled bool                  `json:"fallback_enabled"`
	SelectionReason string                `json:"selection_reason,omitempty"`
}

type AIGatewayRoutingPolicy interface {
	ResolveGatewayModelRoute(ctx context.Context, request AIGatewayRouteRequest) (AIGatewayModelRoute, error)
	ResolveGatewayModelRoutePlan(ctx context.Context, request AIGatewayRouteRequest) (AIGatewayModelRoutePlan, error)
	ResolveGatewayTextModelRoute(ctx context.Context, modelID string) (AIGatewayModelRoute, error)
	ResolveGatewayGenerationModelRoute(ctx context.Context, modelID string, outputType string) (AIGatewayModelRoute, error)
}

type AIModelInputRequirement struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type AIModelInputRequirements struct {
	Image AIModelInputRequirement `json:"image"`
	Video AIModelInputRequirement `json:"video"`
}

type AIUsageContext struct {
	OrgID                 *uint `json:"org_id,omitempty"`
	ProjectID             *uint `json:"project_id,omitempty"`
	GatewayAPIKeyID       *uint `json:"gateway_api_key_id,omitempty"`
	JobID                 *uint `json:"job_id,omitempty"`
	ReservationID         *uint `json:"reservation_id,omitempty"`
	AIModelCatalogEntryID *uint `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID        *uint `json:"route_binding_id,omitempty"`
}

type AIUsageEstimate struct {
	OperationType     string  `json:"operation_type"`
	InputTokens       int     `json:"input_tokens,omitempty"`
	OutputTokens      int     `json:"output_tokens,omitempty"`
	CachedInputTokens int     `json:"cached_input_tokens,omitempty"`
	ReasoningTokens   int     `json:"reasoning_tokens,omitempty"`
	DurationSec       int     `json:"duration_sec,omitempty"`
	ImageCount        int     `json:"image_count,omitempty"`
	Cost              float64 `json:"cost,omitempty"`
}

type AIUsageReservation struct {
	ID                    uint    `json:"id"`
	UserID                uint    `json:"user_id"`
	OrgID                 *uint   `json:"org_id,omitempty"`
	AIModelCatalogEntryID *uint   `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID        *uint   `json:"route_binding_id,omitempty"`
	GatewayAPIKeyID       *uint   `json:"gateway_api_key_id,omitempty"`
	ProjectID             *uint   `json:"project_id,omitempty"`
	JobID                 *uint   `json:"job_id,omitempty"`
	OperationType         string  `json:"operation_type"`
	EstimatedCost         float64 `json:"estimated_cost"`
	ActualCost            float64 `json:"actual_cost"`
	Status                string  `json:"status"`
	ReleaseReason         string  `json:"release_reason,omitempty"`
	UsageLogID            *uint   `json:"usage_log_id,omitempty"`
}

type AIUsageReserveRequest struct {
	UserID         uint            `json:"user_id"`
	CatalogEntryID uint            `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID uint            `json:"route_binding_id,omitempty"`
	Estimate       AIUsageEstimate `json:"estimate"`
	Context        AIUsageContext  `json:"context"`
}

type AIUsageSettleRequest struct {
	UserID         uint            `json:"user_id"`
	CatalogEntryID uint            `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID uint            `json:"route_binding_id,omitempty"`
	Estimate       AIUsageEstimate `json:"estimate"`
	Context        AIUsageContext  `json:"context"`
}

type AIUsageJobBindingRequest struct {
	ReservationID uint `json:"reservation_id"`
	JobID         uint `json:"job_id"`
}

type AIUsageReleaseRequest struct {
	ReservationID uint   `json:"reservation_id"`
	Reason        string `json:"reason,omitempty"`
}

type AIGatewayGovernanceRequest struct {
	UserID  uint                  `json:"user_id"`
	Route   AIGatewayRouteRequest `json:"route"`
	Context AIUsageContext        `json:"context"`
}

type AIGatewayGovernanceDecision struct {
	Allowed        bool                    `json:"allowed"`
	Reason         string                  `json:"reason,omitempty"`
	Route          AIGatewayModelRoute     `json:"route,omitempty"`
	RoutePlan      AIGatewayModelRoutePlan `json:"route_plan,omitempty"`
	EstimatedUsage AIUsageEstimate         `json:"estimated_usage,omitempty"`
}

type AIGatewayGovernancePolicy interface {
	EvaluateGatewayGovernance(ctx context.Context, request AIGatewayGovernanceRequest) (AIGatewayGovernanceDecision, error)
}

type AIGatewayUsageGovernor interface {
	EstimateTextGatewayUsage(ctx context.Context, route AIGatewayRouteRequest, request TextRequest) (AIUsageEstimate, error)
	EstimateImageGatewayUsage(ctx context.Context, route AIGatewayRouteRequest, request ImageRequest) (AIUsageEstimate, error)
	EstimateVideoGatewayUsage(ctx context.Context, route AIGatewayRouteRequest, request VideoRequest) (AIUsageEstimate, error)
	ReserveGatewayUsage(ctx context.Context, request AIUsageReserveRequest) (AIUsageReservation, error)
	SetGatewayReservationJob(ctx context.Context, request AIUsageJobBindingRequest) error
	ReleaseGatewayUsageReservation(ctx context.Context, request AIUsageReleaseRequest) error
	SettleGatewayUsage(ctx context.Context, request AIUsageSettleRequest) error
}

type AIGatewayUsageLogFilter struct {
	UserID        string     `json:"user_id,omitempty"`
	OrgID         string     `json:"org_id,omitempty"`
	ProjectID     string     `json:"project_id,omitempty"`
	ModelID       string     `json:"model_id,omitempty"`
	ProviderID    string     `json:"provider_id,omitempty"`
	GatewayKeyID  string     `json:"gateway_api_key_id,omitempty"`
	OperationType string     `json:"operation_type,omitempty"`
	Since         *time.Time `json:"since,omitempty"`
	Until         *time.Time `json:"until,omitempty"`
	Page          int        `json:"page,omitempty"`
	PageSize      int        `json:"page_size,omitempty"`
}

type AIGatewayUsageTotals struct {
	Records           int64   `json:"records"`
	Cost              float64 `json:"cost"`
	InputTokens       int64   `json:"input_tokens"`
	OutputTokens      int64   `json:"output_tokens"`
	CachedInputTokens int64   `json:"cached_input_tokens"`
	ReasoningTokens   int64   `json:"reasoning_tokens"`
	DurationSec       int64   `json:"duration_sec"`
	ImageCount        int64   `json:"image_count"`
}

type AIGatewayUsageUserRef struct {
	ID         uint   `json:"ID"`
	Username   string `json:"username"`
	SystemRole string `json:"system_role"`
}

type AIGatewayUsageCatalogEntryRef struct {
	ID            uint   `json:"ID"`
	PublicModelID string `json:"public_model_id"`
	DisplayName   string `json:"display_name"`
	ShortName     string `json:"short_name"`
}

type AIGatewayUsageLog struct {
	ID                    uint                           `json:"ID"`
	UserID                uint                           `json:"user_id"`
	OrgID                 *uint                          `json:"org_id,omitempty"`
	UsageReservationID    *uint                          `json:"usage_reservation_id,omitempty"`
	RouteBindingID        *uint                          `json:"route_binding_id,omitempty"`
	GatewayAPIKeyID       *uint                          `json:"gateway_api_key_id,omitempty"`
	ProjectID             *uint                          `json:"project_id,omitempty"`
	OperationType         string                         `json:"operation_type"`
	InputTokens           int                            `json:"input_tokens"`
	OutputTokens          int                            `json:"output_tokens"`
	CachedInputTokens     int                            `json:"cached_input_tokens"`
	ReasoningTokens       int                            `json:"reasoning_tokens"`
	DurationSec           int                            `json:"duration_sec"`
	ImageCount            int                            `json:"image_count"`
	Cost                  float64                        `json:"cost"`
	ProviderID            string                         `json:"provider_id,omitempty"`
	ProviderModelID       string                         `json:"provider_model_id,omitempty"`
	User                  *AIGatewayUsageUserRef         `json:"user,omitempty"`
	AIModelCatalogEntryID *uint                          `json:"ai_model_catalog_entry_id,omitempty"`
	AIModelCatalogEntry   *AIGatewayUsageCatalogEntryRef `json:"ai_model_catalog_entry,omitempty"`
	CreatedAt             time.Time                      `json:"CreatedAt"`
	UpdatedAt             time.Time                      `json:"UpdatedAt"`
}

type AIGatewayUsageLogPage struct {
	Items    []AIGatewayUsageLog `json:"items"`
	Total    int64               `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

type AIGatewayUsageOperationSummary struct {
	OperationType string `json:"operation_type"`
	AIGatewayUsageTotals
}

type AIGatewayUsageModelSummary struct {
	AIModelCatalogEntryID *uint                          `json:"ai_model_catalog_entry_id,omitempty"`
	AIModelCatalogEntry   *AIGatewayUsageCatalogEntryRef `json:"ai_model_catalog_entry,omitempty"`
	AIGatewayUsageTotals
}

type AIGatewayUsageUserSummary struct {
	UserID uint                   `json:"user_id"`
	User   *AIGatewayUsageUserRef `json:"user,omitempty"`
	AIGatewayUsageTotals
}

type AIGatewayUsageSummary struct {
	Totals      AIGatewayUsageTotals             `json:"totals"`
	Operations  []AIGatewayUsageOperationSummary `json:"operations"`
	TopModels   []AIGatewayUsageModelSummary     `json:"top_models"`
	TopUsers    []AIGatewayUsageUserSummary      `json:"top_users"`
	GeneratedAt time.Time                        `json:"generated_at"`
}

type AIGatewayUsageReporter interface {
	ListGatewayUsageLogs(ctx context.Context, filter AIGatewayUsageLogFilter) (AIGatewayUsageLogPage, error)
	ExportGatewayUsageLogs(ctx context.Context, filter AIGatewayUsageLogFilter, limit int) ([]AIGatewayUsageLog, error)
	SummarizeGatewayUsage(ctx context.Context, filter AIGatewayUsageLogFilter) (AIGatewayUsageSummary, error)
}

type AIGatewayCallAuditInput struct {
	UserID           uint           `json:"user_id"`
	Context          AIUsageContext `json:"context"`
	CatalogEntryID   *uint          `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID   *uint          `json:"route_binding_id,omitempty"`
	CredentialID     uint           `json:"credential_id"`
	Provider         string         `json:"provider,omitempty"`
	OperationType    string         `json:"operation_type"`
	PromptName       string         `json:"prompt_name,omitempty"`
	RequestModel     string         `json:"request_model,omitempty"`
	ResponseModel    string         `json:"response_model,omitempty"`
	RequestPayload   any            `json:"request_payload,omitempty"`
	Response         *TextResponse  `json:"response,omitempty"`
	StartedAt        time.Time      `json:"started_at,omitempty"`
	LatencyMs        int64          `json:"latency_ms,omitempty"`
	Status           string         `json:"status,omitempty"`
	Error            string         `json:"error,omitempty"`
	RetentionDays    int            `json:"retention_days,omitempty"`
	PayloadTruncated bool           `json:"payload_truncated,omitempty"`
}

type AIGatewayCallAuditor interface {
	RecordGatewayCall(ctx context.Context, input AIGatewayCallAuditInput) error
}

type AIGatewayCallLogFilter struct {
	UserID          string     `json:"user_id,omitempty"`
	OrgID           string     `json:"org_id,omitempty"`
	ProjectID       string     `json:"project_id,omitempty"`
	ModelID         string     `json:"model_id,omitempty"`
	CredentialID    string     `json:"credential_id,omitempty"`
	GatewayAPIKeyID string     `json:"gateway_api_key_id,omitempty"`
	OperationType   string     `json:"operation_type,omitempty"`
	Status          string     `json:"status,omitempty"`
	Provider        string     `json:"provider,omitempty"`
	PromptName      string     `json:"prompt_name,omitempty"`
	Since           *time.Time `json:"since,omitempty"`
	Until           *time.Time `json:"until,omitempty"`
	IncludeExpired  bool       `json:"include_expired,omitempty"`
	ExpiredOnly     bool       `json:"expired_only,omitempty"`
	Page            int        `json:"page,omitempty"`
	PageSize        int        `json:"page_size,omitempty"`
}

type AIGatewayCallLogUserRef struct {
	ID         uint   `json:"ID"`
	Username   string `json:"username"`
	SystemRole string `json:"system_role"`
}

type AIGatewayCallLog struct {
	ID                uint                     `json:"ID"`
	RequestID         string                   `json:"request_id,omitempty"`
	UserID            uint                     `json:"user_id"`
	User              *AIGatewayCallLogUserRef `json:"user,omitempty"`
	OrgID             *uint                    `json:"org_id,omitempty"`
	ProjectID         *uint                    `json:"project_id,omitempty"`
	GatewayAPIKeyID   *uint                    `json:"gateway_api_key_id,omitempty"`
	CatalogEntryID    *uint                    `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID    *uint                    `json:"route_binding_id,omitempty"`
	ModelID           string                   `json:"model_id,omitempty"`
	CredentialID      uint                     `json:"credential_id"`
	OperationType     string                   `json:"operation_type"`
	PromptName        string                   `json:"prompt_name,omitempty"`
	Provider          string                   `json:"provider,omitempty"`
	RequestModel      string                   `json:"request_model,omitempty"`
	ResponseModel     string                   `json:"response_model,omitempty"`
	Status            string                   `json:"status"`
	Error             string                   `json:"error,omitempty"`
	LatencyMs         int64                    `json:"latency_ms"`
	InputTokens       int                      `json:"input_tokens"`
	OutputTokens      int                      `json:"output_tokens"`
	CachedInputTokens int                      `json:"cached_input_tokens"`
	ReasoningTokens   int                      `json:"reasoning_tokens"`
	RequestJSON       string                   `json:"request_json,omitempty"`
	ResponseJSON      string                   `json:"response_json,omitempty"`
	PayloadTruncated  bool                     `json:"payload_truncated"`
	ExpiresAt         *time.Time               `json:"expires_at,omitempty"`
	RetentionDays     int                      `json:"retention_days"`
	CreatedAt         time.Time                `json:"CreatedAt"`
	UpdatedAt         time.Time                `json:"UpdatedAt"`
}

type AIGatewayCallLogPage struct {
	Items    []AIGatewayCallLog `json:"items"`
	Total    int64              `json:"total"`
	Page     int                `json:"page"`
	PageSize int                `json:"page_size"`
}

type AIGatewayCallLogSummary struct {
	Total             int64              `json:"total"`
	Success           int64              `json:"success"`
	Errors            int64              `json:"errors"`
	ErrorRate         float64            `json:"error_rate"`
	AvgLatencyMs      float64            `json:"avg_latency_ms"`
	InputTokens       int64              `json:"input_tokens"`
	OutputTokens      int64              `json:"output_tokens"`
	CachedInputTokens int64              `json:"cached_input_tokens"`
	ReasoningTokens   int64              `json:"reasoning_tokens"`
	RecentErrors      []AIGatewayCallLog `json:"recent_errors"`
	GeneratedAt       time.Time          `json:"generated_at"`
}

type AIGatewayAuditLogReader interface {
	ListGatewayCallLogs(ctx context.Context, filter AIGatewayCallLogFilter) (AIGatewayCallLogPage, error)
	SummarizeGatewayCallLogs(ctx context.Context, filter AIGatewayCallLogFilter) (AIGatewayCallLogSummary, error)
}

type AIGatewayProviderProbeRequest struct {
	Route        AIGatewayRouteRequest `json:"route,omitempty"`
	ProviderID   string                `json:"provider_id,omitempty"`
	CredentialID uint                  `json:"credential_id,omitempty"`
}

type AIGatewayProviderProbeResult struct {
	Health    ProviderHealth `json:"health"`
	Success   bool           `json:"success"`
	Message   string         `json:"message,omitempty"`
	LatencyMs int64          `json:"latency_ms,omitempty"`
}

type AIGatewayRuntimeHealth struct {
	CatalogEntryID      uint       `json:"catalog_entry_id,omitempty"`
	RouteBindingID      uint       `json:"route_binding_id,omitempty"`
	ModelID             string     `json:"model_id"`
	ModelDefID          string     `json:"model_def_id"`
	ProviderName        string     `json:"provider_name"`
	AdapterType         string     `json:"adapter_type"`
	Priority            int        `json:"priority"`
	CapacityWeight      int        `json:"capacity_weight"`
	MaxConcurrency      int        `json:"max_concurrency"`
	IsEnabled           bool       `json:"is_enabled"`
	InFlight            int        `json:"in_flight"`
	Saturated           bool       `json:"saturated"`
	Successes           uint64     `json:"successes"`
	Failures            uint64     `json:"failures"`
	ConsecutiveFailures uint64     `json:"consecutive_failures"`
	FailureRate         float64    `json:"failure_rate"`
	CircuitOpen         bool       `json:"circuit_open"`
	OpenUntil           *time.Time `json:"open_until,omitempty"`
	CooldownRemainingMs int64      `json:"cooldown_remaining_ms"`
}

type AIGatewayHealthProbe interface {
	ProbeGatewayProvider(ctx context.Context, request AIGatewayProviderProbeRequest) (AIGatewayProviderProbeResult, error)
	ListGatewayRuntimeHealth(ctx context.Context) ([]AIGatewayRuntimeHealth, error)
}

type AIGatewayProvider interface {
	TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error)
	ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error)
	VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error)
	Ping(ctx context.Context) error
}

type AIGatewayTextStreamProvider interface {
	TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error)
}

type AIGatewayResponsesProvider interface {
	ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error)
}

type AIGatewayResponsesStreamProvider interface {
	ResponsesStream(ctx context.Context, req ResponsesRequest) (<-chan ResponsesStreamEvent, error)
}

type AIGatewayVideoTaskProvider interface {
	VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error)
	VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error)
}

type AIGatewayVideoTaskCancelProvider interface {
	VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error)
}

type AIGatewayAudioSpeechProvider = media.TTSProvider

type AIGatewayAudioGenerationProvider = media.AudioGenerationProvider

type AIGatewayAudioSubtitleProvider = media.SubtitleProvider

type AIGatewayFileUploader interface {
	UploadFile(ctx context.Context, data []byte, filename, mimeType, purpose string) (string, error)
	DeleteFile(ctx context.Context, fileID string) error
}

// BlobStorage is the object storage provider surface used by application code.
type BlobStorage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, mimeType string) error
	Delete(ctx context.Context, key string) error
	DirectURL(ctx context.Context, key string) (string, error)
	GetObject(ctx context.Context, key string, start, end int64) (io.ReadCloser, int64, string, error)
	Backend() string
	Health(ctx context.Context) ProviderHealth
}

// Cache is the runtime cache provider surface used by application code.
type Cache interface {
	GetJSON(ctx context.Context, key string, dst any) (bool, error)
	SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error
	Delete(ctx context.Context, keys ...string) error
	GetVersion(ctx context.Context, namespace string) (int64, error)
	BumpVersion(ctx context.Context, namespace string) (int64, error)
	Close() error
}

type VectorDocument struct {
	ID        string         `json:"id"`
	Namespace string         `json:"namespace,omitempty"`
	SourceID  string         `json:"source_id,omitempty"`
	Locale    string         `json:"locale,omitempty"`
	Kind      string         `json:"kind,omitempty"`
	Text      string         `json:"text"`
	Embedding []float32      `json:"embedding,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

type VectorDocumentRef struct {
	ID          string `json:"id,omitempty"`
	Namespace   string `json:"namespace,omitempty"`
	SourceID    string `json:"source_id,omitempty"`
	ReferenceID uint   `json:"reference_id,omitempty"`
}

type VectorSearchRequest struct {
	Namespace string              `json:"namespace,omitempty"`
	Query     string              `json:"query,omitempty"`
	Embedding []float32           `json:"embedding,omitempty"`
	Locale    string              `json:"locale,omitempty"`
	SourceIDs []string            `json:"source_ids,omitempty"`
	Filters   map[string][]string `json:"filters,omitempty"`
	TopK      int                 `json:"top_k,omitempty"`
}

type VectorSearchResult struct {
	Document VectorDocument `json:"document"`
	Score    float64        `json:"score"`
}

type VectorIndexStats struct {
	Documents          int64            `json:"documents"`
	Namespaces         map[string]int64 `json:"namespaces,omitempty"`
	EmbeddingModels    map[string]int64 `json:"embedding_models,omitempty"`
	LastIndexedUnixSec int64            `json:"last_indexed_unix_sec,omitempty"`
}

type VectorRebuildRequest struct {
	Namespace string   `json:"namespace,omitempty"`
	SourceIDs []string `json:"source_ids,omitempty"`
	Reset     bool     `json:"reset,omitempty"`
}

type VectorRebuildResult struct {
	TaskID    string `json:"task_id,omitempty"`
	Accepted  bool   `json:"accepted"`
	Processed int    `json:"processed,omitempty"`
}

type VectorIndexProvider interface {
	Upsert(ctx context.Context, document VectorDocument) error
	Delete(ctx context.Context, ref VectorDocumentRef) error
	Search(ctx context.Context, request VectorSearchRequest) ([]VectorSearchResult, error)
	Stats(ctx context.Context) (VectorIndexStats, error)
	Rebuild(ctx context.Context, request VectorRebuildRequest) (VectorRebuildResult, error)
}

type MediaProbeRequest struct {
	Location  string `json:"location,omitempty"`
	MimeType  string `json:"mime_type,omitempty"`
	BytesHint int64  `json:"bytes_hint,omitempty"`
}

type MediaProbeResult struct {
	MimeType       string         `json:"mime_type,omitempty"`
	Width          int            `json:"width,omitempty"`
	Height         int            `json:"height,omitempty"`
	DurationMillis int64          `json:"duration_millis,omitempty"`
	Streams        []MediaStream  `json:"streams,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type MediaStream struct {
	Kind      string `json:"kind"`
	Codec     string `json:"codec,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	FrameRate string `json:"frame_rate,omitempty"`
	Channels  int    `json:"channels,omitempty"`
}

type MediaTranscodeRequest struct {
	InputLocation  string         `json:"input_location"`
	OutputLocation string         `json:"output_location,omitempty"`
	OutputFormat   string         `json:"output_format,omitempty"`
	Preset         string         `json:"preset,omitempty"`
	Options        map[string]any `json:"options,omitempty"`
}

type MediaTranscodeResult struct {
	OutputLocation string           `json:"output_location,omitempty"`
	Probe          MediaProbeResult `json:"probe,omitempty"`
}

type MediaFrameRequest struct {
	InputLocation string `json:"input_location"`
	TimeMillis    int64  `json:"time_millis"`
	OutputFormat  string `json:"output_format,omitempty"`
}

type MediaFrameResult struct {
	Bytes    []byte `json:"-"`
	MimeType string `json:"mime_type,omitempty"`
}

type MediaProcessingProvider interface {
	Probe(ctx context.Context, request MediaProbeRequest) (MediaProbeResult, error)
	Transcode(ctx context.Context, request MediaTranscodeRequest) (MediaTranscodeResult, error)
	ExtractFrame(ctx context.Context, request MediaFrameRequest) (MediaFrameResult, error)
}

type ExternalResourceSearchRequest struct {
	Query       string `json:"query"`
	MediaType   string `json:"media_type,omitempty"`
	Orientation string `json:"orientation,omitempty"`
	Page        int    `json:"page,omitempty"`
	PageSize    int    `json:"page_size,omitempty"`
}

type ExternalResourceSearchResult struct {
	Items    []ExternalResourceItem `json:"items"`
	Total    int                    `json:"total,omitempty"`
	NextPage string                 `json:"next_page,omitempty"`
}

type ExternalResourceItem struct {
	ProviderKey     string `json:"provider_key,omitempty"`
	ExternalID      string `json:"external_id"`
	MediaType       string `json:"media_type"`
	Title           string `json:"title,omitempty"`
	Description     string `json:"description,omitempty"`
	ThumbnailURL    string `json:"thumbnail_url,omitempty"`
	PreviewURL      string `json:"preview_url,omitempty"`
	SourceURL       string `json:"source_url,omitempty"`
	Width           int    `json:"width,omitempty"`
	Height          int    `json:"height,omitempty"`
	DurationSeconds int    `json:"duration_seconds,omitempty"`
	AuthorName      string `json:"author_name,omitempty"`
	AuthorURL       string `json:"author_url,omitempty"`
	AttributionText string `json:"attribution_text,omitempty"`
	LicenseLabel    string `json:"license_label,omitempty"`
}

type ExternalResourceProvider interface {
	Search(ctx context.Context, request ExternalResourceSearchRequest) (ExternalResourceSearchResult, error)
}

type AgentRuntimeProfile struct {
	ID           string            `json:"id"`
	Label        string            `json:"label,omitempty"`
	WorkspaceRef string            `json:"workspace_ref,omitempty"`
	Environment  map[string]string `json:"environment,omitempty"`
}

type AgentRuntimeSession struct {
	ID       string `json:"id"`
	Endpoint string `json:"endpoint,omitempty"`
	State    string `json:"state"`
}

const (
	AgentRuntimeCapabilityRemote          = "agent_runtime.remote"
	AgentRuntimeCapabilityDesktop         = "agent_runtime.desktop"
	AgentRuntimeCapabilityHealthProbe     = "health.probe"
	AgentRuntimeCapabilitySessionProxy    = "agent_session.proxy"
	AgentRuntimeCapabilityPermissionProbe = "agent_permission.probe"
)

const (
	AgentRuntimeWireProtocolVersion         = "movscript.agent-runtime.v1"
	AgentRuntimeEndpointHealth              = "/health"
	AgentRuntimeEndpointCapabilities        = "/capabilities"
	AgentRuntimeEndpointCreateSession       = "/v1/agent/sessions"
	AgentRuntimeEndpointSessionEvents       = "/v1/agent/sessions/{session_id}/events"
	AgentRuntimeEndpointSessionMessages     = "/v1/agent/sessions/{session_id}/messages"
	AgentRuntimeEndpointSessionTools        = "/v1/agent/sessions/{session_id}/tools"
	AgentRuntimeEndpointStopSession         = "/v1/agent/sessions/{session_id}"
	AgentRuntimeEndpointPermissionDecisions = "/v1/agent/permissions/{request_id}/decision"
)

type AgentRuntimeWireEndpoints struct {
	CreateSession       string `json:"create_session,omitempty"`
	SessionEvents       string `json:"session_events,omitempty"`
	SessionMessages     string `json:"session_messages,omitempty"`
	SessionTools        string `json:"session_tools,omitempty"`
	StopSession         string `json:"stop_session,omitempty"`
	PermissionDecisions string `json:"permission_decisions,omitempty"`
}

type AgentRuntimeCapabilities struct {
	ProtocolVersion string                    `json:"protocol_version,omitempty"`
	Capabilities    []string                  `json:"capabilities"`
	Endpoints       AgentRuntimeWireEndpoints `json:"endpoints,omitempty"`
}

type AgentPermissionProbeRequest struct {
	RequestID    string         `json:"request_id"`
	SessionID    string         `json:"session_id,omitempty"`
	WorkspaceRef string         `json:"workspace_ref,omitempty"`
	ToolName     string         `json:"tool_name,omitempty"`
	Action       string         `json:"action,omitempty"`
	Reason       string         `json:"reason,omitempty"`
	Payload      map[string]any `json:"payload,omitempty"`
}

type AgentPermissionDecision struct {
	RequestID string         `json:"request_id"`
	Decision  string         `json:"decision"`
	Reason    string         `json:"reason,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
}

type AgentSessionRequest struct {
	RuntimeID    string            `json:"runtime_id,omitempty"`
	WorkspaceRef string            `json:"workspace_ref"`
	AgentID      string            `json:"agent_id,omitempty"`
	ModelRef     string            `json:"model_ref,omitempty"`
	Environment  map[string]string `json:"environment,omitempty"`
}

type AgentSessionRef struct {
	RuntimeID string `json:"runtime_id,omitempty"`
	SessionID string `json:"session_id"`
}

type AgentMessage struct {
	Role    string         `json:"role"`
	Content string         `json:"content,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
}

type AgentEvent struct {
	Type    string         `json:"type"`
	Message string         `json:"message,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
	Done    bool           `json:"done,omitempty"`
}

type AgentToolDescriptor struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
}

type AgentRuntimeProvider interface {
	EnsureRuntime(ctx context.Context, profile AgentRuntimeProfile) (AgentRuntimeSession, error)
	StartSession(ctx context.Context, request AgentSessionRequest) (AgentSessionRef, error)
	SendMessage(ctx context.Context, session AgentSessionRef, message AgentMessage) (<-chan AgentEvent, error)
	ListTools(ctx context.Context, session AgentSessionRef) ([]AgentToolDescriptor, error)
	StopSession(ctx context.Context, session AgentSessionRef) error
}
