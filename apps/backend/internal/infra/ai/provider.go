package ai

import (
	"context"
	"encoding/json"
)

const DefaultTextMaxTokens = 200000

type TextRequest struct {
	Model       string
	Messages    []Message
	MaxTokens   int
	Temperature float32 // -1 = don't set (use model default); 0 = deterministic
	IsReasoning bool    // true = reasoning model path (system merged into user upstream)
	JSONMode    bool    // true = request structured JSON output format
	// PromptName identifies the compiled prompt in debug output.
	PromptName string
	// ExtraParams holds provider-specific extra fields to merge into the request body.
	// Used for grok2api/grop2api extensions: reasoning_effort, deepsearch, etc.
	// Keys here take precedence over any auto-derived fields with the same name.
	ExtraParams map[string]any
	Tools       json.RawMessage
	ToolChoice  json.RawMessage
}

type Message struct {
	Role       string // system | user | assistant | tool
	Content    string
	ToolCallID string
	ToolCalls  []ToolCall
}

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

type TokenUsage struct {
	InputTokens  int
	OutputTokens int
}

type ImageRequest struct {
	Model               string
	Prompt              string
	Size                string
	N                   int
	Quality             string      // "standard" | "hd"
	Style               string      // "vivid" | "natural" (DALL-E 3)
	AspectRatio         string      // "16:9" | "9:16" | "1:1" etc.
	Seed                *int64      // nil = provider default; -1 = provider random when supported
	GuidanceScale       float64     // prompt adherence for models that support it
	Watermark           *bool       // nil = provider default
	OutputFormat        string      // "jpeg" | "png" for providers that support it
	SequentialMode      string      // "disabled" | "auto" for Seedream group images
	SequentialMaxImages int         // max generated images when SequentialMode="auto"
	WebSearch           bool        // provider tool toggle
	OptimizePromptMode  string      // "standard" | "fast"
	InputImage          string      // presigned URL; when set, routes to /images/edits
	InputImageBytes     []byte      // raw image bytes; takes precedence over InputImage when non-nil
	InputImageMime      string      // MIME type for InputImageBytes (e.g. "image/png")
	InputImageDataList  []MediaData // ordered image inputs; takes precedence over the legacy single-image fields
	ImageFieldName      string      // multipart field name for the image; empty defaults to "image" (xAI uses "image[]")
	// CloudFileID is the provider-issued file ID from the Files API.
	// When set, imageEdit passes the file ID via JSON body instead of multipart bytes.
	CloudFileID string
	// EditOnly marks models that ONLY support image editing (image_edit capability).
	// If true and InputImage/InputImageBytes/CloudFileID is empty, ImageGenerate returns an error immediately.
	EditOnly bool
}

type ImageResponse struct {
	URLs  []string
	Debug *DebugCallResult
}

type VideoRequest struct {
	Model       string
	Prompt      string
	Image       string   // URL for single image-to-video reference (deprecated: prefer InputImageDataList)
	InputImages []string // Multiple image URLs (deprecated: prefer InputImageDataList)
	// InputImageDataList holds pre-fetched image bytes; takes precedence over Image/InputImages.
	InputImageDataList    []MediaData
	InputVideo            string     // URL for video-to-video reference (deprecated: prefer InputVideoData)
	InputVideoData        *MediaData // pre-fetched video bytes
	Duration              int        // requested duration in seconds (0 = model default)
	Frames                int        // requested frame count; provider-specific, mutually exclusive with Duration
	Seed                  *int64     // nil = provider default; -1 = provider random when supported
	Width                 int
	Height                int
	AspectRatio           string // "16:9" | "9:16" | "1:1"
	Ratio                 string // provider-native ratio; takes precedence over AspectRatio when set
	Quality               string // "standard" | "pro"
	Size                  string // pixel dimensions e.g. "720x1280"
	ResolutionName        string // "480p" | "720p"
	Preset                string // "normal" | "fun" | "spicy" | "custom"
	CameraFixed           *bool  // nil = provider default
	Watermark             *bool  // nil = provider default
	GenerateAudio         *bool  // nil = provider default
	ReturnLastFrame       *bool  // nil = provider default
	ServiceTier           string // "default" | "flex"
	ExecutionExpiresAfter int    // seconds; 0 = provider default
	Draft                 *bool  // nil = provider default
	WebSearch             bool   // provider tool toggle
}

// MediaData holds raw bytes for a media resource passed to AI adapters.
// Using bytes directly avoids re-fetching from storage URLs that may require auth.
// PresignedURL is set only when the worker has prepared an externally reachable
// URL for the provider call, not for private internal resource storage URLs.
type MediaData struct {
	Bytes        []byte
	MimeType     string // e.g. "image/png", "video/mp4"
	PresignedURL string // provider-readable URL valid for the duration of the call; may be empty
	CloudFileID  string // provider Files API ID when the target API accepts file_id
	ResourceID   uint   // RawResource ID, used for provider/cloud upload caching
}

type VideoResponse struct {
	TaskID       string
	TaskKind     string
	Status       string
	Message      string
	URL          string
	DurationSec  int    // actual billed duration in seconds
	ContentBytes []byte // raw bytes if downloaded directly (auth-gated content)
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

// DebugHTTPExchange captures one HTTP request/response made to a provider.
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

type Provider interface {
	TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error)
	ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error)
	VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error)
	// Ping tests connectivity without generating content (used for admin key validation).
	Ping(ctx context.Context) error
}

type TextStreamProvider interface {
	TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error)
}

type ResponsesProvider interface {
	ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error)
}

// VideoTaskProvider exposes platforms whose video APIs are inherently async.
// VideoStart must submit the task once and return the provider task ID.
// VideoPoll must inspect an existing provider task without creating a new one.
type VideoTaskProvider interface {
	VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error)
	VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error)
}

// VideoTaskCancelProvider exposes provider-side cancellation for async video tasks.
// Implementations may support only a subset of provider task states.
type VideoTaskCancelProvider interface {
	VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error)
}

// DebugCallResult captures the raw HTTP exchange plus job-level context for debugging.
// Job context fields (prefixed JobXxx) are filled by the worker before the adapter call.
// HTTP exchange fields are filled by the adapter via recordDebug.
type DebugCallResult struct {
	// ── Job context (filled by worker) ───────────────────────────────────────
	JobType             string `json:"job_type,omitempty"`               // job_type used: image|image_edit|video|video_i2v|video_v2v
	JobModelDefID       string `json:"job_model_def_id,omitempty"`       // ModelDef.ID e.g. "kling:v1-5-standard-i2v"
	JobResolvedPrompt   string `json:"job_resolved_prompt,omitempty"`    // prompt after @[resource:N] mention resolution
	JobInputResourceIDs []uint `json:"job_input_resource_ids,omitempty"` // ordered resource IDs passed to the adapter

	// Calls keeps every provider HTTP exchange for multi-step jobs such as task
	// creation, polling, and content download. The flat fields below mirror the
	// latest call for backward compatibility with existing UI/API consumers.
	Calls []DebugHTTPExchange `json:"calls,omitempty"`

	// ── HTTP exchange (filled by adapter via recordDebug) ────────────────────
	Success        bool                 `json:"success"`
	ModelID        string               `json:"model_id"` // actual model ID sent to API
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

type DebugPromptMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
