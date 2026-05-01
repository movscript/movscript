package scriptanalysis

import (
	"context"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/ai"
)

func (a *Analyzer) Analyze(ctx context.Context, req Request) (Result, error) {
	if a == nil || a.caller == nil {
		return Result{}, fmt.Errorf("script analysis AI caller is not configured")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return Result{}, fmt.Errorf("script content is required")
	}
	prompt := BuildSinglePassPrompt(req.Script, content)
	payload, raw, err := a.callJSON(ctx, req.UserID, req.ModelConfigID, prompt)
	if err != nil {
		return Result{}, err
	}
	payload = NormalizePayloadForScript(req.Script, payload)
	return Result{Payload: payload, Prompt: prompt, RawResponse: raw}, nil
}

func (a *Analyzer) AnalyzeStream(ctx context.Context, req Request, emit func(StreamEvent)) (Result, error) {
	if a == nil || a.caller == nil {
		return Result{}, fmt.Errorf("script analysis AI caller is not configured")
	}
	streamer, ok := a.caller.(TextStreamCaller)
	if !ok {
		return Result{}, fmt.Errorf("script analysis streaming is not supported by this AI service")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return Result{}, fmt.Errorf("script content is required")
	}
	prompt := BuildSinglePassPrompt(req.Script, content)
	payload, raw, err := a.callJSONStream(ctx, streamer, req.UserID, req.ModelConfigID, prompt, emit)
	if err != nil {
		return Result{}, err
	}
	payload = NormalizePayloadForScript(req.Script, payload)
	return Result{Payload: payload, Prompt: prompt, RawResponse: raw}, nil
}

func (a *Analyzer) callJSON(ctx context.Context, userID, modelConfigID uint, prompt string) (map[string]interface{}, string, error) {
	resp, err := a.caller.CallText(ctx, userID, modelConfigID, ai.TextRequest{
		MaxTokens:   ai.DefaultTextMaxTokens,
		Temperature: 0,
		JSONMode:    true,
		Messages: []ai.Message{
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		return nil, "", err
	}
	payload, normalized, err := ExtractJSONObject(resp.Content)
	if err != nil {
		return map[string]interface{}{}, resp.Content, nil
	}
	if normalized != "" {
		return payload, normalized, nil
	}
	return payload, resp.Content, nil
}

func (a *Analyzer) callJSONStream(ctx context.Context, streamer TextStreamCaller, userID, modelConfigID uint, prompt string, emit func(StreamEvent)) (map[string]interface{}, string, error) {
	events, err := streamer.CallTextStream(ctx, userID, modelConfigID, ai.TextRequest{
		MaxTokens:   ai.DefaultTextMaxTokens,
		Temperature: 0,
		JSONMode:    true,
		Messages: []ai.Message{
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		return nil, "", err
	}
	var raw strings.Builder
	eventsSeen := 0
	reasoningEvents := 0
	finishReason := ""
	for event := range events {
		eventsSeen++
		if event.Error != "" {
			return nil, raw.String(), fmt.Errorf("%s", event.Error)
		}
		if event.FinishReason != "" {
			finishReason = event.FinishReason
		}
		if event.ReasoningDelta != "" {
			reasoningEvents++
			if emit != nil {
				emit(StreamEvent{Kind: "reasoning", Delta: event.ReasoningDelta})
			}
		}
		if event.ContentDelta != "" {
			raw.WriteString(event.ContentDelta)
			if emit != nil {
				emit(StreamEvent{Kind: "delta", Delta: event.ContentDelta})
			}
		}
	}
	rawText := raw.String()
	if strings.TrimSpace(rawText) == "" {
		detail := fmt.Sprintf("AI stream returned no content after %d events", eventsSeen)
		if reasoningEvents > 0 {
			detail += fmt.Sprintf(" (reasoning_events=%d)", reasoningEvents)
		}
		if finishReason != "" {
			detail += fmt.Sprintf(" (finish_reason=%s)", finishReason)
		}
		return nil, "", fmt.Errorf("%s", detail)
	}
	payload, normalized, err := ExtractJSONObject(rawText)
	if err != nil {
		return map[string]interface{}{}, rawText, nil
	}
	if normalized != "" {
		return payload, normalized, nil
	}
	return payload, rawText, nil
}
