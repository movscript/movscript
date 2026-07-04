package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Adapter type constants.
const (
	AdapterOpenAICompat             = "openai_compat"
	AdapterNewAPI                   = "new_api"
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

// ModelParamProfile describes a catalog-entry-specific delta on top of adapter params
// for one operation.
type ModelParamProfile struct {
	Allow    []string            `json:"allow,omitempty"`
	Deny     []string            `json:"deny,omitempty"`
	Override map[string]ParamDef `json:"override,omitempty"`
	Add      []ParamDef          `json:"add,omitempty"`
}

// ModelOperationParamProfile is the v2 model parameter contract. Catalog entries
// select canonical adapter parameters by operation instead of exposing one flat
// model-wide parameter list.
type ModelOperationParamProfile struct {
	Version     int                          `json:"version,omitempty"`
	Common      ModelParamProfile            `json:"common,omitempty"`
	ByOperation map[string]ModelParamProfile `json:"by_operation,omitempty"`
}

// AdapterParamSet describes the default generation controls exposed by an adapter
// for a capability. Catalog/runtime model definitions inherit these controls
// unless admins override CustomSupportedParams to restrict or remove parameters
// for a specific model.
type AdapterParamSet struct {
	Capability string     `json:"capability"`
	Params     []ParamDef `json:"params"`
}

// AdapterOperationParamSet describes canonical parameters an adapter can
// interpret for one system operation. Provider-native field names stay inside
// adapter implementation code and do not appear in model contracts.
type AdapterOperationParamSet struct {
	Capability string     `json:"capability"`
	Operation  string     `json:"operation"`
	Params     []ParamDef `json:"params"`
}

const (
	AssetTransportPublicURL      = "public_url"
	AssetTransportMultipart      = "multipart"
	AssetTransportProviderFileID = "provider_file_id"
	AssetTransportInlineBytes    = "inline_bytes"

	AdapterResultModeSync      = "sync"
	AdapterResultModeAsyncTask = "async_task"
	AdapterResultModeRealtime  = "realtime_session"

	AdapterOutputMediaProviderURL = "provider_url"
	AdapterOutputMediaArtifactURL = "artifact_url"
	AdapterOutputMediaInlineBytes = "inline_bytes"
)

// AdapterOperationContract describes the provider-facing behavior an adapter
// implements for one canonical system operation. Catalog entries expose the
// public model contract; route bindings are accepted only when their adapter can
// satisfy that contract.
type AdapterOperationContract struct {
	Capability          string   `json:"capability"`
	Operation           string   `json:"operation"`
	InputMediaTransport []string `json:"input_media_transport,omitempty"`
	ResultMode          string   `json:"result_mode,omitempty"`
	OutputMedia         []string `json:"output_media,omitempty"`
}

// ModelDef describes an enabled model after resolving its admin-declared config
// with adapter defaults. It is used at runtime and is not a catalog entry.
type ModelDef struct {
	ID           string // logical model ID, usually the configured provider model ID
	Lab          string // model creator/family; provider/account is handled by routes
	ModelID      string // API model ID sent in requests
	DisplayName  string
	Capabilities []string // use CapabilityFamily* constants such as "text_generation", "image_generation", "video_generation", "audio_generation".
	AdapterType  string
	SourceStatus string
	APIKinds     []string

	// ModelCapabilitiesJSON is the structured, model-level operation contract
	// seeded from catalog templates. Runtime catalog entries may override it.
	ModelCapabilitiesJSON string

	// AllowModelIDOverride lets admins replace the ModelID (e.g. Volcengine ep-xxx endpoints).
	AllowModelIDOverride bool

	// InputImageField is the multipart form field name used when sending an image to /images/edits.
	// Empty means the adapter uses the default ("image"). Set to "image[]" for xAI-compatible APIs.
	InputImageField string

	// AcceptsImageInput indicates the model can receive an image as input.
	// True for models that can accept image references.
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

	// SupportedParamsByOperation lists user-configurable generation parameters
	// exposed in the v2 public model contract, keyed by system operation.
	SupportedParamsByOperation map[string][]ParamDef

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
	ID                    string     `json:"id"`
	Lab                   string     `json:"lab"`
	DefaultPublicModelID  string     `json:"default_public_model_id"`
	ModelID               string     `json:"model_id"`
	DisplayName           string     `json:"display_name"`
	Capabilities          []string   `json:"capabilities"`
	RouteAdapterHint      string     `json:"route_adapter_hint,omitempty"`
	SourceStatus          string     `json:"source_status,omitempty"`
	APIKinds              []string   `json:"api_kinds,omitempty"`
	ModelCapabilitiesJSON string     `json:"model_capabilities_json,omitempty"`
	AcceptsImageInput     bool       `json:"accepts_image_input"`
	MaxInputImages        int        `json:"max_input_images"`
	MaxInputVideos        int        `json:"max_input_videos"`
	InputImageField       string     `json:"input_image_field,omitempty"`
	SupportedParams       []ParamDef `json:"supported_params,omitempty"`
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
	AdapterType        string                     `json:"adapter_type"`
	DisplayName        string                     `json:"display_name"`
	Description        string                     `json:"description"`
	DefaultBaseURL     string                     `json:"default_base_url"`
	CredFields         []CredField                `json:"cred_fields"`
	SupportsFilesAPI   bool                       `json:"supports_files_api"` // provider has a Files API for pre-uploading media
	ProtocolProfiles   []AdapterProtocolProfile   `json:"protocol_profiles,omitempty"`
	ParamSets          []AdapterParamSet          `json:"param_sets,omitempty"`
	OperationParamSets []AdapterOperationParamSet `json:"operation_param_sets,omitempty"`
	OperationContracts []AdapterOperationContract `json:"operation_contracts,omitempty"`
}

type AdapterProtocolProfile struct {
	Profile          string   `json:"profile"`
	CapabilityFamily string   `json:"capability_family"`
	Label            string   `json:"label"`
	Implemented      bool     `json:"implemented"`
	Endpoint         string   `json:"endpoint,omitempty"`
	InheritsDriver   string   `json:"inherits_driver,omitempty"`
	Operations       []string `json:"operations,omitempty"`
	RecognizedParams []string `json:"recognized_params,omitempty"`
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

func newAPIVideoParams() []ParamDef {
	return []ParamDef{
		{Key: "duration", Label: "时长(秒)", Type: "select",
			Options: []string{"4", "6", "8", "10", "15"}, Default: "6"},
		{Key: "width", Label: "宽度", Type: "number", Default: 1280, Min: 1, Max: 4096, Step: 1},
		{Key: "height", Label: "高度", Type: "number", Default: 720, Min: 1, Max: 4096, Step: 1},
		{Key: "fps", Label: "帧率", Type: "select",
			Options: []string{"24", "30"}, Default: "24"},
		{Key: "seed", Label: "种子", Type: "number", Min: 0, Max: 2147483647, Step: 1},
		{Key: "n", Label: "生成数量", Type: "number", Default: 1, Min: 1, Max: 4, Step: 1},
		{Key: "response_format", Label: "返回格式", Type: "select",
			Options: []string{"url", "b64_json"}, Default: "url"},
		{Key: "user", Label: "用户标识", Type: "string", Default: ""},
		{Key: "metadata", Label: "扩展参数 JSON", Type: "text", Default: ""},
	}
}

func newAPIEmbeddingParams() []ParamDef {
	return []ParamDef{
		{Key: "encoding_format", Label: "编码格式", Type: "select",
			Options: []string{"float", "base64"}, Default: "float"},
		{Key: "dimensions", Label: "向量维度", Type: "number", Min: 1, Max: 3072, Step: 1},
	}
}

func newAPIRerankParams() []ParamDef {
	return []ParamDef{
		{Key: "top_n", Label: "返回数量", Type: "number", Min: 1, Max: 200, Step: 1},
		{Key: "return_documents", Label: "返回文档", Type: "boolean", Default: false},
	}
}

func newAPIModerationParams() []ParamDef {
	return nil
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
		{Key: "execution_expires_after", Label: "过期时间(秒)", Type: "number", Default: 172800, Min: 3600, Max: 259200, Step: 60},
		{Key: "priority", Label: "优先级", Type: "number", Default: 0, Min: 0, Max: 9, Step: 1},
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
		{Key: "resolution", Label: "分辨率", Type: "select",
			Options: []string{"720p", "1080p"}, Default: "720p"},
		{Key: "generate_audio", Label: "生成音频", Type: "boolean", Default: true},
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

func openAICompatSpeechToSpeechParams() []ParamDef {
	return []ParamDef{
		{Key: "voice", Label: "音色", Type: "select",
			Options: []string{"alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"}, Default: "alloy"},
		{Key: "response_format", Label: "音频格式", Type: "select",
			Options: []string{"mp3", "opus", "aac", "flac", "wav", "pcm"}, Default: "mp3"},
		{Key: "temperature", Label: "温度", Type: "number", Default: 0.8, Min: 0, Max: 2, Step: 0.1},
		{Key: "max_tokens", Label: "最大输出 Token", Type: "number", Min: 1, Max: 4096, Step: 1},
	}
}

func xiaomiMimoSpeechToSpeechParams() []ParamDef {
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
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
			{Capability: CapabilityReasoning, Params: commonTextParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: audioGenerationParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: audioGenerationParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatSpeechToSpeechParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: voiceCloneParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: voiceDesignParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: commonTextParams()},
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
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: commonImageParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: commonImageParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatAudioSpeechParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatAudioTranscribeParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatSpeechToSpeechParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatAudioTranscribeParams()},
		},
	},
	{
		AdapterType:      AdapterNewAPI,
		DisplayName:      "New API",
		Description:      "New API 聚合中转站：按路由 protocol_profile 选择 OpenAI 兼容、通用视频、Jimeng、Kling、Sora 等调用格式。",
		DefaultBaseURL:   "https://api.newapi.pro/v1",
		SupportsFilesAPI: true,
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（必填，New API 部署地址，通常以 /v1 结尾）", Required: true},
		},
		ProtocolProfiles: NewAPIAdapterProtocolProfiles(),
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: commonImageParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatAudioSpeechParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatAudioTranscribeParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: openAICompatSpeechToSpeechParams()},
			{Capability: CapabilityFamilyEmbedding, Params: newAPIEmbeddingParams()},
			{Capability: CapabilityFamilyRerank, Params: newAPIRerankParams()},
			{Capability: CapabilityFamilyModeration, Params: newAPIModerationParams()},
			{Capability: CapabilityFamilyRealtime, Params: nil},
		},
		OperationParamSets: []AdapterOperationParamSet{
			{Capability: CapabilityFamilyVideoGeneration, Operation: VideoOperationPromptToVideo, Params: newAPIVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Operation: VideoOperationImageToVideo, Params: newAPIVideoParams()},
		},
		OperationContracts: []AdapterOperationContract{
			{
				Capability:  CapabilityFamilyImageGeneration,
				Operation:   ImageOperationTextToImage,
				ResultMode:  AdapterResultModeSync,
				OutputMedia: []string{AdapterOutputMediaArtifactURL},
			},
			{
				Capability:          CapabilityFamilyImageGeneration,
				Operation:           ImageOperationReferenceToImage,
				InputMediaTransport: []string{AssetTransportMultipart},
				ResultMode:          AdapterResultModeSync,
				OutputMedia:         []string{AdapterOutputMediaArtifactURL},
			},
			{
				Capability:          CapabilityFamilyImageGeneration,
				Operation:           ImageOperationEditImage,
				InputMediaTransport: []string{AssetTransportMultipart},
				ResultMode:          AdapterResultModeSync,
				OutputMedia:         []string{AdapterOutputMediaArtifactURL},
			},
			{
				Capability:  CapabilityFamilyVideoGeneration,
				Operation:   VideoOperationPromptToVideo,
				ResultMode:  AdapterResultModeAsyncTask,
				OutputMedia: []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL},
			},
			{
				Capability:          CapabilityFamilyVideoGeneration,
				Operation:           VideoOperationImageToVideo,
				InputMediaTransport: []string{AssetTransportPublicURL, AssetTransportInlineBytes},
				ResultMode:          AdapterResultModeAsyncTask,
				OutputMedia:         []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL},
			},
			{
				Capability: CapabilityFamilyEmbedding,
				Operation:  EmbeddingOperationCreateEmbedding,
				ResultMode: AdapterResultModeSync,
			},
			{
				Capability: CapabilityFamilyRerank,
				Operation:  RerankOperationCreateRerank,
				ResultMode: AdapterResultModeSync,
			},
			{
				Capability: CapabilityFamilyModeration,
				Operation:  ModerationOperationCreateModeration,
				ResultMode: AdapterResultModeSync,
			},
			{
				Capability: CapabilityFamilyRealtime,
				Operation:  RealtimeOperationConnectSession,
				ResultMode: AdapterResultModeRealtime,
			},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: openAICompatVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: openAICompatVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: openAICompatVideoParams()},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: openAICompatVideoParams()},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: yunwuVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: yunwuVideoParams()},
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
			{Capability: CapabilityFamilyImageGeneration, Params: doubao2APIImageParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: doubao2APIVideoParams()},
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
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: klingVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: klingVideoParams()},
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
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: volcenImageParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: volcenImageParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: volcenVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: volcenVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: volcenVideoParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: volcenTTSParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: volcenASRParams()},
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
			{Capability: CapabilityFamilyTextGeneration, Params: commonTextParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: geminiImageParams()},
			{Capability: CapabilityFamilyImageGeneration, Params: geminiImageParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: geminiVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: geminiVideoParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: geminiTTSParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: geminiMusicParams()},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: dashScopeVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: dashScopeVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: dashScopeVideoParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: dashScopeTTSParams()},
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
			{Capability: CapabilityFamilyVideoGeneration, Params: viduVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Params: viduVideoParams()},
		},
	},
	{
		AdapterType:    AdapterVyroSeedance,
		DisplayName:    "Vyro Seedance 中转",
		Description:    "Vyro/83zi Seedance 视频任务接口：Seedance-2.0 全能参考 JSON/multipart + 旧 Fast multipart。",
		DefaultBaseURL: "http://115.190.186.95:3002/v1",
		CredFields: []CredField{
			{Key: "api_key", Label: "API Key", Required: true},
			{Key: "base_url", Label: "Base URL（可选，用于 83zi 或同协议入口）", Required: false},
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityFamilyVideoGeneration, Params: vyroSeedanceVideoParams()},
		},
		OperationParamSets: []AdapterOperationParamSet{
			{Capability: CapabilityFamilyVideoGeneration, Operation: VideoOperationPromptToVideo, Params: vyroSeedanceVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Operation: VideoOperationImageToVideo, Params: vyroSeedanceVideoParams()},
			{Capability: CapabilityFamilyVideoGeneration, Operation: VideoOperationReferenceToVideo, Params: vyroSeedanceVideoParams()},
		},
		OperationContracts: []AdapterOperationContract{
			{
				Capability:  CapabilityFamilyVideoGeneration,
				Operation:   VideoOperationPromptToVideo,
				ResultMode:  AdapterResultModeAsyncTask,
				OutputMedia: []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL},
			},
			{
				Capability:          CapabilityFamilyVideoGeneration,
				Operation:           VideoOperationImageToVideo,
				InputMediaTransport: []string{AssetTransportMultipart},
				ResultMode:          AdapterResultModeAsyncTask,
				OutputMedia:         []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL},
			},
			{
				Capability:          CapabilityFamilyVideoGeneration,
				Operation:           VideoOperationReferenceToVideo,
				InputMediaTransport: []string{AssetTransportMultipart},
				ResultMode:          AdapterResultModeAsyncTask,
				OutputMedia:         []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL},
			},
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
			{Capability: CapabilityFamilyAudioGeneration, Params: elevenLabsTTSParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: elevenLabsSTTParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: voiceCloneParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: voiceDesignParams()},
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
			{Capability: CapabilityFamilyAudioGeneration, Params: miniMaxTTSParams()},
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
			{Capability: CapabilityFamilyAudioGeneration, Params: xiaomiMimoSpeechToSpeechParams()},
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
			{Capability: CapabilityFamilyAudioGeneration, Params: murekaMusicParams()},
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
			{Capability: CapabilityFamilyAudioGeneration, Params: stabilityAudioParams()},
			{Capability: CapabilityFamilyAudioGeneration, Params: stabilityAudioParams()},
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
			ID:                    def.ID,
			Lab:                   def.Lab,
			DefaultPublicModelID:  defaultPublicModelIDForTemplate(def),
			ModelID:               def.ModelID,
			DisplayName:           def.DisplayName,
			Capabilities:          def.Capabilities,
			RouteAdapterHint:      def.AdapterType,
			SourceStatus:          def.SourceStatus,
			APIKinds:              NormalizeModelAPIKinds(def.APIKinds),
			ModelCapabilitiesJSON: def.ModelCapabilitiesJSON,
			AcceptsImageInput:     def.AcceptsImageInput,
			MaxInputImages:        def.MaxInputImages,
			MaxInputVideos:        def.MaxInputVideos,
			InputImageField:       def.InputImageField,
			SupportedParams:       NormalizeParamDefsForUI(cloneParamDefs(def.SupportedParams)),
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

// AdapterOperationContracts returns the normalized adapter contract registry for
// one adapter. Explicit declarations win, with conservative defaults derived
// from the adapter's known protocol family while the full registry is being
// filled out.
func AdapterOperationContracts(adapterType string) []AdapterOperationContract {
	adapterType = strings.TrimSpace(adapterType)
	def := GetAdapterDef(adapterType)
	if def == nil {
		return nil
	}
	defaults := defaultAdapterOperationContracts(adapterType, def)
	if len(def.OperationContracts) == 0 {
		return normalizeAdapterOperationContracts(defaults)
	}
	return mergeAdapterOperationContracts(defaults, def.OperationContracts)
}

func AdapterSupportsOperation(adapterType, capability, operation string) bool {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	if capability == "" {
		return false
	}
	if operation == "" && !isStructuredCapabilityFamily(capability) {
		return true
	}
	for _, contract := range AdapterOperationContracts(adapterType) {
		if strings.TrimSpace(contract.Capability) != capability {
			continue
		}
		if operation == "" || strings.TrimSpace(contract.Operation) == operation {
			return true
		}
	}
	return false
}

func AdapterOperationPublicURLRequirements(adapterType, capability, operation string) PublicURLRequirements {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	var out PublicURLRequirements
	for _, contract := range AdapterOperationContracts(adapterType) {
		if strings.TrimSpace(contract.Capability) != capability {
			continue
		}
		if operation != "" && strings.TrimSpace(contract.Operation) != operation {
			continue
		}
		if !containsTrimmed(contract.InputMediaTransport, AssetTransportPublicURL) {
			continue
		}
		switch capability {
		case CapabilityFamilyImageGeneration:
			out.Image = true
		case CapabilityFamilyAudioGeneration:
			out.Audio = true
		case CapabilityFamilyVideoGeneration:
			out.Image = true
			out.Video = true
			out.Audio = true
		default:
			out.Image = true
			out.Video = true
			out.Audio = true
		}
	}
	return out
}

func AdapterSupportsModelContract(adapterType string, capabilities []string, modelCapabilitiesJSON string, paramsByOperation map[string][]ParamDef) error {
	operationsByCapability := capabilityJSONOperationsByCapability(modelCapabilitiesJSON, capabilities)
	for capability, operations := range operationsByCapability {
		for _, operation := range operations {
			operation = strings.TrimSpace(operation)
			if operation == "" {
				continue
			}
			if !AdapterSupportsOperation(adapterType, capability, operation) {
				return fmt.Errorf("adapter %q does not support %s operation %q", adapterType, capability, operation)
			}
			if err := adapterSupportsOperationParams(adapterType, capability, operation, paramsByOperation[operation]); err != nil {
				return err
			}
		}
	}
	return nil
}

func adapterSupportsOperationParams(adapterType, capability, operation string, params []ParamDef) error {
	if len(params) == 0 {
		return nil
	}
	if strings.TrimSpace(adapterType) == AdapterNewAPI {
		return nil
	}
	baseParams := DefaultParamsForAdapterOperation(adapterType, capability, operation)
	known := make(map[string]bool, len(baseParams))
	for _, param := range baseParams {
		if key := normalizeParamKey(param.Key); key != "" {
			known[key] = true
		}
	}
	for _, param := range params {
		key := normalizeParamKey(param.Key)
		if key == "" || known[key] {
			continue
		}
		return fmt.Errorf("adapter %q does not declare canonical param %q for operation %q", adapterType, key, operation)
	}
	return nil
}

func normalizeAdapterOperationContracts(values []AdapterOperationContract) []AdapterOperationContract {
	out := make([]AdapterOperationContract, 0, len(values))
	byKey := map[string]int{}
	for _, value := range values {
		capability := strings.TrimSpace(value.Capability)
		operation := strings.TrimSpace(value.Operation)
		if capability == "" || operation == "" {
			continue
		}
		key := capability + "\x00" + operation
		value.Capability = capability
		value.Operation = operation
		value.InputMediaTransport = appendUniqueTrimmed(nil, value.InputMediaTransport...)
		value.OutputMedia = appendUniqueTrimmed(nil, value.OutputMedia...)
		value.ResultMode = strings.TrimSpace(value.ResultMode)
		if value.ResultMode == "" {
			value.ResultMode = AdapterResultModeSync
		}
		if idx, ok := byKey[key]; ok {
			out[idx].InputMediaTransport = appendUniqueTrimmed(out[idx].InputMediaTransport, value.InputMediaTransport...)
			out[idx].OutputMedia = appendUniqueTrimmed(out[idx].OutputMedia, value.OutputMedia...)
			if out[idx].ResultMode == "" || out[idx].ResultMode == AdapterResultModeSync {
				out[idx].ResultMode = value.ResultMode
			}
			continue
		}
		byKey[key] = len(out)
		out = append(out, value)
	}
	return out
}

func mergeAdapterOperationContracts(defaults, explicit []AdapterOperationContract) []AdapterOperationContract {
	out := normalizeAdapterOperationContracts(defaults)
	byKey := make(map[string]int, len(out))
	for i, value := range out {
		byKey[value.Capability+"\x00"+value.Operation] = i
	}
	for _, value := range normalizeAdapterOperationContracts(explicit) {
		key := value.Capability + "\x00" + value.Operation
		if idx, ok := byKey[key]; ok {
			out[idx] = value
			continue
		}
		byKey[key] = len(out)
		out = append(out, value)
	}
	return out
}

func defaultAdapterOperationContracts(adapterType string, def *AdapterDef) []AdapterOperationContract {
	capabilities := map[string]bool{}
	for _, set := range def.ParamSets {
		if capability := strings.TrimSpace(set.Capability); capability != "" {
			capabilities[capability] = true
		}
	}
	for _, set := range def.OperationParamSets {
		if capability := strings.TrimSpace(set.Capability); capability != "" {
			capabilities[capability] = true
		}
	}
	var out []AdapterOperationContract
	add := func(capability string, operations []string, transport []string, resultMode string, output []string) {
		for _, operation := range operations {
			out = append(out, AdapterOperationContract{
				Capability:          capability,
				Operation:           operation,
				InputMediaTransport: append([]string(nil), transport...),
				ResultMode:          resultMode,
				OutputMedia:         append([]string(nil), output...),
			})
		}
	}
	if capabilities[CapabilityFamilyTextGeneration] || capabilities[CapabilityReasoning] {
		add(CapabilityFamilyTextGeneration, defaultTextOperationsForAdapter(adapterType), nil, AdapterResultModeSync, nil)
	}
	if capabilities[CapabilityFamilyImageGeneration] {
		add(CapabilityFamilyImageGeneration, defaultImageOperationsForAdapter(adapterType), defaultInputTransportForAdapter(adapterType, CapabilityFamilyImageGeneration), AdapterResultModeSync, []string{AdapterOutputMediaArtifactURL})
	}
	if capabilities[CapabilityFamilyVideoGeneration] {
		add(CapabilityFamilyVideoGeneration, defaultVideoOperationsForAdapter(adapterType), defaultInputTransportForAdapter(adapterType, CapabilityFamilyVideoGeneration), defaultResultModeForAdapter(adapterType, CapabilityFamilyVideoGeneration), []string{AdapterOutputMediaProviderURL, AdapterOutputMediaArtifactURL})
	}
	if capabilities[CapabilityFamilyAudioGeneration] {
		add(CapabilityFamilyAudioGeneration, defaultAudioOperationsForAdapter(adapterType), defaultInputTransportForAdapter(adapterType, CapabilityFamilyAudioGeneration), defaultResultModeForAdapter(adapterType, CapabilityFamilyAudioGeneration), []string{AdapterOutputMediaArtifactURL})
	}
	return out
}

func defaultInputTransportForAdapter(adapterType, capability string) []string {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyVideoGeneration:
		switch strings.TrimSpace(adapterType) {
		case AdapterVolcen, AdapterDashScope, AdapterVidu, AdapterKling, AdapterYunwuUnifiedVideo:
			return []string{AssetTransportPublicURL}
		case AdapterOpenAIVideoMultipart, AdapterVyroSeedance:
			return []string{AssetTransportMultipart}
		case AdapterNewAPI:
			return []string{AssetTransportPublicURL, AssetTransportInlineBytes}
		}
	case CapabilityFamilyImageGeneration:
		switch strings.TrimSpace(adapterType) {
		case AdapterOpenAICompat, AdapterNewAPI:
			return []string{AssetTransportProviderFileID, AssetTransportMultipart}
		}
	case CapabilityFamilyAudioGeneration:
		switch strings.TrimSpace(adapterType) {
		case AdapterOpenAICompat, AdapterNewAPI, AdapterElevenLabs, AdapterXiaomiMimo:
			return []string{AssetTransportMultipart}
		}
	}
	return nil
}

func defaultResultModeForAdapter(adapterType, capability string) string {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyVideoGeneration:
		return AdapterResultModeAsyncTask
	case CapabilityFamilyAudioGeneration:
		switch strings.TrimSpace(adapterType) {
		case AdapterMureka, AdapterStability, AdapterDashScope, AdapterVolcen:
			return AdapterResultModeAsyncTask
		}
	}
	return AdapterResultModeSync
}

func defaultImageOperationsForAdapter(adapterType string) []string {
	switch strings.TrimSpace(adapterType) {
	case AdapterNewAPI:
		return NewAPIProtocolProfileOperations(CapabilityFamilyImageGeneration)
	case AdapterDoubao2API:
		return []string{ImageOperationTextToImage}
	default:
		return allImageGenerationOperations()
	}
}

func defaultTextOperationsForAdapter(adapterType string) []string {
	switch strings.TrimSpace(adapterType) {
	case AdapterNewAPI:
		return NewAPIProtocolProfileOperations(CapabilityFamilyTextGeneration)
	default:
		return allTextGenerationOperations()
	}
}

func defaultVideoOperationsForAdapter(adapterType string) []string {
	switch strings.TrimSpace(adapterType) {
	case AdapterOfficialVideoGenerations:
		return []string{VideoOperationPromptToVideo}
	case AdapterNewAPI:
		return NewAPIProtocolProfileOperations(CapabilityFamilyVideoGeneration)
	case AdapterYunwuUnifiedVideo:
		return []string{VideoOperationImageToVideo}
	case AdapterDoubao2API:
		return []string{VideoOperationPromptToVideo, VideoOperationImageToVideo}
	case AdapterVyroSeedance:
		return []string{VideoOperationPromptToVideo, VideoOperationImageToVideo, VideoOperationReferenceToVideo}
	default:
		return allVideoGenerationOperations()
	}
}

func defaultAudioOperationsForAdapter(adapterType string) []string {
	switch strings.TrimSpace(adapterType) {
	case AdapterNewAPI:
		return NewAPIProtocolProfileOperations(CapabilityFamilyAudioGeneration)
	case AdapterElevenLabs:
		return []string{AudioOperationTextToSpeech, AudioOperationSpeechToText, AudioOperationVoiceClone, AudioOperationVoiceDesign}
	case AdapterMiniMax:
		return []string{AudioOperationTextToSpeech}
	case AdapterXiaomiMimo:
		return []string{AudioOperationSpeechToSpeech}
	case AdapterMureka:
		return []string{AudioOperationMusicGeneration}
	case AdapterStability:
		return []string{AudioOperationMusicGeneration, AudioOperationSoundEffectGeneration}
	case AdapterDashScope:
		return []string{AudioOperationTextToSpeech}
	case AdapterVolcen:
		return []string{AudioOperationTextToSpeech, AudioOperationSpeechToText}
	default:
		return allAudioGenerationOperations()
	}
}

func allTextGenerationOperations() []string {
	return []string{"chat", "responses", "agent_task"}
}

func allImageGenerationOperations() []string {
	return []string{
		ImageOperationTextToImage,
		ImageOperationReferenceToImage,
		ImageOperationEditImage,
		ImageOperationInpaint,
		ImageOperationOutpaint,
		ImageOperationVariation,
		ImageOperationUpscaleImage,
	}
}

func allVideoGenerationOperations() []string {
	return []string{
		VideoOperationPromptToVideo,
		VideoOperationImageToVideo,
		VideoOperationFirstFrameToVideo,
		VideoOperationFirstLastFrameToVideo,
		VideoOperationReferenceToVideo,
		VideoOperationEditVideo,
		VideoOperationExtendVideo,
		VideoOperationUpscaleVideo,
	}
}

func allAudioGenerationOperations() []string {
	return []string{
		AudioOperationTextToSpeech,
		AudioOperationSpeechToText,
		AudioOperationSpeechTranslate,
		AudioOperationSpeechToSpeech,
		AudioOperationVoiceClone,
		AudioOperationVoiceDesign,
		AudioOperationDubbing,
		AudioOperationMusicGeneration,
		AudioOperationSoundEffectGeneration,
		AudioOperationVoiceIsolation,
		AudioOperationForcedAlignment,
	}
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

// DefaultParamsForAdapterOperation returns the adapter-level canonical parameters
// for one operation. Operation-specific declarations extend or override the
// capability-level defaults.
func DefaultParamsForAdapterOperation(adapterType, capability, operation string) []ParamDef {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	base := DefaultParamsForAdapter(adapterType, []string{capability})
	def := GetAdapterDef(adapterType)
	if def == nil || capability == "" || operation == "" {
		return base
	}
	out := NormalizeParamDefsForUI(cloneParamDefs(base))
	byKey := make(map[string]int, len(out))
	for i, param := range out {
		if key := normalizeParamKey(param.Key); key != "" {
			byKey[key] = i
		}
	}
	for _, set := range def.OperationParamSets {
		if strings.TrimSpace(set.Capability) != capability || strings.TrimSpace(set.Operation) != operation {
			continue
		}
		for _, param := range NormalizeParamDefsForUI(set.Params) {
			if param.Key == "" {
				continue
			}
			if idx, ok := byKey[param.Key]; ok {
				out[idx] = cloneParamDef(param)
				continue
			}
			byKey[param.Key] = len(out)
			out = append(out, cloneParamDef(param))
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

// ResolveEffectiveParamsByOperation resolves the v2 public parameter contract
// for each operation supported by a model.
func ResolveEffectiveParamsByOperation(adapterType string, capabilities []string, modelCapabilitiesJSON string, modelParamConfig string) (map[string][]ParamDef, bool) {
	operationsByCapability := capabilityJSONOperationsByCapability(modelCapabilitiesJSON, capabilities)
	if len(operationsByCapability) == 0 {
		return nil, false
	}
	var profile ModelOperationParamProfile
	explicit := false
	if strings.TrimSpace(modelParamConfig) != "" {
		var legacy []ParamDef
		if err := json.Unmarshal([]byte(modelParamConfig), &legacy); err == nil {
			explicit = true
			legacy = NormalizeParamDefsForUI(legacy)
			out := make(map[string][]ParamDef)
			for _, operations := range operationsByCapability {
				for _, operation := range operations {
					operation = strings.TrimSpace(operation)
					if operation == "" {
						continue
					}
					out[operation] = cloneParamDefs(legacy)
				}
			}
			return out, explicit
		}
		if err := json.Unmarshal([]byte(modelParamConfig), &profile); err == nil && modelOperationParamProfileHasShape(profile) {
			explicit = true
		}
	}
	out := make(map[string][]ParamDef)
	for capability, operations := range operationsByCapability {
		for _, operation := range operations {
			operation = strings.TrimSpace(operation)
			if operation == "" {
				continue
			}
			params := DefaultParamsForAdapterOperation(adapterType, capability, operation)
			if explicit {
				params = applyModelParamProfile(params, profile.Common)
				if operationProfile, ok := profile.ByOperation[operation]; ok {
					params = applyModelParamProfile(params, operationProfile)
				}
			}
			out[operation] = NormalizeParamDefsForUI(params)
		}
	}
	return out, explicit
}

func modelOperationParamProfileHasShape(profile ModelOperationParamProfile) bool {
	return profile.Version != 0 ||
		modelParamProfileHasShape(profile.Common) ||
		len(profile.ByOperation) > 0
}

func modelParamProfileHasShape(profile ModelParamProfile) bool {
	return len(profile.Allow) > 0 || len(profile.Deny) > 0 || len(profile.Override) > 0 || len(profile.Add) > 0
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
func ResolveModelDef(modelDefID, adapterType, customDisplayName, customCaps, customCapabilitiesJSON string,
	customAcceptsImage bool, customMaxInputImages, customMaxInputVideos int,
	customInputImageField, customSupportedParams string) *ModelDef {

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
	def.ModelCapabilitiesJSON = strings.TrimSpace(customCapabilitiesJSON)
	if len(def.Capabilities) == 0 {
		def.Capabilities = []string{CapabilityFamilyTextGeneration}
	}

	if customMaxInputImages != 0 {
		def.MaxInputImages = customMaxInputImages
	}
	if customAcceptsImage || customMaxInputImages != 0 || hasString(def.Capabilities, CapabilityFamilyImageGeneration) || hasString(def.Capabilities, CapabilityFamilyVideoGeneration) {
		def.AcceptsImageInput = true
	}
	if def.AcceptsImageInput && def.MaxInputImages == 0 {
		def.MaxInputImages = 1
	}
	if customMaxInputVideos != 0 {
		def.MaxInputVideos = customMaxInputVideos
	}
	if customInputImageField != "" {
		def.InputImageField = customInputImageField
	}
	if def.InputImageField == "" && adapterType == AdapterOpenAICompat && hasString(def.Capabilities, CapabilityFamilyImageGeneration) {
		def.InputImageField = "image[]"
	}
	def.SupportedParams, def.SupportedParamsExplicit = ResolveEffectiveParams(adapterType, def.Capabilities, customSupportedParams)
	def.SupportedParamsByOperation, _ = ResolveEffectiveParamsByOperation(adapterType, def.Capabilities, customCapabilitiesJSON, customSupportedParams)
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
