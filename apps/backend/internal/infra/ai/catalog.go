package ai

import "encoding/json"

// PricingMode defines how credits are charged per model call.
type PricingMode string

const (
	PricingPerToken  PricingMode = "per_token"  // credits × (input + output tokens / 1M)
	PricingPerImage  PricingMode = "per_image"  // credits × image count
	PricingPerSecond PricingMode = "per_second" // credits × video duration seconds
	PricingPerCall   PricingMode = "per_call"   // fixed credits per call
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
	Key             string                 `json:"key"`
	Label           string                 `json:"label"`
	Type            string                 `json:"type"`              // "select" | "number" | "boolean"
	Options         []string               `json:"options,omitempty"` // for type=select
	Default         interface{}            `json:"default,omitempty"`
	Min             float64                `json:"min,omitempty"`
	Max             float64                `json:"max,omitempty"`
	Step            float64                `json:"step,omitempty"`
	ConflictsWith   []string               `json:"conflicts_with,omitempty"`   // params that cannot be used with this param
	ConditionalEnum []ParamConditionalEnum `json:"conditional_enum,omitempty"` // enum restrictions activated by another param
}

// ParamConditionalEnum declares a cross-parameter enum restriction for params_schema.
// Example: resolution is only ["480p"] when draft=true.
type ParamConditionalEnum struct {
	WhenParam string   `json:"when_param"`
	WhenValue any      `json:"when_value"`
	Options   []string `json:"options"`
}

// ModelParamProfile describes a model-specific delta on top of adapter params.
// It is the preferred JSON shape for AIModelConfig.CustomSupportedParams.
// For backward compatibility, CustomSupportedParams may still be a []ParamDef
// full override.
type ModelParamProfile struct {
	Allow    []string            `json:"allow,omitempty"`
	Deny     []string            `json:"deny,omitempty"`
	Override map[string]ParamDef `json:"override,omitempty"`
	Add      []ParamDef          `json:"add,omitempty"`
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
	PricingMode  PricingMode
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
	PricingMode       PricingMode `json:"pricing_mode"`
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
			Options: []string{"-1", "2", "4", "5", "10", "12", "15"}, Default: "5", ConflictsWith: []string{"frames"}},
		{Key: "frames", Label: "帧数", Type: "number", Min: 29, Max: 289, Step: 4, ConflictsWith: []string{"duration"}},
		{Key: "aspect_ratio", Label: "画面比例", Type: "select",
			Options: []string{"adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}, Default: "16:9"},
		{Key: "resolution", Label: "清晰度", Type: "select",
			Options: []string{"480p", "720p", "1080p"}, Default: "720p",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "draft", WhenValue: true, Options: []string{"480p"}}}},
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
			{Capability: CapabilityText, Params: commonTextParams()},
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
		},
		ParamSets: []AdapterParamSet{
			{Capability: CapabilityText, Params: commonTextParams()},
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
			{Capability: CapabilityText, Params: commonTextParams()},
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
		{Key: "resolution", Label: "分辨率", Type: "select", Options: resolutionOptions, Default: "720p",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "draft", WhenValue: true, Options: []string{"480p"}}}},
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
			PricingMode:       def.PricingMode,
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

	return out
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
	if patch.Min != 0 {
		out.Min = patch.Min
	}
	if patch.Max != 0 {
		out.Max = patch.Max
	}
	if patch.Step != 0 {
		out.Step = patch.Step
	}
	if patch.ConflictsWith != nil {
		out.ConflictsWith = append([]string{}, patch.ConflictsWith...)
	}
	if patch.ConditionalEnum != nil {
		out.ConditionalEnum = cloneParamConditionalEnums(patch.ConditionalEnum)
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
	if len(p.ConditionalEnum) > 0 {
		p.ConditionalEnum = cloneParamConditionalEnums(p.ConditionalEnum)
	}
	return p
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
	switch key {
	case "ratio":
		return "aspect_ratio"
	case "size":
		return "image_size"
	case "guidance_scale":
		return "prompt_strength"
	case "max_images":
		return "image_count"
	case "camera_fixed":
		return "fixed_camera"
	case "generate_audio":
		return "audio"
	default:
		return key
	}
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

// ResolveModelDef builds a ModelDef entirely from the Custom* fields stored in AIModelConfig.
// Adapter definitions provide default parameter controls; model configs may
// override those controls by storing CustomSupportedParams, including "[]" to
// explicitly expose no parameters for a model.
func ResolveModelDef(modelDefID, adapterType, customDisplayName, customCaps, customPricing string,
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

	if customPricing != "" {
		def.PricingMode = PricingMode(customPricing)
	}
	if def.PricingMode == "" {
		for _, c := range def.Capabilities {
			switch c {
			case CapabilityImage, CapabilityImageEdit:
				def.PricingMode = PricingPerImage
			case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
				def.PricingMode = PricingPerSecond
			}
		}
		if def.PricingMode == "" {
			def.PricingMode = PricingPerToken
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
