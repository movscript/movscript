package ai

import (
	"fmt"
	"strings"
)

type CompiledPrompt struct {
	Name          string
	System        string
	User          string
	Messages      []Message
	DebugMessages []DebugPromptMessage
	Compiled      string
	JSONMode      bool
	MaxTokens     int
	Temperature   float32
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
