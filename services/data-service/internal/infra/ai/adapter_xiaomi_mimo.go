package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
)

// XiaomiMimoAdapter handles Xiaomi MiMo APIs where the wire format differs
// from plain OpenAI-compatible providers.
type XiaomiMimoAdapter struct {
	*OpenAIAdapter
}

func NewXiaomiMimoAdapter(apiKey, baseURL string) *XiaomiMimoAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.xiaomimimo.com/v1"
	}
	return &XiaomiMimoAdapter{OpenAIAdapter: NewOpenAIAdapter(strings.TrimRight(baseURL, "/"), apiKey)}
}

func (a *XiaomiMimoAdapter) ChatAudio(ctx context.Context, req media.AudioChatRequest) (media.AudioChatResponse, error) {
	model := firstNonEmptyAI(req.Model, "mimo-v2.5")
	prompt := strings.TrimSpace(firstNonEmptyAI(req.Prompt, stringParam(req.Params, "prompt", "")))
	if prompt == "" && len(req.Audio) == 0 {
		return media.AudioChatResponse{}, fmt.Errorf("prompt or audio is required")
	}

	content := make([]map[string]any, 0, 2)
	if prompt != "" {
		content = append(content, map[string]any{
			"type": "text",
			"text": prompt,
		})
	}
	if len(req.Audio) > 0 {
		content = append(content, map[string]any{
			"type": "input_audio",
			"input_audio": map[string]any{
				"data": xiaomiMimoAudioDataURI(req.MimeType, req.Audio),
			},
		})
	}

	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{
				"role":    "user",
				"content": content,
			},
		},
	}
	if language := firstNonEmptyAI(strings.TrimSpace(req.Language), stringParam(req.Params, "language", "")); language != "" {
		body["asr_options"] = map[string]any{"language": language}
	}
	if temperature, ok := numberParam(req.Params, "temperature"); ok {
		body["temperature"] = temperature
	}
	if maxTokens, ok := numberParam(req.Params, "max_completion_tokens"); ok {
		body["max_completion_tokens"] = maxTokens
	} else if maxTokens, ok := numberParam(req.Params, "max_tokens"); ok {
		body["max_completion_tokens"] = maxTokens
	}

	raw, status, latency, err := a.postOpenAIJSONWithErrorLabel(ctx, "/chat/completions", body, "xiaomi mimo audio chat")
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: model, Endpoint: a.chatEndpoint(), Method: "POST",
			RequestBody: mustJSON(redactXiaomiMimoAudioChatBody(body)), ResponseStatus: status, ResponseBody: string(raw),
			LatencyMs: latency, Error: err.Error(),
		})
		return media.AudioChatResponse{}, err
	}
	var parsed openAIChatCompletionResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return media.AudioChatResponse{}, fmt.Errorf("decode xiaomi mimo audio chat completion: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return media.AudioChatResponse{}, fmt.Errorf("no choices returned")
	}
	message := parsed.Choices[0].Message
	audio, err := decodeOpenAIChatAudio(message.Audio.Data)
	if err != nil {
		return media.AudioChatResponse{}, err
	}
	text := firstNonEmptyAI(message.Audio.Transcript, stringPtrValue(message.Content))
	if len(audio) == 0 && text == "" {
		return media.AudioChatResponse{}, fmt.Errorf("xiaomi mimo audio chat response did not include audio or text")
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: model, Endpoint: a.chatEndpoint(), Method: "POST",
		RequestBody: mustJSON(redactXiaomiMimoAudioChatBody(body)), ResponseStatus: status,
		ResponseBody: fmt.Sprintf("(xiaomi mimo audio chat response: audio_bytes=%d text_chars=%d)", len(audio), len(text)),
		LatencyMs:    latency,
	})
	return media.AudioChatResponse{
		Audio:       audio,
		Text:        text,
		MimeType:    mimeTypeForOpenAIAudioFormat(openAIAudioResponseFormat(req.AudioFormat)),
		ProviderRef: firstNonEmptyAI(message.Audio.ID, parsed.Choices[0].FinishReason),
	}, nil
}

func xiaomiMimoAudioDataURI(mimeType string, audio []byte) string {
	mimeType = strings.TrimSpace(mimeType)
	if mimeType == "" {
		mimeType = "audio/wav"
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(audio)
}

func redactXiaomiMimoAudioChatBody(body map[string]any) map[string]any {
	raw, _ := json.Marshal(body)
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{"redacted": true}
	}
	messages, _ := out["messages"].([]any)
	for _, rawMessage := range messages {
		message, _ := rawMessage.(map[string]any)
		content, _ := message["content"].([]any)
		for _, rawPart := range content {
			part, _ := rawPart.(map[string]any)
			inputAudio, _ := part["input_audio"].(map[string]any)
			if _, ok := inputAudio["data"]; ok {
				inputAudio["data"] = "(base64 audio redacted)"
			}
		}
	}
	return out
}
