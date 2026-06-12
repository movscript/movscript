package ai

import (
	"context"
	"encoding/base64"
	"fmt"
	"html"
	"strings"
)

type LocalAdapter struct{}

func NewLocalAdapter() *LocalAdapter {
	return &LocalAdapter{}
}

func (a *LocalAdapter) TextGenerate(_ context.Context, req TextRequest) (TextResponse, error) {
	content := localTextResponse(req)
	return TextResponse{
		Content:      content,
		FinishReason: "stop",
		Usage: TokenUsage{
			InputTokens:  estimateTextInputTokens(req),
			OutputTokens: maxPositive(len(strings.Fields(content)), 1),
		},
	}, nil
}

func (a *LocalAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	resp, err := a.TextGenerate(ctx, req)
	if err != nil {
		return nil, err
	}
	out := make(chan TextStreamEvent, 2)
	out <- TextStreamEvent{Role: "assistant", ContentDelta: resp.Content, FinishReason: resp.FinishReason, Usage: resp.Usage}
	out <- TextStreamEvent{Done: true}
	close(out)
	return out, nil
}

func (a *LocalAdapter) ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error) {
	return a.TextGenerate(ctx, req.Text)
}

func (a *LocalAdapter) ImageGenerate(_ context.Context, req ImageRequest) (ImageResponse, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "MovScript local image"
	}
	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#101828"/><rect x="96" y="96" width="832" height="832" rx="48" fill="#2dd4bf"/><text x="512" y="512" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="48" fill="#101828">%s</text></svg>`, html.EscapeString(truncateLocalText(prompt, 42)))
	return ImageResponse{URLs: []string{"data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))}}, nil
}

func (a *LocalAdapter) VideoGenerate(_ context.Context, req VideoRequest) (VideoResponse, error) {
	taskID := "local-video-" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(strings.TrimSpace(req.Prompt), 16)))
	return VideoResponse{
		TaskID:      taskID,
		TaskKind:    "local",
		Status:      VideoStatusSucceeded,
		Message:     "local video simulation completed",
		DurationSec: maxPositive(req.Duration, 1),
	}, nil
}

func (a *LocalAdapter) Ping(_ context.Context) error {
	return nil
}

func localTextResponse(req TextRequest) string {
	if req.JSONMode {
		return `{"provider":"local","status":"ok","message":"MovScript local AI gateway response"}`
	}
	userText := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if strings.TrimSpace(req.Messages[i].Role) == "user" {
			userText = strings.TrimSpace(req.Messages[i].Content)
			break
		}
	}
	if userText == "" {
		userText = strings.TrimSpace(req.PromptName)
	}
	if userText == "" {
		userText = "request"
	}
	return "MovScript local AI gateway response: " + truncateLocalText(userText, 240)
}

func truncateLocalText(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit])
}
