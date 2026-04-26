package ai

import "context"

type TextRequest struct {
	Model       string
	Messages    []Message
	MaxTokens   int
	Temperature float32 // -1 = don't set (use model default); 0 = deterministic
	IsReasoning bool    // true = reasoning model path (system merged into user upstream)
	JSONMode    bool    // true = request structured JSON output format
	// ExtraParams holds provider-specific extra fields to merge into the request body.
	// Used for grok2api/grop2api extensions: reasoning_effort, deepsearch, etc.
	// Keys here take precedence over any auto-derived fields with the same name.
	ExtraParams map[string]any
}

type Message struct {
	Role    string // system | user | assistant
	Content string
}

type TextResponse struct {
	Content string
	Usage   TokenUsage
	Debug   *DebugCallResult
}

type TokenUsage struct {
	InputTokens  int
	OutputTokens int
}

type ImageRequest struct {
	Model              string
	Prompt             string
	Size               string
	N                  int
	Quality            string      // "standard" | "hd"
	Style              string      // "vivid" | "natural" (DALL-E 3)
	AspectRatio        string      // "16:9" | "9:16" | "1:1" etc.
	InputImage         string      // presigned URL; when set, routes to /images/edits
	InputImageBytes    []byte      // raw image bytes; takes precedence over InputImage when non-nil
	InputImageMime     string      // MIME type for InputImageBytes (e.g. "image/png")
	InputImageDataList []MediaData // ordered image inputs; takes precedence over the legacy single-image fields
	ImageFieldName     string      // multipart field name for the image; empty defaults to "image" (xAI uses "image[]")
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
	InputImageDataList []MediaData
	InputVideo         string     // URL for video-to-video reference (deprecated: prefer InputVideoData)
	InputVideoData     *MediaData // pre-fetched video bytes
	Duration           int        // requested duration in seconds (0 = model default)
	Width              int
	Height             int
	AspectRatio        string // "16:9" | "9:16" | "1:1"
	Quality            string // "standard" | "pro"
	Size               string // pixel dimensions e.g. "720x1280"
	ResolutionName     string // "480p" | "720p"
	Preset             string // "normal" | "fun" | "spicy" | "custom"
}

// MediaData holds raw bytes for a media resource passed to AI adapters.
// Using bytes directly avoids re-fetching from storage URLs that may require auth.
// PresignedURL is set when available, for adapters that accept a URL in JSON body (e.g. Kling, Ark).
type MediaData struct {
	Bytes        []byte
	MimeType     string // e.g. "image/png", "video/mp4"
	PresignedURL string // public URL valid for the duration of the call; may be empty
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
)

type VideoPollRequest struct {
	Model    string
	TaskID   string
	TaskKind string
}

// DebugHTTPExchange captures one HTTP request/response made to a provider.
type DebugHTTPExchange struct {
	Success        bool              `json:"success"`
	ModelID        string            `json:"model_id"`
	Endpoint       string            `json:"endpoint"`
	Method         string            `json:"method"`
	RequestHeaders map[string]string `json:"request_headers,omitempty"`
	RequestBody    string            `json:"request_body"`
	ResponseStatus int               `json:"response_status"`
	ResponseBody   string            `json:"response_body"`
	LatencyMs      int64             `json:"latency_ms"`
	Error          string            `json:"error,omitempty"`
}

type Provider interface {
	TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error)
	ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error)
	VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error)
	// Ping tests connectivity without generating content (used for admin key validation).
	Ping(ctx context.Context) error
}

// VideoTaskProvider exposes platforms whose video APIs are inherently async.
// VideoStart must submit the task once and return the provider task ID.
// VideoPoll must inspect an existing provider task without creating a new one.
type VideoTaskProvider interface {
	VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error)
	VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error)
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
	Success        bool              `json:"success"`
	ModelID        string            `json:"model_id"` // actual model ID sent to API
	Endpoint       string            `json:"endpoint"`
	Method         string            `json:"method"`
	RequestHeaders map[string]string `json:"request_headers,omitempty"`
	RequestBody    string            `json:"request_body"`
	ResponseStatus int               `json:"response_status"`
	ResponseBody   string            `json:"response_body"`
	LatencyMs      int64             `json:"latency_ms"`
	Error          string            `json:"error,omitempty"`
}
