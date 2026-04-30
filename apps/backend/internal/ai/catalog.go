package ai

import "encoding/json"

// BillingMode defines how credits are charged per model call.
type BillingMode string

const (
	BillingPerToken  BillingMode = "per_token"  // credits × (input + output tokens / 1M)
	BillingPerImage  BillingMode = "per_image"  // credits × image count
	BillingPerSecond BillingMode = "per_second" // credits × video duration seconds
	BillingPerCall   BillingMode = "per_call"   // fixed credits per call
)

// Adapter type constants.
const (
	AdapterOpenAICompat = "openai_compat"
	AdapterAnthropic    = "anthropic"
	AdapterKling        = "kling"
	AdapterVolcen       = "volcen" // Volcengine Ark: text (doubao), image (Seedream), video (Seedance)
	AdapterGemini       = "gemini" // Google Gemini API (text/image/video)
)

// ParamDef describes a user-configurable generation parameter for a model.
// The frontend renders these as form controls so users can tune generation without
// relying on hidden backend defaults.
type ParamDef struct {
	Key     string      `json:"key"`
	Label   string      `json:"label"`
	Type    string      `json:"type"`              // "select" | "number" | "boolean"
	Options []string    `json:"options,omitempty"` // for type=select
	Default interface{} `json:"default,omitempty"`
	Min     float64     `json:"min,omitempty"`
	Max     float64     `json:"max,omitempty"`
	Step    float64     `json:"step,omitempty"`
}

// AdapterParamSet describes the default generation controls exposed by an adapter
// for a capability. Model configs inherit these controls unless admins override
// CustomSupportedParams to restrict or remove parameters for a specific model.
type AdapterParamSet struct {
	Capability string     `json:"capability"`
	Params     []ParamDef `json:"params"`
}

// ModelDef describes an enabled model after resolving its admin-declared config
// with adapter defaults. It is used at runtime and is not a catalog entry.
type ModelDef struct {
	ID           string // logical model ID, usually the configured provider model ID
	ModelID      string // API model ID sent in requests
	DisplayName  string
	Capabilities []string // use Capability* constants: "text", "image", "video", "video_i2v", "video_v2v", "image_edit", "reasoning"
	BillingMode  BillingMode
	AdapterType  string

	// AllowModelIDOverride lets admins replace the ModelID (e.g. Volcengine ep-xxx endpoints).
	AllowModelIDOverride bool

	// ImageEditField is the multipart form field name used when sending an image to /images/edits.
	// Empty means the adapter uses the default ("image"). Set to "image[]" for xAI-compatible APIs.
	ImageEditField string

	// AcceptsImageInput indicates the model can receive an image as input.
	// True for image_edit models and image-to-video (i2v) models.
	// Frontend uses this to decide whether to show the image upload area.
	AcceptsImageInput bool

	// MaxInputImages is the maximum number of image inputs the model accepts.
	// 0 = no image input, 1 = single image, -1 = unlimited.
	MaxInputImages int

	// MaxInputVideos is the maximum number of video inputs the model accepts.
	// 0 = no video input, 1 = single video, -1 = unlimited.
	MaxInputVideos int

	// SupportedParams lists user-configurable generation parameters exposed in the UI.
	SupportedParams []ParamDef

	// SupportedParamsExplicit is true when SupportedParams came from the model
	// config override rather than adapter defaults. It lets an explicit empty
	// list mean "this model accepts no generation params".
	SupportedParamsExplicit bool `json:"-"`

	// Reference USD pricing — informational; admins set actual credit prices separately.
	RefInputUSDPer1M  float64 // per_token: per 1M input tokens
	RefOutputUSDPer1M float64 // per_token: per 1M output tokens
	RefUSDPerImage    float64 // per_image: per image
	RefUSDPerSecond   float64 // per_second: per second of video

	// Video generation params.
	DefaultDurSec int
	MaxDurSec     int
}

// ModelPreset is a read-only admin UI template for quickly filling the add-model form.
// Runtime routing and generation parameter controls never consult this list.
type ModelPreset struct {
	ID                string      `json:"id"`
	ModelID           string      `json:"model_id"`
	DisplayName       string      `json:"display_name"`
	Capabilities      []string    `json:"capabilities"`
	BillingMode       BillingMode `json:"billing_mode"`
	AdapterType       string      `json:"adapter_type"`
	AcceptsImageInput bool        `json:"accepts_image_input"`
	MaxInputImages    int         `json:"max_input_images"`
	MaxInputVideos    int         `json:"max_input_videos"`
	ImageEditField    string      `json:"image_edit_field,omitempty"`
	RefInputUSDPer1M  float64     `json:"ref_input_usd_per_1m,omitempty"`
	RefOutputUSDPer1M float64     `json:"ref_output_usd_per_1m,omitempty"`
	RefUSDPerImage    float64     `json:"ref_usd_per_image,omitempty"`
	RefUSDPerSecond   float64     `json:"ref_usd_per_second,omitempty"`
}

// CredField describes one credential input field for an adapter.
type CredField struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Hint     string `json:"hint,omitempty"`
	Required bool   `json:"required"`
}

// AdapterDef describes how to authenticate with a specific adapter.
// One AdapterDef = one set of credentials + one adapter implementation.
type AdapterDef struct {
	AdapterType      string            `json:"adapter_type"`
	DisplayName      string            `json:"display_name"`
	Description      string            `json:"description"`
	DefaultBaseURL   string            `json:"default_base_url"`
	CredFields       []CredField       `json:"cred_fields"`
	SupportsFilesAPI bool              `json:"supports_files_api"` // provider has a Files API for pre-uploading media
	ParamSets        []AdapterParamSet `json:"param_sets,omitempty"`
}

func commonImageParams() []ParamDef {
	return []ParamDef{
		{Key: "image_size", Label: "画面尺寸", Type: "select",
			Options: []string{"1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280"}, Default: "1024x1024"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"1:1", "16:9", "9:16", "4:3", "3:4"}, Default: "1:1"},
		{Key: "quality", Label: "质量", Type: "select",
			Options: []string{"auto", "standard", "hd", "high", "medium", "low"}, Default: "auto"},
		{Key: "style", Label: "风格", Type: "select",
			Options: []string{"vivid", "natural"}, Default: "vivid"},
	}
}

func openAICompatVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5", "6", "8", "10", "12", "16", "20"}, Default: "6"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		{Key: "image_size", Label: "画面尺寸", Type: "select",
			Options: []string{"1280x720", "720x1280", "1024x1024"}, Default: "1280x720"},
		{Key: "resolution", Label: "清晰度", Type: "select",
			Options: []string{"480p", "720p", "1080p"}, Default: "720p"},
		{Key: "preset", Label: "预设", Type: "select",
			Options: []string{"normal", "fun", "spicy", "custom"}, Default: "normal"},
		{Key: "quality", Label: "质量", Type: "select",
			Options: []string{"standard", "pro"}, Default: "standard"},
	}
}

func klingVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5", "10"}, Default: "5"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
	}
}

func geminiImageParams() []ParamDef {
	return []ParamDef{
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, Default: "1:1"},
	}
}

func geminiVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"6", "8"}, Default: "6"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16"}, Default: "16:9"},
	}
}

func volcenImageParams() []ParamDef {
	params := volcenSeedream5LiteParams()
	params = append(params, ParamDef{Key: "prompt_strength", Label: "提示词强度", Type: "number", Default: 2.5, Min: 1, Max: 10, Step: 0.1})
	params = append(params, ParamDef{Key: "seed", Label: "种子", Type: "number", Default: -1, Min: -1, Max: 4294967295, Step: 1})
	return params
}

func volcenVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"-1", "2", "4", "5", "10", "12", "15"}, Default: "5"},
		{Key: "frames", Label: "帧数", Type: "number", Min: 29, Max: 289, Step: 4},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}, Default: "16:9"},
		{Key: "resolution", Label: "清晰度", Type: "select",
			Options: []string{"480p", "720p", "1080p"}, Default: "720p"},
		{Key: "seed", Label: "种子", Type: "number", Default: -1, Min: -1, Max: 4294967295, Step: 1},
		{Key: "fixed_camera", Label: "固定镜头", Type: "boolean", Default: false},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: false},
		{Key: "audio", Label: "生成音频", Type: "boolean", Default: true},
		{Key: "return_last_frame", Label: "返回尾帧", Type: "boolean", Default: false},
		{Key: "service_tier", Label: "服务等级", Type: "select",
			Options: []string{"default", "flex"}, Default: "default"},
		{Key: "execution_expires_after", Label: "过期时间(秒)", Type: "number", Min: 1, Step: 1},
		{Key: "draft", Label: "样片模式", Type: "boolean", Default: false},
		{Key: "web_search", Label: "联网搜索", Type: "boolean", Default: false},
	}
}

// AdapterDefs lists all supported adapter definitions.
var AdapterDefs = []AdapterDef{
	{
		AdapterType:      AdapterOpenAICompat,
		DisplayName:      "OpenAI 兼容 API",
		Description:      "兼容 OpenAI 接口的文本/图像模型，支持 OpenAI、DeepSeek、豆包文本/图像等",
		DefaultBaseURL:   "https://api.openai.com/v1",
		SupportsFilesAPI: true,
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理或第三方兼容接口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityImage, Params: commonImageParams()},
			{Capability: CapabilityImageEdit, Params: commonImageParams()},
			{Capability: CapabilityVideo, Params: openAICompatVideoParams()},
			{Capability: CapabilityVideoI2V, Params: openAICompatVideoParams()},
			{Capability: CapabilityVideoV2V, Params: openAICompatVideoParams()},
		},
	},
	{
		AdapterType:    AdapterAnthropic,
		DisplayName:    "Anthropic",
		Description:    "Claude 系列文本模型",
		DefaultBaseURL: "https://api.anthropic.com",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理或第三方兼容接口）", Required: false},
		},
	},
	{
		AdapterType: AdapterKling,
		DisplayName: "可灵 (Kling)",
		Description: "快手旗下视频/图像生成模型，使用 Access Key + Secret Key 鉴权",
		CredFields: []CredField{
			{Key: "access_key", Label: "Access Key", Required: true},
			{Key: "secret_key", Label: "Secret Key", Required: true},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: klingVideoParams()},
			{Capability: CapabilityVideoI2V, Params: klingVideoParams()},
		},
	},
	{
		AdapterType:      AdapterVolcen,
		DisplayName:      "火山引擎 Ark",
		Description:      "字节跳动 Ark 平台：豆包文本、Seedream 图像生成、Seedance 视频生成（原生 Ark SDK）",
		DefaultBaseURL:   "https://ark.cn-beijing.volces.com/api/v3",
		SupportsFilesAPI: true,
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityImage, Params: volcenImageParams()},
			{Capability: CapabilityImageEdit, Params: volcenImageParams()},
			{Capability: CapabilityVideo, Params: volcenVideoParams()},
			{Capability: CapabilityVideoI2V, Params: volcenVideoParams()},
			{Capability: CapabilityVideoV2V, Params: volcenVideoParams()},
		},
	},
	{
		AdapterType:    AdapterGemini,
		DisplayName:    "Google Gemini",
		Description:    "Google AI：Gemini 文本对话、Imagen 图像生成、Veo 视频生成",
		DefaultBaseURL: "https://generativelanguage.googleapis.com",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityImage, Params: geminiImageParams()},
			{Capability: CapabilityImageEdit, Params: geminiImageParams()},
			{Capability: CapabilityVideo, Params: geminiVideoParams()},
			{Capability: CapabilityVideoI2V, Params: geminiVideoParams()},
		},
	},
}

func volcenSeedream3Params() []ParamDef {
	return []ParamDef{
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"1:1", "16:9", "9:16", "4:3", "3:4"}, Default: "1:1"},
		{Key: "seed", Label: "种子", Type: "number", Default: -1, Min: -1, Max: 2147483647, Step: 1},
		{Key: "prompt_strength", Label: "提示词强度", Type: "number", Default: 2.5, Min: 1, Max: 10, Step: 0.1},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: true},
	}
}

func volcenSeedream4Params(resolutionOptions []string) []ParamDef {
	sizeOptions := append([]string{}, resolutionOptions...)
	sizeOptions = append(sizeOptions,
		"1024x1024", "2048x2048", "2304x1728", "1728x2304",
		"2848x1600", "1600x2848", "4096x4096", "5504x3040", "3040x5504",
	)
	return []ParamDef{
		{Key: "image_size", Label: "画面尺寸", Type: "select", Options: sizeOptions, Default: "2048x2048"},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: true},
		{Key: "sequential_image_generation", Label: "组图", Type: "select",
			Options: []string{"disabled", "auto"}, Default: "disabled"},
		{Key: "image_count", Label: "生成张数", Type: "number", Min: 1, Max: 15, Step: 1},
		{Key: "optimize_prompt_mode", Label: "提示词优化", Type: "select",
			Options: []string{"standard", "fast"}, Default: "standard"},
	}
}

func volcenSeedream5LiteParams() []ParamDef {
	params := volcenSeedream4Params([]string{"2K", "3K", "4K"})
	params = append(params,
		ParamDef{Key: "output_format", Label: "格式", Type: "select", Options: []string{"jpeg", "png"}, Default: "jpeg"},
		ParamDef{Key: "web_search", Label: "联网搜索", Type: "boolean", Default: false},
	)
	return params
}

func volcenSeedanceParams(durationOptions, ratioOptions, resolutionOptions []string, withAudio, withCameraFixed, withServiceTier, withWebSearch, withDraft bool) []ParamDef {
	params := []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select", Options: durationOptions, Default: "5"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select", Options: ratioOptions, Default: ratioOptions[0]},
		{Key: "resolution", Label: "分辨率", Type: "select", Options: resolutionOptions, Default: "720p"},
		{Key: "seed", Label: "种子", Type: "number", Default: -1, Min: -1, Max: 4294967295, Step: 1},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: false},
	}
	if withAudio {
		params = append(params, ParamDef{Key: "audio", Label: "生成音频", Type: "boolean", Default: true})
	}
	if withCameraFixed {
		params = append(params, ParamDef{Key: "fixed_camera", Label: "固定镜头", Type: "boolean", Default: false})
	}
	params = append(params, ParamDef{Key: "return_last_frame", Label: "返回尾帧", Type: "boolean", Default: false})
	if withServiceTier {
		params = append(params, ParamDef{Key: "service_tier", Label: "服务等级", Type: "select", Options: []string{"default", "flex"}, Default: "default"})
	}
	if withWebSearch {
		params = append(params, ParamDef{Key: "web_search", Label: "联网搜索", Type: "boolean", Default: false})
	}
	if withDraft {
		params = append(params, ParamDef{Key: "draft", Label: "样片模式", Type: "boolean", Default: false})
	}
	return params
}

// ModelPresets returns read-only well-known models used only as UI templates.
// The admin can pick a preset to pre-fill the add-model form; all values are
// editable and the list is never consulted at runtime.
func ModelPresets() []ModelPreset {
	result := make([]ModelPreset, 0, len(modelPresetSources))
	for _, def := range modelPresetSources {
		result = append(result, ModelPreset{
			ID:                def.ID,
			ModelID:           def.ModelID,
			DisplayName:       def.DisplayName,
			Capabilities:      def.Capabilities,
			BillingMode:       def.BillingMode,
			AdapterType:       def.AdapterType,
			AcceptsImageInput: def.AcceptsImageInput,
			MaxInputImages:    def.MaxInputImages,
			MaxInputVideos:    def.MaxInputVideos,
			ImageEditField:    def.ImageEditField,
			RefInputUSDPer1M:  def.RefInputUSDPer1M,
			RefOutputUSDPer1M: def.RefOutputUSDPer1M,
			RefUSDPerImage:    def.RefUSDPerImage,
			RefUSDPerSecond:   def.RefUSDPerSecond,
		})
	}
	return result
}

var modelPresetSources = []ModelDef{

	// ─── OpenAI ────────────────────────────────────────────────────────────────

	{ID: "openai:gpt-4o", ModelID: "gpt-4o",
		DisplayName: "GPT-4o", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 2.50, RefOutputUSDPer1M: 10.00},

	{ID: "openai:gpt-4o-mini", ModelID: "gpt-4o-mini",
		DisplayName: "GPT-4o mini", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 0.15, RefOutputUSDPer1M: 0.60},

	{ID: "openai:gpt-4.1", ModelID: "gpt-4.1",
		DisplayName: "GPT-4.1", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 2.00, RefOutputUSDPer1M: 8.00},

	{ID: "openai:gpt-4.1-mini", ModelID: "gpt-4.1-mini",
		DisplayName: "GPT-4.1 mini", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 0.40, RefOutputUSDPer1M: 1.60},

	{ID: "openai:o3-mini", ModelID: "o3-mini",
		DisplayName: "o3-mini (推理)", Capabilities: []string{"text", "reasoning"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		RefInputUSDPer1M: 1.10, RefOutputUSDPer1M: 4.40},

	{ID: "openai:dall-e-3", ModelID: "dall-e-3",
		DisplayName: "DALL-E 3", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.040,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1024x1792", "1792x1024"}, Default: "1024x1024"},
			{Key: "quality", Label: "质量", Type: "select",
				Options: []string{"standard", "hd"}, Default: "standard"},
			{Key: "style", Label: "风格", Type: "select",
				Options: []string{"vivid", "natural"}, Default: "vivid"},
		}},

	{ID: "openai:gpt-image-1", ModelID: "gpt-image-1",
		DisplayName: "GPT Image 1 (文生图)", Capabilities: []string{CapabilityImage},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.040,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1536x1024", "1024x1536"}, Default: "1024x1024"},
			{Key: "quality", Label: "质量", Type: "select",
				Options: []string{"auto", "high", "medium", "low"}, Default: "auto"},
		}},

	{ID: "openai:gpt-image-1-edit", ModelID: "gpt-image-1",
		DisplayName: "GPT Image 1 (图像编辑)", Capabilities: []string{CapabilityImageEdit},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 1,
		RefUSDPerImage: 0.040,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1536x1024", "1024x1536"}, Default: "1024x1024"},
			{Key: "quality", Label: "质量", Type: "select",
				Options: []string{"auto", "high", "medium", "low"}, Default: "auto"},
		}},

	// ─── Anthropic ─────────────────────────────────────────────────────────────

	{ID: "anthropic:claude-3-5-sonnet", ModelID: "claude-3-5-sonnet-20241022",
		DisplayName: "Claude 3.5 Sonnet", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "anthropic:claude-3-7-sonnet", ModelID: "claude-3-7-sonnet-20250219",
		DisplayName: "Claude 3.7 Sonnet (推理)", Capabilities: []string{"text", "reasoning"},
		BillingMode: BillingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "anthropic:claude-3-5-haiku", ModelID: "claude-3-5-haiku-20241022",
		DisplayName: "Claude 3.5 Haiku", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 0.80, RefOutputUSDPer1M: 4.00},

	{ID: "anthropic:claude-opus-4", ModelID: "claude-opus-4-5",
		DisplayName: "Claude Opus 4", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterAnthropic,
		RefInputUSDPer1M: 15.00, RefOutputUSDPer1M: 75.00},

	// ─── Volcengine Ark ────────────────────────────────────────────────────────
	// Text models: direct model name invocation (Ark "direct invocation").
	// AllowModelIDOverride lets admins substitute their own ep-xxx endpoint IDs.
	// ModelID uses official Ark format: {name}-{YYMMDD timestamp}.

	// Seed 2.0 series (Feb 2026)
	{ID: "volcengine:doubao-seed-2-0-pro", ModelID: "doubao-seed-2-0-pro-260215",
		DisplayName: "豆包 Seed 2.0 Pro", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.67, RefOutputUSDPer1M: 3.36},

	{ID: "volcengine:doubao-seed-2-0-lite", ModelID: "doubao-seed-2-0-lite-260215",
		DisplayName: "豆包 Seed 2.0 Lite", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.13, RefOutputUSDPer1M: 0.76},

	{ID: "volcengine:doubao-seed-2-0-mini", ModelID: "doubao-seed-2-0-mini-260215",
		DisplayName: "豆包 Seed 2.0 Mini", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.06, RefOutputUSDPer1M: 0.56},

	// Seed 1.8
	{ID: "volcengine:doubao-seed-1-8", ModelID: "doubao-seed-1.8-251228",
		DisplayName: "豆包 Seed 1.8", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.12, RefOutputUSDPer1M: 0.29},

	// Seed 1.6 series
	{ID: "volcengine:doubao-seed-1-6", ModelID: "doubao-seed-1.6-251015",
		DisplayName: "豆包 Seed 1.6", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	{ID: "volcengine:doubao-seed-1-6-lite", ModelID: "doubao-seed-1.6-lite-251015",
		DisplayName: "豆包 Seed 1.6 Lite", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.07, RefOutputUSDPer1M: 0.21},

	{ID: "volcengine:doubao-seed-1-6-flash", ModelID: "doubao-seed-1.6-flash-250828",
		DisplayName: "豆包 Seed 1.6 Flash", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.04, RefOutputUSDPer1M: 0.12},

	{ID: "volcengine:doubao-seed-1-6-vision", ModelID: "doubao-seed-1.6-vision-250815",
		DisplayName: "豆包 Seed 1.6 Vision", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	// 1.5 Lite
	{ID: "volcengine:doubao-1-5-lite-32k", ModelID: "doubao-1.5-lite-32k-250115",
		DisplayName: "豆包 1.5 Lite 32k", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.04, RefOutputUSDPer1M: 0.12},

	// ─── Volcengine doubao text — native Ark SDK (volcen adapter) ──────────────
	// Same models as above but accessed via the Ark SDK instead of OpenAI-compat.
	// Admins can choose either integration depending on their setup.

	{ID: "volcengine-ark:doubao-seed-2-0-pro", ModelID: "doubao-seed-2-0-pro-260215",
		DisplayName: "豆包 Seed 2.0 Pro (Ark 原生)", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.67, RefOutputUSDPer1M: 3.36},

	{ID: "volcengine-ark:doubao-seed-2-0-lite", ModelID: "doubao-seed-2-0-lite-260215",
		DisplayName: "豆包 Seed 2.0 Lite (Ark 原生)", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.13, RefOutputUSDPer1M: 0.76},

	{ID: "volcengine-ark:doubao-seed-1-6", ModelID: "doubao-seed-1.6-251015",
		DisplayName: "豆包 Seed 1.6 (Ark 原生)", Capabilities: []string{"text"},
		BillingMode: BillingPerToken, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefInputUSDPer1M:     0.20, RefOutputUSDPer1M: 0.60},

	// Seedream image generation — OpenAI-compat interface.
	{ID: "volcengine:seedream-3-0", ModelID: "doubao-seedream-3-0-t2i-250415",
		DisplayName: "Seedream 3.0 图像", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		RefUSDPerImage:       0.002,
		SupportedParams:      volcenSeedream3Params()},

	{ID: "volcengine:seedream-4-0", ModelID: "doubao-seedream-4-0-250828",
		DisplayName: "Seedream 4.0 图像", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.020,
		SupportedParams: volcenSeedream4Params([]string{"1K", "2K", "4K"})},

	{ID: "volcengine:seedream-4-5", ModelID: "doubao-seedream-4-5-251128",
		DisplayName: "Seedream 4.5 图像", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.040,
		SupportedParams: volcenSeedream4Params([]string{"2K", "4K"})},

	{ID: "volcengine:seedream-5-0", ModelID: "doubao-seedream-5-0-260128",
		DisplayName: "Seedream 5.0 图像", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.050,
		SupportedParams: volcenSeedream5LiteParams()},

	{ID: "volcengine:seedream-5-0-lite", ModelID: "doubao-seedream-5-0-lite-260128",
		DisplayName: "Seedream 5.0 Lite 图像", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.035,
		SupportedParams: volcenSeedream5LiteParams()},

	// Seedream image generation — native Ark SDK (volcen adapter).
	{ID: "volcengine-ark:seedream-3-0", ModelID: "doubao-seedream-3-0-t2i-250415",
		DisplayName: "Seedream 3.0 图像 (Ark 原生)", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		RefUSDPerImage:       0.002,
		SupportedParams:      volcenSeedream3Params()},

	{ID: "volcengine-ark:seedream-5-0", ModelID: "doubao-seedream-5-0-260128",
		DisplayName: "Seedream 5.0 图像 (Ark 原生)", Capabilities: []string{"image"},
		BillingMode: BillingPerImage, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		AcceptsImageInput:    true, MaxInputImages: 14,
		RefUSDPerImage:  0.050,
		SupportedParams: volcenSeedream5LiteParams()},

	// Seedance video generation (async task API — uses volcen adapter).
	{ID: "volcengine:seedance-1-0-lite-t2v", ModelID: "doubao-seedance-1-0-lite-t2v-250428",
		DisplayName: "Seedance 1-0 Lite 文生视频", Capabilities: []string{CapabilityVideo},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		MaxInputImages:       0,
		RefUSDPerSecond:      0.028, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			false, true, true, false, false,
		)},

	{ID: "volcengine:seedance-1-0-lite-i2v", ModelID: "doubao-seedance-1-0-lite-i2v-250428",
		DisplayName: "Seedance 1-0 Lite 图生视频", Capabilities: []string{CapabilityVideoI2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages:  4,
		RefUSDPerSecond: 0.028, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p"},
			false, false, true, false, false,
		)},

	{ID: "volcengine:seedance-1-0-pro-fast", ModelID: "doubao-seedance-1-0-pro-fast-251015",
		DisplayName: "Seedance 1-0 Pro Fast 视频", Capabilities: []string{CapabilityVideo},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true,
		MaxInputImages:       0,
		RefUSDPerSecond:      0.042, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"2", "5", "10", "12"},
			[]string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			false, true, true, false, false,
		)},

	{ID: "volcengine:seedance-1-5-pro", ModelID: "doubao-seedance-1-5-pro-251215",
		DisplayName: "Seedance 1.5 Pro 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages:  1,
		RefUSDPerSecond: 0.090, DefaultDurSec: 5, MaxDurSec: 12,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "12"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			true, true, true, false, true,
		)},

	{ID: "volcengine:seedance-2-0", ModelID: "doubao-seedance-2-0-260128",
		DisplayName: "Seedance 2.0 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages: 1, MaxInputVideos: 1,
		RefUSDPerSecond: 0.140, DefaultDurSec: 5, MaxDurSec: 15,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "15"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p", "1080p"},
			true, false, false, true, false,
		)},

	{ID: "volcengine:seedance-2-0-fast", ModelID: "doubao-seedance-2-0-fast-260128",
		DisplayName: "Seedance 2.0 Fast 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterVolcen,
		AllowModelIDOverride: true, AcceptsImageInput: true,
		MaxInputImages: 1, MaxInputVideos: 1,
		RefUSDPerSecond: 0.070, DefaultDurSec: 5, MaxDurSec: 15,
		SupportedParams: volcenSeedanceParams(
			[]string{"-1", "4", "5", "10", "15"},
			[]string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
			[]string{"480p", "720p"},
			true, false, false, true, false,
		)},

	// ─── Kling (Kuaishou) ──────────────────────────────────────────────────────

	{ID: "kling:v1-standard-t2v", ModelID: "kling-v1",
		DisplayName: "可灵 v1 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		BillingMode: BillingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00196, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v1-6-standard-t2v", ModelID: "kling-v1-6",
		DisplayName: "可灵 v1.6 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		BillingMode: BillingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00392, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v2-standard-t2v", ModelID: "kling-v2",
		DisplayName: "可灵 v2 标准 (文生视频)", Capabilities: []string{CapabilityVideo},
		BillingMode: BillingPerSecond, AdapterType: AdapterKling,
		MaxInputImages:  0,
		RefUSDPerSecond: 0.00490, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	{ID: "kling:v1-5-standard-i2v", ModelID: "kling-v1-5",
		DisplayName: "可灵 v1.5 (图生视频)", Capabilities: []string{CapabilityVideoI2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterKling,
		AcceptsImageInput: true, MaxInputImages: 1,
		RefUSDPerSecond: 0.00392, DefaultDurSec: 5, MaxDurSec: 10,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"5", "10"}, Default: "5"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	// ─── xAI Grok ─────────────────────────────────────────────────────────────
	// Accessed via OpenAI-compatible proxy. All text models support vision input.
	// Pricing reference: https://x.ai/api — varies by variant; estimates below.

	// Grok 4.20 series — latest generation (Apr 2025).
	// Non-reasoning: fast direct-answer mode; reasoning: extended chain-of-thought.
	// "super" variants use higher compute allocation for harder tasks.

	{ID: "xai:grok-4.20-0309", ModelID: "grok-4.20-0309",
		DisplayName: "Grok 4.20", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-0309-non-reasoning", ModelID: "grok-4.20-0309-non-reasoning",
		DisplayName: "Grok 4.20 Non-Reasoning", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-0309-reasoning", ModelID: "grok-4.20-0309-reasoning",
		DisplayName: "Grok 4.20 Reasoning", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-super", ModelID: "grok-4.20-0309-super",
		DisplayName: "Grok 4.20 Super", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-non-reasoning-super", ModelID: "grok-4.20-0309-non-reasoning-super",
		DisplayName: "Grok 4.20 Non-Reasoning Super", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	{ID: "xai:grok-4.20-0309-reasoning-super", ModelID: "grok-4.20-0309-reasoning-super",
		DisplayName: "Grok 4.20 Reasoning Super", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 8.00, RefOutputUSDPer1M: 40.00},

	// Routing / alias variants — the proxy selects the optimal backend automatically.
	{ID: "xai:grok-4.20-fast", ModelID: "grok-4.20-fast",
		DisplayName: "Grok 4.20 Fast", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 1 - 00, RefOutputUSDPer1M: 5.00},

	{ID: "xai:grok-4.20-auto", ModelID: "grok-4.20-auto",
		DisplayName: "Grok 4.20 Auto", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 3.00, RefOutputUSDPer1M: 15.00},

	{ID: "xai:grok-4.20-expert", ModelID: "grok-4.20-expert",
		DisplayName: "Grok 4.20 Expert", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 8.00, RefOutputUSDPer1M: 40.00},

	// Grok 4.3 Beta — next-generation preview with extended reasoning.
	{ID: "xai:grok-4.3-beta", ModelID: "grok-4.3-beta",
		DisplayName: "Grok 4.3 Beta (推理)", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterOpenAICompat,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 5.00, RefOutputUSDPer1M: 25.00},

	// Grok Imagine — image generation via /images/generations (OpenAI-compat).
	{ID: "xai:grok-imagine-image-lite", ModelID: "grok-imagine-image-lite",
		DisplayName: "Grok Imagine Lite (文生图)", Capabilities: []string{CapabilityImage},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.020,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	{ID: "xai:grok-imagine-image", ModelID: "grok-imagine-image",
		DisplayName: "Grok Imagine (文生图)", Capabilities: []string{CapabilityImage},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.050,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	{ID: "xai:grok-imagine-image-pro", ModelID: "grok-imagine-image-pro",
		DisplayName: "Grok Imagine Pro (文生图)", Capabilities: []string{CapabilityImage},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		RefUSDPerImage: 0.100,
		SupportedParams: []ParamDef{
			{Key: "size", Label: "尺寸", Type: "select",
				Options: []string{"1024x1024", "1280x720", "720x1280"}, Default: "1024x1024"},
		}},

	// image_edit: requires image input, routes to /images/edits.
	{ID: "xai:grok-imagine-image-edit", ModelID: "grok-imagine-image-edit",
		DisplayName: "Grok Imagine Edit (图像编辑)", Capabilities: []string{CapabilityImageEdit},
		BillingMode: BillingPerImage, AdapterType: AdapterOpenAICompat,
		AcceptsImageInput: true, MaxInputImages: 1, ImageEditField: "image[]",
		RefUSDPerImage: 0.080},

	// Grok Imagine Video — text-to-video via /videos/generations (OpenAI-compat).
	// Duration and resolution are proxy-controlled; xAI does not publicly document params.
	{ID: "xai:grok-imagine-video", ModelID: "grok-imagine-video",
		DisplayName: "Grok Imagine Video (文生视频)", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterOpenAICompat,
		MaxInputImages:  2,
		RefUSDPerSecond: 0.20, DefaultDurSec: 6, MaxDurSec: 20,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"6", "10", "12", "16", "20"}, Default: "6"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		}},

	// ─── Google Gemini ────────────────────────────────────────────────────────

	{ID: "gemini:gemini-2-5-pro", ModelID: "gemini-2.5-pro",
		DisplayName: "Gemini 2.5 Pro", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 1.25, RefOutputUSDPer1M: 10.00},

	{ID: "gemini:gemini-2-5-flash", ModelID: "gemini-2.5-flash",
		DisplayName: "Gemini 2.5 Flash", Capabilities: []string{CapabilityText, CapabilityReasoning},
		BillingMode: BillingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 0.15, RefOutputUSDPer1M: 0.60},

	{ID: "gemini:gemini-2-0-flash", ModelID: "gemini-2.0-flash",
		DisplayName: "Gemini 2.0 Flash", Capabilities: []string{CapabilityText},
		BillingMode: BillingPerToken, AdapterType: AdapterGemini,
		MaxInputImages:   -1,
		RefInputUSDPer1M: 0.10, RefOutputUSDPer1M: 0.40},

	{ID: "gemini:imagen-3", ModelID: "imagen-3.0-generate-002",
		DisplayName: "Imagen 3 文生图", Capabilities: []string{CapabilityImage},
		BillingMode: BillingPerImage, AdapterType: AdapterGemini,
		MaxInputImages: 0,
		RefUSDPerImage: 0.04,
		SupportedParams: []ParamDef{
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, Default: "1:1"},
		}},

	{ID: "gemini:gemini-flash-image", ModelID: "gemini-2.0-flash-preview-image-generation",
		DisplayName: "Gemini Flash 图像生成", Capabilities: []string{CapabilityImage, CapabilityImageEdit},
		BillingMode: BillingPerImage, AdapterType: AdapterGemini,
		AcceptsImageInput: true, MaxInputImages: -1,
		RefUSDPerImage: 0.04,
		SupportedParams: []ParamDef{
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, Default: "1:1"},
		}},

	{ID: "gemini:veo-2", ModelID: "veo-2.0-generate-001",
		DisplayName: "Veo 2 视频", Capabilities: []string{CapabilityVideo, CapabilityVideoI2V},
		BillingMode: BillingPerSecond, AdapterType: AdapterGemini,
		AcceptsImageInput: true, MaxInputImages: 1,
		RefUSDPerSecond: 0.35, DefaultDurSec: 6, MaxDurSec: 8,
		SupportedParams: []ParamDef{
			{Key: "duration", Label: "时长(秒)", Type: "select",
				Options: []string{"6", "8"}, Default: "6"},
			{Key: "aspect_ratio", Label: "画面比例", Type: "select",
				Options: []string{"16:9", "9:16"}, Default: "16:9"},
		}},
}

// GetAdapterDef returns the AdapterDef for the given adapter type, or nil if not found.
func GetAdapterDef(adapterType string) *AdapterDef {
	for i := range AdapterDefs {
		if AdapterDefs[i].AdapterType == adapterType {
			return &AdapterDefs[i]
		}
	}
	return nil
}

// DefaultParamsForAdapter returns the adapter-level default parameters for the
// requested capabilities. The result is de-duplicated by abstract parameter key.
func DefaultParamsForAdapter(adapterType string, capabilities []string) []ParamDef {
	def := GetAdapterDef(adapterType)
	if def == nil || len(capabilities) == 0 {
		return nil
	}
	capSet := make(map[string]bool, len(capabilities))
	for _, cap := range capabilities {
		capSet[cap] = true
	}
	var out []ParamDef
	seen := map[string]bool{}
	for _, set := range def.ParamSets {
		if !capSet[set.Capability] {
			continue
		}
		for _, p := range NormalizeParamDefsForUI(set.Params) {
			if p.Key == "" || seen[p.Key] {
				continue
			}
			seen[p.Key] = true
			out = append(out, cloneParamDef(p))
		}
	}
	return out
}

func cloneParamDef(p ParamDef) ParamDef {
	if len(p.Options) > 0 {
		p.Options = append([]string{}, p.Options...)
	}
	return p
}

// ResolveModelDef builds a ModelDef entirely from the Custom* fields stored in AIModelConfig.
// Adapter definitions provide default parameter controls; model configs may
// override those controls by storing CustomSupportedParams, including "[]" to
// explicitly expose no parameters for a model.
func ResolveModelDef(modelDefID, adapterType, customDisplayName, customCaps, customBilling string,
	customAcceptsImage bool, customMaxInputImages, customMaxInputVideos int,
	customImageEditField, customSupportedParams string) *ModelDef {

	def := &ModelDef{
		ID:          modelDefID,
		ModelID:     modelDefID,
		AdapterType: adapterType,
	}

	if customDisplayName != "" {
		def.DisplayName = customDisplayName
	} else {
		def.DisplayName = modelDefID
	}

	if customCaps != "" {
		def.Capabilities = splitComma(customCaps)
	}
	if len(def.Capabilities) == 0 {
		def.Capabilities = []string{CapabilityText}
	}

	if customBilling != "" {
		def.BillingMode = BillingMode(customBilling)
	}
	if def.BillingMode == "" {
		for _, c := range def.Capabilities {
			switch c {
			case CapabilityImage, CapabilityImageEdit:
				def.BillingMode = BillingPerImage
			case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
				def.BillingMode = BillingPerSecond
			}
		}
		if def.BillingMode == "" {
			def.BillingMode = BillingPerToken
		}
	}

	if customAcceptsImage {
		def.AcceptsImageInput = true
	}
	if customMaxInputImages != 0 {
		def.MaxInputImages = customMaxInputImages
	}
	if def.AcceptsImageInput && def.MaxInputImages == 0 {
		def.MaxInputImages = 1
	}
	if customMaxInputVideos != 0 {
		def.MaxInputVideos = customMaxInputVideos
	}
	if customImageEditField != "" {
		def.ImageEditField = customImageEditField
	}
	if customSupportedParams != "" {
		def.SupportedParamsExplicit = true
		var params []ParamDef
		if err := json.Unmarshal([]byte(customSupportedParams), &params); err == nil {
			def.SupportedParams = NormalizeParamDefsForUI(params)
		}
	} else {
		def.SupportedParams = DefaultParamsForAdapter(adapterType, def.Capabilities)
	}
	return def
}

// ResolveModelID returns the effective API-level model ID.
// modelIDOverride takes precedence; falls back to def.ModelID.
func ResolveModelID(modelIDOverride string, def *ModelDef) string {
	if modelIDOverride != "" {
		return modelIDOverride
	}
	return def.ModelID
}

func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := trimSpace(s[start:i])
			if part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
