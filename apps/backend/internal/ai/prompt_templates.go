package ai

import (
	"fmt"
	"strings"
)

type CompiledPrompt struct {
	Name           string
	System         string
	User           string
	Messages       []Message
	DebugMessages  []DebugPromptMessage
	Compiled       string
	JSONMode       bool
	MaxTokens      int
	Temperature    float32
}

type PromptContext struct {
	ProjectID        uint
	ProjectName      string
	ProjectStatus    string
	ProjectDesc      string
	ProductionID     uint
	ProductionName   string
	ProductionStatus string
	ProductionDesc   string
	ScriptVersionID  uint
	ScriptTitle      string
	SourceLabel      string
}

type ProductionOrchestrationPromptInput struct {
	Context        PromptContext
	SourceText     string
	ExistingBrief  string
	StoryboardRows string
}

const MovScriptSystemPrompt = `你是 MovScript 的制作系统助手。MovScript 是一个围绕短剧和 AI 视频制作的本地优先工作台，核心对象包括 project、script、script_version、production、production_text_block、segment、scene_moment、creative_reference、asset_slot、content_unit、keyframe、preview_timeline、work_item 和 raw_resource。

你的职责：
1. 只围绕当前 project 和当前 production 工作，不把其它项目、其它制作或外部臆测混入结果。
2. 保留用户给出的业务事实；没有证据的信息必须标成待确认，不能伪造 ID、素材状态或剧本内容。
3. 产出要能被系统写入语义实体：字段稳定、关系清楚、client_id 可追踪、顺序可复现。
4. 修改或新增正式数据前，优先生成候选或草稿，让用户审核后再应用。
5. 遇到缺少上下文时，明确指出缺口，并尽量基于已有上下文给出最小可用结果。
6. 回答和字段内容默认使用中文，除非用户输入或上下文明确要求其它语言。

重要约束：
- prompt content 必须是自然语言/分段文本，不要把整段上下文作为 JSON 字符串塞进 content。
- 如果调用方要求 JSON 输出，只在最终答案中输出 JSON 对象；不要用 Markdown 代码块包裹。
- JSON 输出中的长文本字段仍然写自然语言，不要再嵌套 JSON 字符串。`

const productionOrchestrationSystemPrompt = MovScriptSystemPrompt + `

你现在执行“制作编排”任务：把剧本文本和当前制作上下文拆解为可确认的制作候选。

必须产出五类候选：
- segments：片段，表达制作结构的大段叙事拆分。
- scene_moments：情节，表达片段内可执行的时空/动作/情绪节点。
- creative_references：创作资料，包括人物、地点、道具、产品、品牌、风格、世界规则。
- asset_slots：素材需求，包括图片、视频、音频、文字、参考素材等待补充资产。
- content_units：内容单元，表达需要生成或制作的镜头、视觉段落、字幕卡、旁白、转场、音乐点等。

关系要求：
- scene_moment.segment_id 必须指向 segments.client_id。
- content_unit.segment_id 和 content_unit.scene_moment_id 必须指向有效 client_id。
- asset_slot.owner_type 必须是 segment、scene_moment、content_unit 或 creative_reference；owner_id 使用对应候选的 client_id。
- creative_reference、asset_slot 和 content_unit 之间的引用必须使用 client_id 数组。
- 对已有实体做去重判断；疑似重复时保留新候选，但写 conflict_status 和 conflict_reason。

输出格式：
只输出一个 JSON 对象，顶层字段固定为 summary、segments、scene_moments、creative_references、asset_slots、content_units、warnings。`

func BuildProductionOrchestrationPrompt(input ProductionOrchestrationPromptInput) CompiledPrompt {
	user := strings.Join([]string{
		"任务",
		"基于当前 project、当前 production 和剧本文本，生成制作编排候选。不要把上下文当作 JSON 原样复述；请理解上下文后输出规范 JSON 对象。",
		"",
		"当前上下文",
		formatPromptContext(input.Context),
		"",
		"已有制作实体摘要",
		orEmptyBlock(input.ExistingBrief, "未提供已有实体摘要。"),
		"",
		"已有分镜/预演行",
		orEmptyBlock(input.StoryboardRows, "未提供已有分镜或预演行。"),
		"",
		"剧本文本",
		orEmptyBlock(input.SourceText, "未提供剧本文本。"),
		"",
		"输出字段要求",
		`{
  "summary": "本次编排摘要",
  "segments": [{"client_id":"s1","order":1,"title":"片段标题","summary":"摘要","source_range":"来源范围","conflict_status":"new|duplicate|needs_review","conflict_reason":"可选"}],
  "scene_moments": [{"client_id":"sm1","segment_id":"s1","order":1,"title":"情节标题","description":"情节说明","time_text":"时间","location_text":"地点","action_text":"动作","mood":"氛围","creative_reference_ids":["cr1"],"asset_slot_ids":["as1"],"content_unit_ids":["cu1"]}],
  "creative_references": [{"client_id":"cr1","name":"名称","type":"person|place|prop|product|brand|style|world_rule","importance":"high|normal|low","description":"描述","segment_ids":["s1"],"scene_moment_ids":["sm1"],"content_unit_ids":["cu1"],"required_asset_slot_ids":["as1"]}],
  "asset_slots": [{"client_id":"as1","owner_type":"segment|scene_moment|content_unit|creative_reference","owner_id":"s1","name":"素材名","type":"image|video|audio|text|brand_pack|reference","description":"用途说明","prompt_hint":"给生成模型的自然语言提示","priority":"critical|high|normal|low"}],
  "content_units": [{"client_id":"cu1","segment_id":"s1","scene_moment_id":"sm1","order":1,"type":"shot|visual_segment|product_showcase|caption_card|narration|transition|music_beat","title":"内容标题","description":"内容目标","prompt":"给生成模型的自然语言提示","shot_size":"景别","camera_angle":"角度","creative_reference_ids":["cr1"],"asset_slot_ids":["as1"]}],
  "warnings": ["缺少或不确定的信息"]
}`,
	}, "\n")

	return BuildTextPrompt(CompiledPrompt{
		Name:        FeatureProductionOrchestrate,
		System:      productionOrchestrationSystemPrompt,
		User:        user,
		JSONMode:    true,
		MaxTokens:   DefaultTextMaxTokens,
		Temperature: 0,
	})
}

func BuildFeaturePrompt(featureKey, systemPrompt, userPrompt string, jsonMode bool, maxTokens int, temperature float32, isReasoning bool) CompiledPrompt {
	system := strings.TrimSpace(systemPrompt)
	if system == "" {
		system = MovScriptSystemPrompt
	}
	prompt := BuildTextPrompt(CompiledPrompt{
		Name:        NormalizeFeatureKey(featureKey),
		System:      system,
		User:        userPrompt,
		JSONMode:    jsonMode,
		MaxTokens:   maxTokens,
		Temperature: temperature,
	})
	if isReasoning && prompt.System != "" {
		merged := strings.TrimSpace(prompt.System + "\n\n" + prompt.User)
		prompt.Messages = []Message{{Role: "user", Content: merged}}
		prompt.DebugMessages = []DebugPromptMessage{{Role: "user", Content: merged}}
		prompt.Compiled = compileDebugPrompt(prompt.Name, prompt.DebugMessages)
	}
	return prompt
}

func BuildTextPrompt(prompt CompiledPrompt) CompiledPrompt {
	prompt.System = strings.TrimSpace(prompt.System)
	prompt.User = strings.TrimSpace(prompt.User)
	messages := make([]Message, 0, 2)
	debugMessages := make([]DebugPromptMessage, 0, 2)
	if prompt.System != "" {
		messages = append(messages, Message{Role: "system", Content: prompt.System})
		debugMessages = append(debugMessages, DebugPromptMessage{Role: "system", Content: prompt.System})
	}
	messages = append(messages, Message{Role: "user", Content: prompt.User})
	debugMessages = append(debugMessages, DebugPromptMessage{Role: "user", Content: prompt.User})
	prompt.Messages = messages
	prompt.DebugMessages = debugMessages
	prompt.Compiled = compileDebugPrompt(prompt.Name, debugMessages)
	return prompt
}

func AttachPromptDebug(req *TextRequest, prompt CompiledPrompt) {
	if req == nil {
		return
	}
	req.PromptName = prompt.Name
	req.Messages = prompt.Messages
	req.JSONMode = prompt.JSONMode
	req.MaxTokens = prompt.MaxTokens
	req.Temperature = prompt.Temperature
}

func formatPromptContext(ctx PromptContext) string {
	lines := []string{
		formatContextLine("project_id", ctx.ProjectID),
		formatContextLine("project_name", ctx.ProjectName),
		formatContextLine("project_status", ctx.ProjectStatus),
		formatContextLine("project_description", ctx.ProjectDesc),
		formatContextLine("production_id", ctx.ProductionID),
		formatContextLine("production_name", ctx.ProductionName),
		formatContextLine("production_status", ctx.ProductionStatus),
		formatContextLine("production_description", ctx.ProductionDesc),
		formatContextLine("script_version_id", ctx.ScriptVersionID),
		formatContextLine("script_title", ctx.ScriptTitle),
		formatContextLine("source", ctx.SourceLabel),
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if line != "" {
			out = append(out, "- "+line)
		}
	}
	if len(out) == 0 {
		return "- 未提供 project/production 上下文。"
	}
	return strings.Join(out, "\n")
}

func formatContextLine(label string, value any) string {
	switch v := value.(type) {
	case uint:
		if v == 0 {
			return ""
		}
		return fmt.Sprintf("%s: %d", label, v)
	case string:
		if strings.TrimSpace(v) == "" {
			return ""
		}
		return fmt.Sprintf("%s: %s", label, strings.TrimSpace(v))
	default:
		return ""
	}
}

func orEmptyBlock(value, empty string) string {
	if strings.TrimSpace(value) == "" {
		return empty
	}
	return strings.TrimSpace(value)
}

func compileDebugPrompt(name string, messages []DebugPromptMessage) string {
	var b strings.Builder
	if strings.TrimSpace(name) != "" {
		b.WriteString("Prompt: ")
		b.WriteString(strings.TrimSpace(name))
		b.WriteString("\n\n")
	}
	for i, message := range messages {
		if i > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString("[")
		b.WriteString(message.Role)
		b.WriteString("]\n")
		b.WriteString(message.Content)
	}
	return b.String()
}
