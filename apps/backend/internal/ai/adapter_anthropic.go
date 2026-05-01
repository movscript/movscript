package ai

import (
	"context"
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
		msgs = append(msgs, anthropic.MessageParam{
			Role:    role,
			Content: []anthropic.ContentBlockParamUnion{anthropic.NewTextBlock(m.Content)},
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

	resp, err := a.client.Messages.New(ctx, params)
	if err != nil {
		return TextResponse{}, err
	}
	if len(resp.Content) == 0 {
		return TextResponse{}, fmt.Errorf("no content returned")
	}
	text := ""
	for _, block := range resp.Content {
		if block.Type == "text" {
			text += block.Text
		}
	}
	return TextResponse{
		Content: text,
		Usage: TokenUsage{
			InputTokens:  int(resp.Usage.InputTokens),
			OutputTokens: int(resp.Usage.OutputTokens),
		},
		Debug: takeDebug(ctx),
	}, nil
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
