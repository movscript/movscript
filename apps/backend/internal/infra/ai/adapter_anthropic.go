package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicAdapter handles the Claude native Messages API.
type AnthropicAdapter struct {
	client *anthropic.Client
}

func NewAnthropicAdapter(apiKey, baseURL string) *AnthropicAdapter {
	opts := []option.RequestOption{option.WithAPIKey(apiKey)}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	c := anthropic.NewClient(opts...)
	return &AnthropicAdapter{client: &c}
}

func (a *AnthropicAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	var system string
	msgs := make([]anthropic.MessageParam, 0, len(req.Messages))
	for _, m := range req.Messages {
		if m.Role == "system" {
			system = m.Content
			continue
		}
		role := anthropic.MessageParamRoleUser
		if m.Role == "assistant" {
			role = anthropic.MessageParamRoleAssistant
		}
		content := anthropicMessageContentBlocks(m)
		msgs = append(msgs, anthropic.MessageParam{
			Role:    role,
			Content: content,
		})
	}

	maxTokens := int64(req.MaxTokens)
	if maxTokens == 0 {
		maxTokens = DefaultTextMaxTokens
	}

	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(req.Model),
		Messages:  msgs,
		MaxTokens: maxTokens,
	}
	if system != "" {
		params.System = []anthropic.TextBlockParam{{Type: "text", Text: system}}
	}
	if req.Temperature >= 0 {
		t := float64(req.Temperature)
		params.Temperature = anthropic.Float(t)
	}
	if tools := anthropicTools(req.Tools); len(tools) > 0 {
		params.Tools = tools
	}
	if choice, ok := anthropicToolChoice(req.ToolChoice); ok {
		params.ToolChoice = choice
	}

	resp, err := a.client.Messages.New(ctx, params)
	if err != nil {
		return TextResponse{}, err
	}
	if len(resp.Content) == 0 {
		return TextResponse{}, fmt.Errorf("no content returned")
	}
	text := ""
	toolCalls := make([]ToolCall, 0)
	for _, block := range resp.Content {
		if block.Type == "text" {
			text += block.Text
		} else if block.Type == "tool_use" {
			toolCalls = append(toolCalls, ToolCall{
				ID:   block.ID,
				Type: "function",
				Function: ToolFunction{
					Name:      block.Name,
					Arguments: marshalAnthropicToolInput(block.Input),
				},
			})
		}
	}
	return TextResponse{
		Content:      text,
		ToolCalls:    toolCalls,
		FinishReason: string(resp.StopReason),
		Usage: TokenUsage{
			InputTokens:  int(resp.Usage.InputTokens),
			OutputTokens: int(resp.Usage.OutputTokens),
		},
		Debug: takeDebug(ctx),
	}, nil
}

func anthropicMessageContentBlocks(message Message) []anthropic.ContentBlockParamUnion {
	content := make([]anthropic.ContentBlockParamUnion, 0, 1+len(message.ToolCalls))
	if message.Role == "tool" {
		return []anthropic.ContentBlockParamUnion{
			anthropic.NewToolResultBlock(message.ToolCallID, message.Content, false),
		}
	}
	if message.Content != "" {
		content = append(content, anthropic.NewTextBlock(message.Content))
	}
	for _, call := range message.ToolCalls {
		content = append(content, anthropic.NewToolUseBlock(call.ID, parseAnthropicToolInput(call.Function.Arguments), call.Function.Name))
	}
	if len(content) == 0 {
		content = append(content, anthropic.NewTextBlock(""))
	}
	return content
}

func anthropicTools(raw json.RawMessage) []anthropic.ToolUnionParam {
	if !rawJSONPresentAI(raw) {
		return nil
	}
	var tools []struct {
		Type     string `json:"type"`
		Function struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			Parameters  json.RawMessage `json:"parameters"`
		} `json:"function"`
	}
	if err := json.Unmarshal(raw, &tools); err != nil {
		return nil
	}
	out := make([]anthropic.ToolUnionParam, 0, len(tools))
	for _, tool := range tools {
		if tool.Type != "function" || tool.Function.Name == "" {
			continue
		}
		var schema map[string]any
		if rawJSONPresentAI(tool.Function.Parameters) {
			_ = json.Unmarshal(tool.Function.Parameters, &schema)
		}
		if schema == nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		union := anthropic.ToolUnionParamOfTool(anthropic.ToolInputSchemaParam{ExtraFields: schema}, tool.Function.Name)
		if tool.Function.Description != "" && union.OfTool != nil {
			union.OfTool.Description = anthropic.String(tool.Function.Description)
		}
		out = append(out, union)
	}
	return out
}

func anthropicToolChoice(raw json.RawMessage) (anthropic.ToolChoiceUnionParam, bool) {
	if !rawJSONPresentAI(raw) {
		return anthropic.ToolChoiceUnionParam{}, false
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		switch text {
		case "auto":
			return anthropic.ToolChoiceUnionParam{OfAuto: &anthropic.ToolChoiceAutoParam{Type: "auto"}}, true
		case "required":
			return anthropic.ToolChoiceUnionParam{OfAny: &anthropic.ToolChoiceAnyParam{Type: "any"}}, true
		case "none":
			return anthropic.ToolChoiceUnionParam{OfNone: &anthropic.ToolChoiceNoneParam{Type: "none"}}, true
		}
	}
	var choice struct {
		Type     string `json:"type"`
		Function struct {
			Name string `json:"name"`
		} `json:"function"`
	}
	if err := json.Unmarshal(raw, &choice); err != nil {
		return anthropic.ToolChoiceUnionParam{}, false
	}
	if choice.Type == "function" && choice.Function.Name != "" {
		return anthropic.ToolChoiceUnionParam{OfTool: &anthropic.ToolChoiceToolParam{Type: "tool", Name: choice.Function.Name}}, true
	}
	return anthropic.ToolChoiceUnionParam{}, false
}

func parseAnthropicToolInput(value string) any {
	if value == "" {
		return map[string]any{}
	}
	var parsed any
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		return map[string]string{"value": value}
	}
	return parsed
}

func marshalAnthropicToolInput(value any) string {
	if value == nil {
		return "{}"
	}
	b, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func (a *AnthropicAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("anthropic does not support image generation")
}

func (a *AnthropicAdapter) VideoGenerate(_ context.Context, _ VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("anthropic does not support video generation")
}

func (a *AnthropicAdapter) Ping(ctx context.Context) error {
	_, err := a.client.Models.List(ctx, anthropic.ModelListParams{})
	return err
}
