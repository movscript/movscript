package ai

// Feature key constants — must match FeatureConfig.FeatureKey in DB.
const (
	// Internal features — used by canvas, shots, scripts; not shown in admin tool config.
	FeatureScriptAnalyze = "script_analyze"
	FeatureAgentChat     = "agent_chat"
	FeatureCanvasText    = "canvas_text"
	FeatureCanvasImage   = "canvas_image"
	FeatureCanvasVideo   = "canvas_video"
	FeatureShotRefImage  = "shot_ref_image"
	FeatureShotRefVideo  = "shot_ref_video"

	// Tool features — the 6 user-facing tools shown in admin feature config.
	FeatureRefImageGen     = "ref_image_gen"
	FeatureRefVideoGen     = "ref_video_gen"
	FeatureMotionImitation = "motion_imitation"
	FeatureStyleTransfer   = "style_transfer"
	FeatureMultiAngle      = "multi_angle"
	FeatureBrainstorm      = "brainstorm"
)

// Capability constants — used in FeatureDef.RequiredCap and ModelDef.Capabilities.
const (
	CapabilityText      = "text"
	CapabilityReasoning = "reasoning"  // CoT-style reasoning models (DeepSeek R1, QwQ, o3, etc.)
	CapabilityImage     = "image"      // text-to-image
	CapabilityImageEdit = "image_edit" // image-to-image (requires image input)
	CapabilityVideo     = "video"      // text-to-video
	CapabilityVideoI2V  = "video_i2v"  // image-to-video (requires image input)
	CapabilityVideoV2V  = "video_v2v"  // video-to-video (requires video input)
	CapabilityAudio     = "audio"      // text-to-audio
)

// InputSlot describes a typed media input required or accepted by a tool feature.
type InputSlot struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Accept      string `json:"accept"` // "image" | "video"
	Required    bool   `json:"required"`
	MaxCount    int    `json:"max_count"`    // 0 = unlimited, 1 = exactly one slot item at most
	RequiresCap string `json:"requires_cap"` // only show when model has this cap; "" = always show
}

// FeatureDef describes a named AI-powered product feature.
type FeatureDef struct {
	ID             string
	DisplayName    string
	Description    string
	RequiredCap    string      // primary capability used by runtime dispatch (GetForFeature)
	CompatibleCaps []string    // all capabilities whose models are valid for this feature; nil = [RequiredCap]
	IsInternal     bool        // true = internal system feature, not shown in admin tool config
	IsToolFeature  bool        // true = user-facing tool shown in admin feature config
	InputSlots     []InputSlot // typed media inputs for tool features
	SystemPrompt   string      // default system prompt; empty for image/video features
	OutputSchema   string      // JSON schema string for expected output
	MaxTokens      int         // 0 = no limit / not applicable
	Temperature    float32     // -1 = don't set (use model default)
}

// Caps returns the effective compatible capabilities list.
func (f *FeatureDef) Caps() []string {
	if len(f.CompatibleCaps) > 0 {
		return f.CompatibleCaps
	}
	return []string{f.RequiredCap}
}

// FeatureCatalog is the hardcoded list of all product features.
var FeatureCatalog = []FeatureDef{
	// ── Internal features ────────────────────────────────────────────────────
	{
		ID: FeatureScriptAnalyze, DisplayName: "剧本 AI 分析", IsInternal: true,
		Description:  "对剧本内容进行智能分析，提取人物、背景、场景等关键信息",
		RequiredCap:  CapabilityText,
		SystemPrompt: `你是专业剧本编辑助手，分析用户提供的剧本内容。直接输出JSON对象，禁止输出JSON以外的任何内容。`,
		OutputSchema: `{"summary":"剧本提纲","characters":"人物补充说明","character_profiles":[{"id":"c1","name":"姓名","identity":"身份","traits":"性格/特征","goal":"欲望/目标","notes":"补充"}],"character_relationships":[{"id":"r1","source":"c1","target":"c2","label":"关系","type":"alliance|family|love|conflict|secret|other"}],"core_settings":["核心设定"],"background":"一句话时代背景","scenes_desc":["详细场景说明"],"hook":"核心钩子","plot_summary":"剧情推演提纲","script_points":[{"id":"p1","content":"关键点","beat_type":"hook|reversal|conflict|release|none","tags":["标签"]}]}`,
		MaxTokens:    2000, Temperature: 0,
	},
	{
		ID: FeatureAgentChat, DisplayName: "AI 助手对话", IsInternal: true,
		Description:  "侧边栏 AI 助手，用于项目创作辅助对话",
		RequiredCap:  CapabilityText,
		SystemPrompt: `你是短剧制作助手，帮助用户处理剧本创作、分镜设计、场景规划。回答简洁专业，直接给出可操作建议。`,
		MaxTokens:    4096, Temperature: 0.7,
	},
	{
		ID: FeatureCanvasText, DisplayName: "画布·文本生成", IsInternal: true,
		Description: "画布工作流中的文本生成节点", RequiredCap: CapabilityText,
		SystemPrompt: `你是创意写作助手，根据用户指令生成高质量文本内容，简洁输出，不附加无关说明。`,
		MaxTokens:    2048, Temperature: 0.7,
	},
	{ID: FeatureCanvasImage, DisplayName: "画布·图像生成", IsInternal: true, Description: "画布工作流中的图像生成节点", RequiredCap: CapabilityImage, Temperature: -1},
	{ID: FeatureCanvasVideo, DisplayName: "画布·视频生成", IsInternal: true, Description: "画布工作流中的视频生成节点", RequiredCap: CapabilityVideo, Temperature: -1},
	{ID: FeatureShotRefImage, DisplayName: "分镜·参考图生成", IsInternal: true, Description: "根据分镜描述生成参考图", RequiredCap: CapabilityImage, Temperature: -1},
	{ID: FeatureShotRefVideo, DisplayName: "分镜·参考视频生成", IsInternal: true, Description: "根据参考图或描述生成参考视频", RequiredCap: CapabilityVideo, Temperature: -1},

	// ── Tool features (shown in admin feature config) ─────────────────────────
	{
		ID: FeatureRefImageGen, DisplayName: "参考生图", IsToolFeature: true,
		Description:    "以参考图为基础，生成新的图像；同时支持纯文本生图",
		RequiredCap:    CapabilityImage,
		CompatibleCaps: []string{CapabilityImage, CapabilityImageEdit},
		Temperature:    -1,
		InputSlots: []InputSlot{
			{Key: "ref_images", Label: "参考图（可选）", Accept: "image", Required: false, MaxCount: 0},
		},
	},
	{
		ID: FeatureRefVideoGen, DisplayName: "参考生视频", IsToolFeature: true,
		Description:    "以参考图或描述为基础，生成视频",
		RequiredCap:    CapabilityVideo,
		CompatibleCaps: []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V},
		Temperature:    -1,
		InputSlots: []InputSlot{
			{Key: "ref_images", Label: "参考图（可选）", Accept: "image", Required: false, MaxCount: 0, RequiresCap: CapabilityVideoI2V},
			{Key: "ref_video", Label: "参考视频（可选）", Accept: "video", Required: false, MaxCount: 1, RequiresCap: CapabilityVideoV2V},
		},
	},
	{
		ID: FeatureMotionImitation, DisplayName: "动作迁移", IsToolFeature: true,
		Description:    "将参考视频的动作迁移到目标角色",
		RequiredCap:    CapabilityVideoV2V,
		CompatibleCaps: []string{CapabilityVideoV2V},
		Temperature:    -1,
		InputSlots: []InputSlot{
			{Key: "target_images", Label: "目标图像", Accept: "image", Required: true, MaxCount: 0},
			{Key: "motion_video", Label: "动作视频", Accept: "video", Required: true, MaxCount: 1},
		},
	},
	{
		ID: FeatureStyleTransfer, DisplayName: "画风迁移", IsToolFeature: true,
		Description:    "将参考图的画风迁移到目标图像",
		RequiredCap:    CapabilityImageEdit,
		CompatibleCaps: []string{CapabilityImageEdit},
		Temperature:    -1,
		InputSlots: []InputSlot{
			{Key: "target_image", Label: "需要修改的图像", Accept: "image", Required: true, MaxCount: 1},
			{Key: "style_images", Label: "画风图像", Accept: "image", Required: true, MaxCount: 0},
		},
	},
	{
		ID: FeatureMultiAngle, DisplayName: "多角度", IsToolFeature: true,
		Description:    "从单张参考图生成多角度视图",
		RequiredCap:    CapabilityImageEdit,
		CompatibleCaps: []string{CapabilityImageEdit},
		Temperature:    -1,
		InputSlots: []InputSlot{
			{Key: "source_image", Label: "多角度图像", Accept: "image", Required: true, MaxCount: 1},
		},
	},
	{
		ID: FeatureBrainstorm, DisplayName: "头脑风暴", IsToolFeature: true,
		Description:  "AI 多轮对话，辅助创意发散与剧本构思",
		RequiredCap:  CapabilityText,
		SystemPrompt: `你是短剧创意助手，帮助用户进行头脑风暴、创意发散和剧本构思。思维开放，给出多样化建议。`,
		MaxTokens:    4096, Temperature: 0.8,
	},
}

// ToolFeatureKeys returns the keys of all user-facing tool features.
func ToolFeatureKeys() []string {
	var keys []string
	for _, f := range FeatureCatalog {
		if f.IsToolFeature {
			keys = append(keys, f.ID)
		}
	}
	return keys
}

// GetFeatureDef returns the FeatureDef for the given feature key, or nil if not found.
func GetFeatureDef(id string) *FeatureDef {
	for i := range FeatureCatalog {
		if FeatureCatalog[i].ID == id {
			return &FeatureCatalog[i]
		}
	}
	return nil
}
