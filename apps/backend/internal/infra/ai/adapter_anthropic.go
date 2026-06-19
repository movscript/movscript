package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicAdapter handles the Claude native Messages API.
type AnthropicAdapter struct {
	client *anthropic.Client
}

func NewAnthropicAdapter(apiKey, baseURL string) *AnthropicAdapter {
	opts := []option.RequestOption{option.WithAPIKey(apiKey)}
	if normalizedBaseURL := normalizeAnthropicBaseURL(baseURL); normalizedBaseURL != "" {
		opts = append(opts, option.WithBaseURL(normalizedBaseURL))
	}
	c := anthropic.NewClient(opts...)
	return &AnthropicAdapter{client: &c}
}

func normalizeAnthropicBaseURL(baseURL string) string {
	value := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return value
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	if parsed.Path == "/v1" {
		parsed.Path = ""
	}
	return strings.TrimRight(parsed.String(), "/")
}

func (a *AnthropicAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	params := anthropicMessageParams(req)
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
			InputTokens:       int(resp.Usage.InputTokens),
			OutputTokens:      int(resp.Usage.OutputTokens),
			CachedInputTokens: int(resp.Usage.CacheReadInputTokens),
		},
		Debug: takeDebug(ctx),
	}, nil
}

func (a *AnthropicAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	attachTextPromptDebug(ctx, req)
	stream := a.client.Messages.NewStreaming(ctx, anthropicMessageParams(req))
	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		for stream.Next() {
			event := stream.Current()
			switch event.Type {
			case "message_start":
				if event.Message.Usage.InputTokens > 0 || event.Message.Usage.CacheReadInputTokens > 0 {
					out <- TextStreamEvent{Usage: TokenUsage{
						InputTokens:       int(event.Message.Usage.InputTokens),
						CachedInputTokens: int(event.Message.Usage.CacheReadInputTokens),
					}}
				}
			case "content_block_start":
				if event.ContentBlock.Type == "tool_use" {
					out <- TextStreamEvent{ToolCallDeltas: []ToolCallDelta{{
						Index: int(event.Index),
						ID:    event.ContentBlock.ID,
						Type:  "function",
						Function: ToolFunction{
							Name: event.ContentBlock.Name,
						},
					}}}
				}
			case "content_block_delta":
				out <- anthropicTextStreamDelta(event)
			case "message_delta":
				out <- TextStreamEvent{
					FinishReason: string(event.Delta.StopReason),
					Usage: TokenUsage{
						InputTokens:       int(event.Usage.InputTokens),
						OutputTokens:      int(event.Usage.OutputTokens),
						CachedInputTokens: int(event.Usage.CacheReadInputTokens),
					},
				}
			case "message_stop":
				out <- TextStreamEvent{Done: true}
			}
		}
		if err := stream.Err(); err != nil {
			out <- TextStreamEvent{Error: fmt.Sprintf("anthropic text stream receive: %v", err)}
		}
	}()
	return out, nil
}

func anthropicTextStreamDelta(event anthropic.MessageStreamEventUnion) TextStreamEvent {
	switch event.Delta.Type {
	case "text_delta":
		return TextStreamEvent{ContentDelta: event.Delta.Text}
	case "thinking_delta":
		return TextStreamEvent{ReasoningDelta: event.Delta.Thinking}
	case "input_json_delta":
		return TextStreamEvent{ToolCallDeltas: []ToolCallDelta{{
			Index: int(event.Index),
			Function: ToolFunction{
				Arguments: event.Delta.PartialJSON,
			},
		}}}
	default:
		return TextStreamEvent{}
	}
}

func anthropicMessageParams(req TextRequest) anthropic.MessageNewParams {
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
	return params
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
