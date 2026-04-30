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
	chunks := ChunkText(content, defaultMaxChunkRunes)
	if len(chunks) == 0 {
		return Result{}, fmt.Errorf("script content is required")
	}
	if len(chunks) == 1 {
		prompt := BuildSinglePassPrompt(req.Script, content)
		payload, raw, err := a.callJSON(ctx, req.UserID, req.ModelConfigID, prompt, maxTokensForScript(req.Script.ScriptType, false))
		if err != nil {
			return Result{}, err
		}
		payload = NormalizePayloadForScript(req.Script, payload)
		return Result{Payload: payload, Prompt: prompt, RawResponse: raw}, nil
	}

	partials := make([]map[string]interface{}, 0, len(chunks))
	rawResponses := make([]string, 0, len(chunks)+1)
	prompts := make([]string, 0, len(chunks)+1)
	for _, chunk := range chunks {
		prompt := BuildChunkPrompt(req.Script, chunk)
		payload, raw, err := a.callJSON(ctx, req.UserID, req.ModelConfigID, prompt, maxTokensForScript(req.Script.ScriptType, true))
		if err != nil {
			return Result{}, fmt.Errorf("analyze script chunk %d/%d: %w", chunk.Index, chunk.Total, err)
		}
		partials = append(partials, NormalizePayloadForScript(req.Script, payload))
		rawResponses = append(rawResponses, raw)
		prompts = append(prompts, prompt)
	}

	reducePrompt := BuildReducePrompt(req.Script, partials)
	payload, raw, err := a.callJSON(ctx, req.UserID, req.ModelConfigID, reducePrompt, maxTokensForReduce(req.Script.ScriptType))
	if err != nil {
		return Result{}, fmt.Errorf("merge script analysis chunks: %w", err)
	}
	payload = NormalizePayloadForScript(req.Script, payload)
	rawResponses = append(rawResponses, raw)
	prompts = append(prompts, reducePrompt)
	if len(payload) > 0 {
		payload["analysis_chunks"] = len(chunks)
	}
	return Result{
		Payload:      payload,
		Prompt:       strings.Join(prompts, "\n\n---\n\n"),
		RawResponse:  strings.Join(rawResponses, "\n\n---\n\n"),
		PartialCount: len(chunks),
	}, nil
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
	chunks := ChunkText(content, defaultMaxChunkRunes)
	if len(chunks) != 1 {
		if emit != nil {
			emit(StreamEvent{Kind: "status", Label: "长剧本将先分片分析，再合并最终结果"})
		}
		return a.Analyze(ctx, req)
	}
	prompt := BuildSinglePassPrompt(req.Script, content)
	payload, raw, err := a.callJSONStream(ctx, streamer, req.UserID, req.ModelConfigID, prompt, maxTokensForScript(req.Script.ScriptType, false), emit)
	if err != nil {
		return Result{}, err
	}
	payload = NormalizePayloadForScript(req.Script, payload)
	return Result{Payload: payload, Prompt: prompt, RawResponse: raw}, nil
}

func (a *Analyzer) callJSON(ctx context.Context, userID, modelConfigID uint, prompt string, maxTokens int) (map[string]interface{}, string, error) {
	resp, err := a.caller.CallText(ctx, userID, modelConfigID, ai.TextRequest{
		MaxTokens:   maxTokens,
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

func (a *Analyzer) callJSONStream(ctx context.Context, streamer TextStreamCaller, userID, modelConfigID uint, prompt string, maxTokens int, emit func(StreamEvent)) (map[string]interface{}, string, error) {
	events, err := streamer.CallTextStream(ctx, userID, modelConfigID, ai.TextRequest{
		MaxTokens:   maxTokens,
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
	for event := range events {
		if event.ContentDelta != "" {
			raw.WriteString(event.ContentDelta)
			if emit != nil {
				emit(StreamEvent{Kind: "delta", Delta: event.ContentDelta})
			}
		}
	}
	payload, normalized, err := ExtractJSONObject(raw.String())
	if err != nil {
		return map[string]interface{}{}, raw.String(), nil
	}
	if normalized != "" {
		return payload, normalized, nil
	}
	return payload, raw.String(), nil
}

func maxTokensForScript(scriptType string, chunk bool) int {
	if chunk {
		switch scriptType {
		case "main":
			return 3200
		case "episode":
			return 2600
		case "scene":
			return 2200
		default:
			return 2400
		}
	}
	switch scriptType {
	case "main":
		return 4800
	case "episode":
		return 3800
	case "scene":
		return 3200
	default:
		return 3200
	}
}

func maxTokensForReduce(scriptType string) int {
	switch scriptType {
	case "main":
		return 5600
	case "episode":
		return 4200
	case "scene":
		return 3600
	default:
		return 4200
	}
}
