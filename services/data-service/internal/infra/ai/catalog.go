package ai

import (
	"encoding/json"
	"strings"
)

// Adapter type constants.
const (
	AdapterOpenAICompat             = "openai_compat"
	AdapterOpenAIVideoMultipart     = "openai_video_multipart"
	AdapterOfficialVideoGenerations = "official_video_generations"
	AdapterYunwuUnifiedVideo        = "yunwu_unified_video"
	AdapterAnthropic                = "anthropic"
	AdapterKling                    = "kling"
	AdapterVolcen                   = "volcen" // Volcengine Ark: text (doubao), image (Seedream), video (Seedance)
	AdapterGemini                   = "gemini" // Google Gemini API (text/image/video)
	AdapterDashScope                = "dashscope"
	AdapterVyroSeedance             = "vyro_seedance"
	AdapterVidu                     = "vidu"
	AdapterElevenLabs               = "elevenlabs"
	AdapterMiniMax                  = "minimax"
	AdapterXiaomiMimo               = "xiaomi_mimo"
	AdapterMureka                   = "mureka"
	AdapterStability                = "stability"
	AdapterYunwuLegacy              = "yunwu"
	AdapterDoubao2API               = "doubao2api"
	AdapterLocal                    = "local"
)

const (
	ModelAPIKindOpenAIChatCompletions = "openai_chat_completions"
	ModelAPIKindOpenAIResponses       = "openai_responses"
	ModelAPIKindAnthropicMessages     = "anthropic_messages"
)

func ValidModelAPIKind(value string) bool {
	switch strings.TrimSpace(value) {
	case ModelAPIKindOpenAIChatCompletions, ModelAPIKindOpenAIResponses, ModelAPIKindAnthropicMessages:
		return true
	default:
		return false
	}
}

func NormalizeModelAPIKinds(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			kind := strings.TrimSpace(part)
			if kind == "" || !ValidModelAPIKind(kind) || seen[kind] {
				continue
			}
			seen[kind] = true
			out = append(out, kind)
		}
	}
	return out
}

func SplitModelAPIKinds(value string) []string {
	return NormalizeModelAPIKinds([]string{value})
}

// ParamDef describes a user-configurable generation parameter for a model.
// The frontend renders these as form controls so users can tune generation without
// relying on hidden backend defaults.
type ParamDef struct {
	Key              string                  `json:"key"`
	Label            string                  `json:"label"`
	Type             string                  `json:"type"`              // "select" | "number" | "boolean" | "string"
	Options          []string                `json:"options,omitempty"` // for type=select
	Default          interface{}             `json:"default,omitempty"`
	Min              float64                 `json:"min,omitempty"`
	Max              float64                 `json:"max,omitempty"`
	Step             float64                 `json:"step,omitempty"`
	minSet           bool                    `json:"-"`
	maxSet           bool                    `json:"-"`
	stepSet          bool                    `json:"-"`
	JSONSchema       map[string]any          `json:"json_schema,omitempty"`       // extra JSON Schema keywords for this param
	ConflictsWith    []string                `json:"conflicts_with,omitempty"`    // params that cannot be used with this param
	ConditionalEnum  []ParamConditionalEnum  `json:"conditional_enum,omitempty"`  // enum restrictions activated by another param
	ConditionalConst []ParamConditionalConst `json:"conditional_const,omitempty"` // const restrictions activated by another param
	RequiresValue    []ParamRequiresValue    `json:"requires_value,omitempty"`    // dependent param values required when this param is set
}

func (p *ParamDef) UnmarshalJSON(data []byte) error {
	type alias ParamDef
	var out alias
	if err := json.Unmarshal(data, &out); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out.minSet = raw["min"] != nil
	out.maxSet = raw["max"] != nil
	out.stepSet = raw["step"] != nil
	*p = ParamDef(out)
	return nil
}

func (p ParamDef) MarshalJSON() ([]byte, error) {
	type alias ParamDef
	raw, err := json.Marshal(alias(p))
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if p.minSet {
		out["min"] = p.Min
	}
	if p.maxSet {
		out["max"] = p.Max
	}
	if p.stepSet {
		out["step"] = p.Step
	}
	return json.Marshal(out)
}

func (p ParamDef) hasMin() bool {
	return p.minSet || p.Min != 0
}

func (p ParamDef) hasMax() bool {
	return p.maxSet || p.Max != 0
}

func (p ParamDef) hasStep() bool {
	return p.stepSet || p.Step != 0
}

// ParamConditionalEnum declares a cross-parameter enum restriction for params_schema.
// Example: resolution is only ["480p"] when workspace=true.
type ParamConditionalEnum struct {
	WhenParam string   `json:"when_param" yaml:"when_param"`
	WhenValue any      `json:"when_value" yaml:"when_value"`
	Options   []string `json:"options" yaml:"options"`
}

// ParamConditionalConst declares a cross-parameter const restriction for params_schema.
// Example: return_last_frame must be false when workspace=true.
type ParamConditionalConst struct {
	WhenParam string `json:"when_param" yaml:"when_param"`
	WhenValue any    `json:"when_value" yaml:"when_value"`
	Value     any    `json:"value" yaml:"value"`
}

// ParamRequiresValue declares a dependency activated when this parameter is set.
// Example: image_count requires sequential_image_generation=auto.
type ParamRequiresValue struct {
	Param string `json:"param" yaml:"param"`
	Value any    `json:"value" yaml:"value"`
}

// ModelParamProfile describes a catalog-entry-specific delta on top of adapter params.
// It is the preferred JSON shape for catalog supported params.
// For backward compatibility, supported params may still be a []ParamDef full override.
type ModelParamProfile struct {
	Allow    []string            `json:"allow,omitempty"`
	Deny     []string            `json:"deny,omitempty"`
	Override map[string]ParamDef `json:"override,omitempty"`
	Add      []ParamDef          `json:"add,omitempty"`
}

// AdapterParamSet describes the default generation controls exposed by an adapter
// for a capability. Catalog/runtime model definitions inherit these controls
// unless admins override CustomSupportedParams to restrict or remove parameters
// for a specific model.
type AdapterParamSet struct {
	Capability string     `json:"capability"`
	Params     []ParamDef `json:"params"`
}

// ModelDef describes an enabled model after resolving its admin-declared config
// with adapter defaults. It is used at runtime and is not a catalog entry.
type ModelDef struct {
	ID           string // logical model ID, usually the configured provider model ID
	Lab          string // model creator/family; provider/account is handled by routes
	ModelID      string // API model ID sent in requests
	DisplayName  string
	Capabilities []string // use Capability* constants: "text", "image", "video", "video_i2v", "video_v2v", "image_edit", "reasoning"
	AdapterType  string
	SourceStatus string
	APIKinds     []string

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

	// Video generation params.
	DefaultDurSec int
	MaxDurSec     int
}

// CatalogTemplate is a read-only admin UI template for quickly filling the add-model form.
// Runtime routing and generation parameter controls never consult this list.
type CatalogTemplate struct {
	ID                   string     `json:"id"`
	Lab                  string     `json:"lab"`
	DefaultPublicModelID string     `json:"default_public_model_id"`
	ModelID              string     `json:"model_id"`
	DisplayName          string     `json:"display_name"`
	Capabilities         []string   `json:"capabilities"`
	RouteAdapterHint     string     `json:"route_adapter_hint,omitempty"`
	SourceStatus         string     `json:"source_status,omitempty"`
	APIKinds             []string   `json:"api_kinds,omitempty"`
	AcceptsImageInput    bool       `json:"accepts_image_input"`
	MaxInputImages       int        `json:"max_input_images"`
	MaxInputVideos       int        `json:"max_input_videos"`
	ImageEditField       string     `json:"image_edit_field,omitempty"`
	SupportedParams      []ParamDef `json:"supported_params,omitempty"`
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

func commonTextParams() []ParamDef {
	return []ParamDef{
		{Key: "max_tokens", Label: "最大输出 Token", Type: "number", Min: 1, Max: 1_000_000, Step: 1},
		{Key: "temperature", Label: "随机性", Type: "number", Default: -1, Min: -1, Max: 2, Step: 0.1},
		{Key: "json_mode", Label: "JSON 输出", Type: "boolean", Default: false},
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

func yunwuVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"2:3", "3:2", "1:1"}, Default: "1:1"},
		{Key: "size", Label: "清晰度", Type: "select",
			Options: []string{"720P", "1080P"}, Default: "720P"},
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

func doubao2APIImageParams() []ParamDef {
	return []ParamDef{
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"1:1", "16:9", "9:16", "4:3", "3:4"}, Default: "1:1"},
	}
}

func doubao2APIVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5"}, Default: "5"},
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

func openAIGPTImageParams() []ParamDef {
	return []ParamDef{
		{Key: "image_size", Label: "尺寸", Type: "select",
			Options: []string{"1024x1024", "1536x1024", "1024x1536"}, Default: "1024x1024"},
		{Key: "quality", Label: "质量", Type: "select",
			Options: []string{"auto", "high", "medium", "low"}, Default: "auto"},
	}
}

func geminiTTSParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "音色", Type: "select",
			Options: []string{"Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"}, Default: "Kore"},
		{Key: "sample_rate", Label: "采样率", Type: "select",
			Options: []string{"24000"}, Default: "24000"},
		{Key: "channels", Label: "声道数", Type: "select",
			Options: []string{"1"}, Default: "1"},
		{Key: "speakers", Label: "多说话人", Type: "string", Default: ""},
	}
}

func geminiMusicParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"30", "60", "90", "120"}, Default: "30"},
		{Key: "output_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav"}, Default: "mp3"},
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
			Options: []string{"-1", "2", "4", "5", "10", "12", "15"}, Default: "5", ConflictsWith: []string{"frames"}},
		{Key: "frames", Label: "帧数", Type: "number", Min: 29, Max: 289, Step: 4, JSONSchema: framesJSONSchema(), ConflictsWith: []string{"duration"}},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}, Default: "16:9"},
		{Key: "resolution", Label: "清晰度", Type: "select",
			Options: []string{"480p", "720p", "1080p"}, Default: "720p",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"480p"}}}},
		{Key: "seed", Label: "种子", Type: "number", Default: -1, Min: -1, Max: 4294967295, Step: 1},
		{Key: "fixed_camera", Label: "固定镜头", Type: "boolean", Default: false},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: false},
		{Key: "audio", Label: "生成音频", Type: "boolean", Default: true},
		{Key: "return_last_frame", Label: "返回尾帧", Type: "boolean", Default: false,
			ConditionalConst: []ParamConditionalConst{{WhenParam: "workspace", WhenValue: true, Value: false}}},
		{Key: "service_tier", Label: "服务等级", Type: "select",
			Options: []string{"default", "flex"}, Default: "default",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"default"}}}},
		{Key: "execution_expires_after", Label: "过期时间(秒)", Type: "number", Min: 1, Step: 1},
		{Key: "workspace", Label: "样片模式", Type: "boolean", Default: false},
		{Key: "web_search", Label: "联网搜索", Type: "boolean", Default: false},
	}
}

func volcenTTSParams() []ParamDef {
	return []ParamDef{
		{Key: "voice_type", Label: "音色 ID", Type: "string", Default: "zh_female_vv_jupiter_bigtts"},
		{Key: "encoding", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav", "pcm", "ogg_opus"}, Default: "mp3"},
		{Key: "speed_ratio", Label: "语速", Type: "number", Default: 1, Min: 0.8, Max: 2, Step: 0.01},
		{Key: "sample_rate", Label: "采样率", Type: "select",
			Options: []string{"8000", "16000", "22050", "24000", "32000", "44100", "48000"}, Default: "24000"},
		{Key: "volume_ratio", Label: "音量", Type: "number", Default: 1, Min: 0.1, Max: 3, Step: 0.01},
		{Key: "pitch_ratio", Label: "音高", Type: "number", Default: 1, Min: 0.1, Max: 3, Step: 0.01},
		{Key: "language", Label: "语言", Type: "string", Default: ""},
		{Key: "uid", Label: "用户标识", Type: "string", Default: "movscript"},
	}
}

func volcenASRParams() []ParamDef {
	return []ParamDef{
		{Key: "format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "m4a", "wav", "ogg", "webm", "flac"}, Default: "mp3"},
		{Key: "language", Label: "语言", Type: "string", Default: ""},
		{Key: "enable_itn", Label: "数字文本规整", Type: "boolean", Default: true},
		{Key: "enable_punc", Label: "标点", Type: "boolean", Default: true},
		{Key: "show_utterances", Label: "分句结果", Type: "boolean", Default: true},
		{Key: "enable_speaker_info", Label: "说话人分离", Type: "boolean", Default: false},
		{Key: "poll_timeout_ms", Label: "轮询超时(ms)", Type: "number", Default: 600000, Min: 1000, Step: 1000},
		{Key: "poll_interval_ms", Label: "轮询间隔(ms)", Type: "number", Default: 5000, Min: 500, Step: 500},
	}
}

func dashScopeVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5", "10", "15"}, Default: "5"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16", "1:1", "4:3", "3:4"}, Default: "16:9"},
		{Key: "resolution", Label: "分辨率", Type: "select",
			Options: []string{"480P", "720P", "1080P"}, Default: "720P"},
		{Key: "image_size", Label: "画面尺寸", Type: "select",
			Options: []string{"832*480", "1280*720", "720*1280"}, Default: "1280*720"},
		{Key: "watermark", Label: "水印", Type: "boolean", Default: false},
		{Key: "audio", Label: "生成音频", Type: "boolean", Default: true},
	}
}

func vyroSeedanceVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5", "10"}, Default: "5"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		{Key: "size", Label: "清晰度", Type: "select",
			Options: []string{"720P", "1080P"}, Default: "720P"},
		{Key: "resolution", Label: "分辨率", Type: "select",
			Options: []string{"720p", "1080p"}, Default: "720p"},
	}
}

func dashScopeTTSParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "音色", Type: "string", Default: "Cherry"},
		{Key: "language_type", Label: "语言", Type: "select",
			Options: []string{"Auto", "Chinese", "English", "German", "Italian", "Portuguese", "Spanish", "Japanese", "Korean", "French", "Russian"}, Default: "Auto"},
		{Key: "format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav", "pcm", "opus"}, Default: "mp3"},
		{Key: "sample_rate", Label: "采样率", Type: "select",
			Options: []string{"8000", "16000", "22050", "24000", "44100", "48000"}, Default: "22050"},
		{Key: "volume", Label: "音量", Type: "number", Default: 50, Min: 0, Max: 100, Step: 1},
		{Key: "rate", Label: "语速", Type: "number", Default: 1, Min: 0.5, Max: 2, Step: 0.01},
		{Key: "pitch", Label: "音高", Type: "number", Default: 1, Min: 0.5, Max: 2, Step: 0.01},
		{Key: "instructions", Label: "语音指令", Type: "string", Default: ""},
		{Key: "optimize_instructions", Label: "优化指令", Type: "boolean", Default: false},
		{Key: "enable_ssml", Label: "SSML", Type: "boolean", Default: false},
		{Key: "seed", Label: "种子", Type: "number", Min: 0, Max: 65535, Step: 1},
	}
}

func viduVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"1", "3", "4", "5", "8", "10", "16"}, Default: "5"},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"16:9", "9:16", "1:1"}, Default: "16:9"},
		{Key: "resolution", Label: "分辨率", Type: "select",
			Options: []string{"360p", "540p", "720p", "1080p"}, Default: "720p"},
		{Key: "seed", Label: "种子", Type: "number", Min: -1, Max: 2147483647, Step: 1},
		{Key: "audio", Label: "生成音频", Type: "boolean", Default: true},
		{Key: "audio_type", Label: "音频类型", Type: "select",
			Options: []string{"all", "speech_only", "sound_effect_only"}, Default: "all"},
		{Key: "movement_amplitude", Label: "运动幅度", Type: "select",
			Options: []string{"auto", "small", "medium", "large"}, Default: "auto"},
		{Key: "off_peak", Label: "错峰模式", Type: "boolean", Default: false},
	}
}

func elevenLabsTTSParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "Voice ID", Type: "string", Default: ""},
		{Key: "output_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3_44100_128", "mp3_22050_32", "pcm_16000", "ulaw_8000"}, Default: "mp3_44100_128"},
		{Key: "stability", Label: "稳定度", Type: "number", Default: 0.5, Min: 0, Max: 1, Step: 0.01},
		{Key: "similarity_boost", Label: "相似度", Type: "number", Default: 0.75, Min: 0, Max: 1, Step: 0.01},
		{Key: "style", Label: "风格强度", Type: "number", Default: 0, Min: 0, Max: 1, Step: 0.01},
		{Key: "use_speaker_boost", Label: "增强说话人", Type: "boolean", Default: true},
		{Key: "speed", Label: "语速", Type: "number", Default: 1, Min: 0.7, Max: 1.2, Step: 0.01},
	}
}

func elevenLabsSTTParams() []ParamDef {
	return []ParamDef{
		{Key: "diarize", Label: "区分说话人", Type: "boolean", Default: false},
		{Key: "tag_audio_events", Label: "标注音频事件", Type: "boolean", Default: true},
	}
}

func miniMaxTTSParams() []ParamDef {
	return []ParamDef{
		{Key: "voice_id", Label: "Voice ID", Type: "string", Default: "Chinese_Mandarin_Calm_Female"},
		{Key: "language_boost", Label: "语言增强", Type: "select",
			Options: []string{"auto", "Chinese", "Chinese,Yue", "English", "Japanese", "Korean", "Spanish", "French", "German", "Russian", "Arabic", "Portuguese"}, Default: "auto"},
		{Key: "audio_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav", "flac"}, Default: "mp3"},
		{Key: "output_format", Label: "返回格式", Type: "select",
			Options: []string{"hex", "url"}, Default: "hex"},
		{Key: "sample_rate", Label: "采样率", Type: "select",
			Options: []string{"16000", "24000", "32000", "44100"}, Default: "32000"},
		{Key: "bitrate", Label: "码率", Type: "select",
			Options: []string{"64000", "128000", "256000"}, Default: "128000"},
		{Key: "speed", Label: "语速", Type: "number", Default: 1, Min: 0.5, Max: 2, Step: 0.01},
		{Key: "vol", Label: "音量", Type: "number", Default: 1, Min: 0, Max: 10, Step: 0.1},
		{Key: "pitch", Label: "音高", Type: "number", Default: 0, Min: -12, Max: 12, Step: 1},
		{Key: "channel", Label: "声道数", Type: "select",
			Options: []string{"1", "2"}, Default: "1"},
		{Key: "subtitle_enable", Label: "字幕时间轴", Type: "boolean", Default: false},
		{Key: "subtitle_type", Label: "字幕粒度", Type: "select",
			Options: []string{"sentence", "word"}, Default: "sentence"},
	}
}

func openAICompatAudioSpeechParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "音色", Type: "select",
			Options: []string{"alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"}, Default: "alloy"},
		{Key: "response_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "opus", "aac", "flac", "wav", "pcm"}, Default: "mp3"},
		{Key: "speed", Label: "语速", Type: "number", Default: 1, Min: 0.25, Max: 4, Step: 0.01},
		{Key: "instructions", Label: "语音指令", Type: "string", Default: ""},
	}
}

func openAICompatAudioTranscribeParams() []ParamDef {
	return []ParamDef{
		{Key: "response_format", Label: "返回格式", Type: "select",
			Options: []string{"json", "text", "srt", "verbose_json", "vtt"}, Default: "verbose_json"},
		{Key: "prompt", Label: "提示词", Type: "text", Default: ""},
		{Key: "temperature", Label: "温度", Type: "number", Default: 0, Min: 0, Max: 1, Step: 0.1},
	}
}

func openAICompatAudioChatParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "音色", Type: "select",
			Options: []string{"alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"}, Default: "alloy"},
		{Key: "response_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "opus", "aac", "flac", "wav", "pcm"}, Default: "mp3"},
		{Key: "temperature", Label: "温度", Type: "number", Default: 0.8, Min: 0, Max: 2, Step: 0.1},
		{Key: "max_tokens", Label: "最大输出 Token", Type: "number", Min: 1, Max: 4096, Step: 1},
	}
}

func xiaomiMimoAudioChatParams() []ParamDef {
	return []ParamDef{
		{Key: "language", Label: "识别语言", Type: "select",
			Options: []string{"auto", "zh", "en"}, Default: "auto"},
		{Key: "temperature", Label: "温度", Type: "number", Default: 0.8, Min: 0, Max: 2, Step: 0.1},
		{Key: "max_completion_tokens", Label: "最大输出 Token", Type: "number", Min: 1, Max: 4096, Step: 1},
	}
}

func audioGenerationParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"1", "2", "3", "5", "8", "10", "15", "30"}, Default: "2"},
		{Key: "output_format", Label: "音频格式", Type: "select",
			Options: []string{"wav", "mp3"}, Default: "wav"},
		{Key: "negative_prompt", Label: "负向提示词", Type: "text", Default: ""},
	}
}

func voiceCloneParams() []ParamDef {
	return []ParamDef{
		{Key: "name", Label: "声音名称", Type: "string", Default: ""},
		{Key: "description", Label: "声音描述", Type: "text", Default: ""},
		{Key: "remove_background_noise", Label: "移除背景噪声", Type: "boolean", Default: true},
		{Key: "labels", Label: "标签 JSON", Type: "text", Default: ""},
	}
}

func voiceDesignParams() []ParamDef {
	return []ParamDef{
		{Key: "name", Label: "声音名称", Type: "string", Default: ""},
		{Key: "description", Label: "声音描述", Type: "text", Default: ""},
		{Key: "preview_text", Label: "试听文本", Type: "text", Default: ""},
		{Key: "auto_generate_text", Label: "自动生成试听文本", Type: "boolean", Default: true},
		{Key: "seed", Label: "Seed", Type: "number", Default: 0, Min: 0, Max: 2147483647, Step: 1},
		{Key: "guidance_scale", Label: "描述遵循度", Type: "number", Default: 0.7, Min: 0, Max: 1, Step: 0.05},
		{Key: "loudness", Label: "响度", Type: "number", Default: 0, Min: -1, Max: 1, Step: 0.05},
		{Key: "should_enhance", Label: "增强生成声音", Type: "boolean", Default: true},
		{Key: "generated_voice_id", Label: "已有预览 Voice ID", Type: "string", Default: ""},
		{Key: "labels", Label: "标签 JSON", Type: "text", Default: ""},
	}
}

// AdapterDefs lists all supported adapter definitions.
var AdapterDefs = []AdapterDef{
	{
		AdapterType:    AdapterLocal,
		DisplayName:    "MovScript Local",
		Description:    "本地确定性 AI gateway 模拟 provider，不依赖外部 API Key",
		DefaultBaseURL: "movscript://local",
		CredFields:     []CredField{},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityText, Params: commonTextParams()},
			{Capability: CapabilityReasoning, Params: commonTextParams()},
			{Capability: CapabilityAudioMusic, Params: audioGenerationParams()},
			{Capability: CapabilityAudioSFX, Params: audioGenerationParams()},
			{Capability: CapabilityAudioChat, Params: openAICompatAudioChatParams()},
			{Capability: CapabilityVoiceClone, Params: voiceCloneParams()},
			{Capability: CapabilityVoiceDesign, Params: voiceDesignParams()},
			{Capability: CapabilitySubTranslate, Params: commonTextParams()},
		},
	},
	{
		AdapterType:      AdapterOpenAICompat,
		DisplayName:      "OpenAI 兼容 API",
		Description:      "兼容 OpenAI 接口的文本、图像和音频模型。视频协议请使用专门的视频 adapter。",
		DefaultBaseURL:   "https://api.openai.com/v1",
		SupportsFilesAPI: true,
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理或第三方兼容接口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityText, Params: commonTextParams()},
			{Capability: CapabilityImage, Params: commonImageParams()},
			{Capability: CapabilityImageEdit, Params: commonImageParams()},
			{Capability: CapabilityAudioTTS, Params: openAICompatAudioSpeechParams()},
			{Capability: CapabilityAudioSTT, Params: openAICompatAudioTranscribeParams()},
			{Capability: CapabilityAudioChat, Params: openAICompatAudioChatParams()},
			{Capability: CapabilitySubAlign, Params: openAICompatAudioTranscribeParams()},
		},
	},
	{
		AdapterType:      AdapterOpenAIVideoMultipart,
		DisplayName:      "OpenAI 视频 Multipart",
		Description:      "OpenAI 风格 /videos multipart 视频生成协议。账号和 endpoint 由 route/provider 提供。",
		DefaultBaseURL:   "https://api.openai.com/v1",
		SupportsFilesAPI: true,
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于官方或中转站入口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: openAICompatVideoParams()},
			{Capability: CapabilityVideoI2V, Params: openAICompatVideoParams()},
			{Capability: CapabilityVideoV2V, Params: openAICompatVideoParams()},
		},
	},
	{
		AdapterType:    AdapterOfficialVideoGenerations,
		DisplayName:    "官方视频 Generations",
		Description:    "官方 JSON 视频生成协议，例如 /v1/videos/generations。账号和 endpoint 由 route/provider 提供。",
		DefaultBaseURL: "https://api.x.ai/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于官方或中转站入口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: openAICompatVideoParams()},
		},
	},
	{
		AdapterType:    AdapterYunwuUnifiedVideo,
		DisplayName:    "云雾统一视频",
		Description:    "云雾统一 JSON 视频任务协议：/v1/video/create 和 /v1/video/query。云雾文本/图片模型应通过各自协议 route 接入。",
		DefaultBaseURL: "https://yunwu.ai/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于 api3.wlai.vip 等云雾入口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: yunwuVideoParams()},
			{Capability: CapabilityVideoI2V, Params: yunwuVideoParams()},
		},
	},
	{
		AdapterType:    AdapterDoubao2API,
		DisplayName:    "doubao2api 本地服务",
		Description:    "本地 doubao2api 逆向服务，支持豆包图片和视频生成；需要本地服务已登录",
		DefaultBaseURL: "http://127.0.0.1:9090/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key（可选，若 DOUBAO_API_KEY 已设置则填写）", Required: false},
			{Key: "base_url", Label: "Base URL（默认 http://127.0.0.1:9090/v1）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityImage, Params: doubao2APIImageParams()},
			{Capability: CapabilityVideo, Params: doubao2APIVideoParams()},
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
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityText, Params: commonTextParams()},
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
			{Key: "speech_app_id", Label: "Speech App ID（TTS 可选）", Required: false},
			{Key: "speech_token", Label: "Speech Access Token（TTS 可选）", Required: false},
			{Key: "speech_cluster", Label: "Speech Cluster（TTS 可选）", Required: false},
			{Key: "speech_base_url", Label: "Speech Base URL（TTS 可选）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityText, Params: commonTextParams()},
			{Capability: CapabilityImage, Params: volcenImageParams()},
			{Capability: CapabilityImageEdit, Params: volcenImageParams()},
			{Capability: CapabilityVideo, Params: volcenVideoParams()},
			{Capability: CapabilityVideoI2V, Params: volcenVideoParams()},
			{Capability: CapabilityVideoV2V, Params: volcenVideoParams()},
			{Capability: CapabilityAudioTTS, Params: volcenTTSParams()},
			{Capability: CapabilityAudioSTT, Params: volcenASRParams()},
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
			{Capability: CapabilityText, Params: commonTextParams()},
			{Capability: CapabilityImage, Params: geminiImageParams()},
			{Capability: CapabilityImageEdit, Params: geminiImageParams()},
			{Capability: CapabilityVideo, Params: geminiVideoParams()},
			{Capability: CapabilityVideoI2V, Params: geminiVideoParams()},
			{Capability: CapabilityAudioTTS, Params: geminiTTSParams()},
			{Capability: CapabilityAudioMusic, Params: geminiMusicParams()},
		},
	},
	{
		AdapterType:    AdapterDashScope,
		DisplayName:    "阿里云 DashScope",
		Description:    "阿里云百炼 / DashScope 视频生成异步任务接口（Wan、HappyHorse 等）",
		DefaultBaseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选：国际站/北京/美国区）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: dashScopeVideoParams()},
			{Capability: CapabilityVideoI2V, Params: dashScopeVideoParams()},
			{Capability: CapabilityVideoV2V, Params: dashScopeVideoParams()},
			{Capability: CapabilityAudioTTS, Params: dashScopeTTSParams()},
		},
	},
	{
		AdapterType:    AdapterVidu,
		DisplayName:    "Vidu",
		Description:    "生数科技 Vidu 视频生成任务接口，支持文生视频、图生视频和参考生视频",
		DefaultBaseURL: "https://api.vidu.com/ent/v2",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: viduVideoParams()},
			{Capability: CapabilityVideoI2V, Params: viduVideoParams()},
		},
	},
	{
		AdapterType:    AdapterVyroSeedance,
		DisplayName:    "Vyro Seedance 中转",
		Description:    "Vyro/83zi Seedance 2.0 Fast 视频任务接口：/v1/videos multipart + /v1/videos/{id} 查询。",
		DefaultBaseURL: "http://115.190.186.95:3002/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于 83zi 或同协议入口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityVideo, Params: vyroSeedanceVideoParams()},
			{Capability: CapabilityVideoI2V, Params: vyroSeedanceVideoParams()},
		},
	},
	{
		AdapterType:    AdapterElevenLabs,
		DisplayName:    "ElevenLabs",
		Description:    "ElevenLabs 语音模型，支持文本转语音和音频转写",
		DefaultBaseURL: "https://api.elevenlabs.io/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityAudioTTS, Params: elevenLabsTTSParams()},
			{Capability: CapabilityAudioSTT, Params: elevenLabsSTTParams()},
			{Capability: CapabilityVoiceClone, Params: voiceCloneParams()},
			{Capability: CapabilityVoiceDesign, Params: voiceDesignParams()},
		},
	},
	{
		AdapterType:    AdapterMiniMax,
		DisplayName:    "MiniMax",
		Description:    "MiniMax 官方语音接口，支持 Speech 系列文本转语音",
		DefaultBaseURL: "https://api.minimax.io/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityAudioTTS, Params: miniMaxTTSParams()},
		},
	},
	{
		AdapterType:    AdapterXiaomiMimo,
		DisplayName:    "小米 MiMo",
		Description:    "小米 MiMo 官方 OpenAI Chat Completions 兼容接口，支持原生音频输入理解",
		DefaultBaseURL: "https://api.xiaomimimo.com/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityAudioChat, Params: xiaomiMimoAudioChatParams()},
		},
	},
	{
		AdapterType:    AdapterMureka,
		DisplayName:    "Mureka",
		Description:    "Mureka 官方音乐生成接口，支持歌曲和纯音乐异步任务",
		DefaultBaseURL: "https://api.mureka.ai",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityAudioMusic, Params: murekaMusicParams()},
		},
	},
	{
		AdapterType:    AdapterStability,
		DisplayName:    "Stability AI",
		Description:    "Stability AI 官方 Stable Audio 接口，支持音乐和音效生成",
		DefaultBaseURL: "https://api.stability.ai",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于代理）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityAudioMusic, Params: stabilityAudioParams()},
			{Capability: CapabilityAudioSFX, Params: stabilityAudioParams()},
		},
	},
}

func murekaMusicParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"30", "60", "120", "180"}, Default: "60"},
		{Key: "output_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav"}, Default: "mp3"},
		{Key: "lyrics", Label: "歌词", Type: "text", Default: ""},
		{Key: "poll_timeout_ms", Label: "轮询超时(ms)", Type: "number", Default: 180000, Min: 1000, Max: 900000, Step: 1000},
		{Key: "poll_interval_ms", Label: "轮询间隔(ms)", Type: "number", Default: 2000, Min: 250, Max: 30000, Step: 250},
	}
}

func stabilityAudioParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"5", "10", "30", "60", "120", "180", "360"}, Default: "30"},
		{Key: "output_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "wav"}, Default: "mp3"},
		{Key: "steps", Label: "推理步数", Type: "number", Default: 8, Min: 1, Max: 100, Step: 1},
		{Key: "cfg_scale", Label: "提示词强度", Type: "number", Default: 1, Min: 0, Max: 20, Step: 0.1},
		{Key: "seed", Label: "种子", Type: "number", Default: 0, Min: 0, Max: 4294967295, Step: 1},
		{Key: "poll_timeout_ms", Label: "轮询超时(ms)", Type: "number", Default: 600000, Min: 1000, Max: 1800000, Step: 1000},
		{Key: "poll_interval_ms", Label: "轮询间隔(ms)", Type: "number", Default: 10000, Min: 1000, Max: 60000, Step: 1000},
	}
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
		{Key: "image_count", Label: "生成张数", Type: "number", Min: 1, Max: 15, Step: 1,
			RequiresValue: []ParamRequiresValue{{Param: "sequential_image_generation", Value: "auto"}}},
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

func volcenSeedanceParams(durationOptions, ratioOptions, resolutionOptions []string, withAudio, withCameraFixed, withServiceTier, withWebSearch, withWorkspace bool) []ParamDef {
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
	if withWorkspace {
		for i := range params {
			switch params[i].Key {
			case "resolution":
				params[i].ConditionalEnum = []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"480p"}}}
			case "return_last_frame":
				params[i].ConditionalConst = []ParamConditionalConst{{WhenParam: "workspace", WhenValue: true, Value: false}}
			case "service_tier":
				params[i].ConditionalEnum = []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"default"}}}
			}
		}
		params = append(params, ParamDef{Key: "workspace", Label: "样片模式", Type: "boolean", Default: false})
	}
	return params
}

func framesJSONSchema() map[string]any {
	return map[string]any{
		"minimum":     29,
		"maximum":     289,
		"enum":        frameOptions(),
		"description": "Frame count must be in [29,289] and match 25 + 4n.",
	}
}

func frameOptions() []int {
	out := make([]int, 0, 66)
	for frame := 29; frame <= 289; frame += 4 {
		out = append(out, frame)
	}
	return out
}

// CatalogTemplates returns read-only well-known model templates.
// They can seed catalog entries, but runtime routing and provider calls never
// consult this list.
func CatalogTemplates() []CatalogTemplate {
	result := make([]CatalogTemplate, 0, len(catalogTemplateSources))
	for _, def := range catalogTemplateSources {
		result = append(result, CatalogTemplate{
			ID:                   def.ID,
			Lab:                  def.Lab,
			DefaultPublicModelID: defaultPublicModelIDForTemplate(def),
			ModelID:              def.ModelID,
			DisplayName:          def.DisplayName,
			Capabilities:         def.Capabilities,
			RouteAdapterHint:     def.AdapterType,
			SourceStatus:         def.SourceStatus,
			APIKinds:             NormalizeModelAPIKinds(def.APIKinds),
			AcceptsImageInput:    def.AcceptsImageInput,
			MaxInputImages:       def.MaxInputImages,
			MaxInputVideos:       def.MaxInputVideos,
			ImageEditField:       def.ImageEditField,
			SupportedParams:      NormalizeParamDefsForUI(cloneParamDefs(def.SupportedParams)),
		})
	}
	return result
}

func CatalogTemplatesByLab(lab string) []CatalogTemplate {
	lab = strings.TrimSpace(lab)
	templates := CatalogTemplates()
	if lab == "" {
		return templates
	}
	result := make([]CatalogTemplate, 0, len(templates))
	for _, template := range templates {
		if strings.EqualFold(strings.TrimSpace(template.Lab), lab) {
			result = append(result, template)
		}
	}
	return result
}

func defaultPublicModelIDForTemplate(def ModelDef) string {
	if _, publicID, ok := strings.Cut(strings.TrimSpace(def.ID), ":"); ok && strings.TrimSpace(publicID) != "" {
		return strings.TrimSpace(publicID)
	}
	if modelID := strings.TrimSpace(def.ModelID); modelID != "" {
		return modelID
	}
	return strings.TrimSpace(def.ID)
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

// ResolveEffectiveParams resolves the runtime parameter schema for one model.
// Empty modelParamConfig inherits adapter defaults. A legacy []ParamDef value is
// treated as a full explicit override. A ModelParamProfile value is applied as a
// delta over the adapter defaults.
func ResolveEffectiveParams(adapterType string, capabilities []string, modelParamConfig string) ([]ParamDef, bool) {
	if modelParamConfig == "" {
		return DefaultParamsForAdapter(adapterType, capabilities), false
	}
	var legacy []ParamDef
	if err := json.Unmarshal([]byte(modelParamConfig), &legacy); err == nil {
		return NormalizeParamDefsForUI(legacy), true
	}

	var profile ModelParamProfile
	if err := json.Unmarshal([]byte(modelParamConfig), &profile); err != nil {
		return nil, true
	}
	params := DefaultParamsForAdapter(adapterType, capabilities)
	params = applyModelParamProfile(params, profile)
	return NormalizeParamDefsForUI(params), true
}

func applyModelParamProfile(params []ParamDef, profile ModelParamProfile) []ParamDef {
	out := make([]ParamDef, 0, len(params)+len(profile.Add)+len(profile.Override))
	allow := stringSet(profile.Allow)
	deny := stringSet(profile.Deny)
	for _, p := range params {
		p = normalizeParamDefKey(p)
		if len(allow) > 0 && !allow[p.Key] {
			continue
		}
		if deny[p.Key] {
			continue
		}
		out = append(out, cloneParamDef(p))
	}

	for key, patch := range profile.Override {
		patch = normalizeParamDefKey(patch)
		if patch.Key == "" {
			patch.Key = normalizeParamKey(key)
		}
		if patch.Key == "" || deny[patch.Key] {
			continue
		}
		if len(allow) > 0 && !allow[patch.Key] {
			continue
		}
		merged := false
		for i := range out {
			if out[i].Key == patch.Key {
				out[i] = mergeParamDef(out[i], patch)
				merged = true
				break
			}
		}
		if !merged {
			out = append(out, normalizeParamDefKey(patch))
		}
	}

	for _, p := range profile.Add {
		p = normalizeParamDefKey(p)
		if p.Key == "" || deny[p.Key] {
			continue
		}
		if len(allow) > 0 && !allow[p.Key] {
			continue
		}
		replaced := false
		for i := range out {
			if out[i].Key == p.Key {
				out[i] = mergeParamDef(out[i], p)
				replaced = true
				break
			}
		}
		if !replaced {
			out = append(out, p)
		}
	}

	return pruneParamRulesToKnownParams(out)
}

func mergeParamDef(base, patch ParamDef) ParamDef {
	out := cloneParamDef(base)
	if patch.Key != "" {
		out.Key = patch.Key
	}
	if patch.Label != "" {
		out.Label = patch.Label
	}
	if patch.Type != "" {
		out.Type = patch.Type
	}
	if patch.Options != nil {
		out.Options = append([]string{}, patch.Options...)
	}
	if patch.Default != nil {
		out.Default = patch.Default
	}
	if patch.hasMin() {
		out.Min = patch.Min
		out.minSet = true
	}
	if patch.hasMax() {
		out.Max = patch.Max
		out.maxSet = true
	}
	if patch.hasStep() {
		out.Step = patch.Step
		out.stepSet = true
	}
	if patch.JSONSchema != nil {
		out.JSONSchema = cloneJSONSchemaMap(patch.JSONSchema)
	}
	if patch.ConflictsWith != nil {
		out.ConflictsWith = append([]string{}, patch.ConflictsWith...)
	}
	if patch.ConditionalEnum != nil {
		out.ConditionalEnum = cloneParamConditionalEnums(patch.ConditionalEnum)
	}
	if patch.ConditionalConst != nil {
		out.ConditionalConst = append([]ParamConditionalConst{}, patch.ConditionalConst...)
	}
	if patch.RequiresValue != nil {
		out.RequiresValue = append([]ParamRequiresValue{}, patch.RequiresValue...)
	}
	return out
}

func cloneParamDef(p ParamDef) ParamDef {
	if len(p.Options) > 0 {
		p.Options = append([]string{}, p.Options...)
	}
	if len(p.ConflictsWith) > 0 {
		p.ConflictsWith = append([]string{}, p.ConflictsWith...)
	}
	if p.JSONSchema != nil {
		p.JSONSchema = cloneJSONSchemaMap(p.JSONSchema)
	}
	if len(p.ConditionalEnum) > 0 {
		p.ConditionalEnum = cloneParamConditionalEnums(p.ConditionalEnum)
	}
	if len(p.ConditionalConst) > 0 {
		p.ConditionalConst = append([]ParamConditionalConst{}, p.ConditionalConst...)
	}
	if len(p.RequiresValue) > 0 {
		p.RequiresValue = append([]ParamRequiresValue{}, p.RequiresValue...)
	}
	return p
}

func cloneParamDefs(params []ParamDef) []ParamDef {
	if len(params) == 0 {
		return nil
	}
	out := make([]ParamDef, 0, len(params))
	for _, param := range params {
		out = append(out, cloneParamDef(param))
	}
	return out
}

func cloneJSONSchemaMap(schema map[string]any) map[string]any {
	out := make(map[string]any, len(schema))
	for key, value := range schema {
		out[key] = cloneJSONSchemaValue(value)
	}
	return out
}

func cloneJSONSchemaValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		return cloneJSONSchemaMap(v)
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = cloneJSONSchemaValue(item)
		}
		return out
	case []string:
		return append([]string{}, v...)
	case []int:
		return append([]int{}, v...)
	default:
		return v
	}
}

func cloneParamConditionalEnums(items []ParamConditionalEnum) []ParamConditionalEnum {
	out := make([]ParamConditionalEnum, len(items))
	for i, item := range items {
		out[i] = item
		if len(item.Options) > 0 {
			out[i].Options = append([]string{}, item.Options...)
		}
	}
	return out
}

func normalizeParamDefKey(p ParamDef) ParamDef {
	p.Key = normalizeParamKey(p.Key)
	return p
}

func normalizeParamKey(key string) string {
	for _, alias := range generationParamAliases {
		if key == alias.Legacy {
			return alias.Canonical
		}
	}
	return key
}

func stringSet(values []string) map[string]bool {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]bool, len(values))
	for _, v := range values {
		if key := normalizeParamKey(v); key != "" {
			out[key] = true
		}
	}
	return out
}

func pruneParamRulesToKnownParams(params []ParamDef) []ParamDef {
	known := make(map[string]bool, len(params))
	for _, p := range params {
		if key := normalizeParamKey(p.Key); key != "" {
			known[key] = true
		}
	}
	for i := range params {
		params[i].ConflictsWith = filterKnownParamKeys(params[i].ConflictsWith, known)
		params[i].ConditionalEnum = filterKnownConditionalEnums(params[i].ConditionalEnum, known)
		params[i].ConditionalConst = filterKnownConditionalConsts(params[i].ConditionalConst, known)
		params[i].RequiresValue = filterKnownRequiresValues(params[i].RequiresValue, known)
	}
	return params
}

func filterKnownParamKeys(values []string, known map[string]bool) []string {
	if len(values) == 0 {
		return values
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		key := normalizeParamKey(value)
		if key != "" && known[key] {
			out = append(out, key)
		}
	}
	return out
}

func filterKnownConditionalEnums(values []ParamConditionalEnum, known map[string]bool) []ParamConditionalEnum {
	if len(values) == 0 {
		return values
	}
	out := make([]ParamConditionalEnum, 0, len(values))
	for _, value := range values {
		if key := normalizeParamKey(value.WhenParam); key != "" && known[key] {
			value.WhenParam = key
			out = append(out, value)
		}
	}
	return out
}

func filterKnownConditionalConsts(values []ParamConditionalConst, known map[string]bool) []ParamConditionalConst {
	if len(values) == 0 {
		return values
	}
	out := make([]ParamConditionalConst, 0, len(values))
	for _, value := range values {
		if key := normalizeParamKey(value.WhenParam); key != "" && known[key] {
			value.WhenParam = key
			out = append(out, value)
		}
	}
	return out
}

func filterKnownRequiresValues(values []ParamRequiresValue, known map[string]bool) []ParamRequiresValue {
	if len(values) == 0 {
		return values
	}
	out := make([]ParamRequiresValue, 0, len(values))
	for _, value := range values {
		if key := normalizeParamKey(value.Param); key != "" && known[key] {
			value.Param = key
			out = append(out, value)
		}
	}
	return out
}

// ResolveModelDef builds a ModelDef from catalog/runtime model fields.
// Adapter definitions provide default parameter controls; model definitions may
// override those controls by storing CustomSupportedParams, including "[]" to
// explicitly expose no parameters for a model.
func ResolveModelDef(modelDefID, adapterType, customDisplayName, customCaps, _ string,
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

	if customMaxInputImages != 0 {
		def.MaxInputImages = customMaxInputImages
	}
	if customAcceptsImage || customMaxInputImages != 0 || hasString(def.Capabilities, CapabilityImageEdit) || hasString(def.Capabilities, CapabilityVideoI2V) {
		def.AcceptsImageInput = true
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
	if def.ImageEditField == "" && adapterType == AdapterOpenAICompat && hasString(def.Capabilities, CapabilityImageEdit) {
		def.ImageEditField = "image[]"
	}
	def.SupportedParams, def.SupportedParamsExplicit = ResolveEffectiveParams(adapterType, def.Capabilities, customSupportedParams)
	return def
}

func hasString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// ResolveModelID returns the effective API-level model ID.
// modelIDOverride takes precedence; falls back to def.ModelID.
func ResolveModelID(modelIDOverride string, def *ModelDef) string {
	if modelIDOverride != "" {
		return modelIDOverride
	}
	return def.ModelID
}

func SplitCapabilities(s string) []string {
	return splitComma(s)
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
