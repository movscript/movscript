package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
)

// dryRunProvider builds the HTTP request that would be sent to a provider
// and records it via recordDebug, without actually sending anything.
type dryRunProvider struct {
	adapterType string
	apiKey      string
	baseURL     string
}

func newDryRunProvider(adapterType, apiKey, baseURL string) *dryRunProvider {
	return &dryRunProvider{adapterType: adapterType, apiKey: apiKey, baseURL: baseURL}
}

func (d *dryRunProvider) Ping(ctx context.Context) error { return nil }

func (d *dryRunProvider) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	result := d.buildTextRequest(req)
	recordDebug(ctx, result)
	return TextResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	result := d.buildImageRequest(req)
	recordDebug(ctx, result)
	return ImageResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	result := d.buildVideoRequest(req)
	recordDebug(ctx, result)
	return VideoResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	result := d.buildTTSRequest(req)
	recordDebug(ctx, result)
	return media.TTSResponse{}, nil
}

func (d *dryRunProvider) CreateEmbeddings(ctx context.Context, req EmbeddingRequest) (EmbeddingResponse, error) {
	result := d.buildEmbeddingRequest(req)
	recordDebug(ctx, result)
	return EmbeddingResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) Rerank(ctx context.Context, req RerankRequest) (RerankResponse, error) {
	result := d.buildRerankRequest(req)
	recordDebug(ctx, result)
	return RerankResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) Moderate(ctx context.Context, req ModerationRequest) (ModerationResponse, error) {
	result := d.buildModerationRequest(req)
	recordDebug(ctx, result)
	return ModerationResponse{Debug: takeDebug(ctx)}, nil
}

func (d *dryRunProvider) ConnectRealtime(ctx context.Context, req RealtimeSessionRequest) (RealtimeSession, error) {
	result := d.buildRealtimeRequest(req)
	recordDebug(ctx, result)
	return noopRealtimeSession{}, nil
}

func (d *dryRunProvider) buildTextRequest(req TextRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)

	switch d.adapterType {
	case AdapterNewAPI:
		switch ResolveNewAPIProtocolProfile(CapabilityFamilyTextGeneration, req.ProtocolProfile) {
		case NewAPIProfileClaudeMessages:
			msgs := make([]map[string]string, len(req.Messages))
			for i, m := range req.Messages {
				msgs[i] = map[string]string{"role": m.Role, "content": m.Content}
			}
			body := map[string]any{
				"model":      req.Model,
				"messages":   msgs,
				"max_tokens": req.MaxTokens,
			}
			if req.Temperature >= 0 {
				body["temperature"] = req.Temperature
			}
			return DebugCallResult{
				Success:  true,
				ModelID:  req.Model,
				Endpoint: base + "/messages",
				Method:   "POST",
				RequestHeaders: map[string]string{
					"x-api-key":         maskedKey,
					"anthropic-version": "2023-06-01",
					"Content-Type":      "application/json",
				},
				RequestBody: mustJSON(body),
			}
		case NewAPIProfileGeminiGenerateContent:
			body, _, _ := newAPIGeminiGenerateContentBody(req)
			return DebugCallResult{
				Success:  true,
				ModelID:  req.Model,
				Endpoint: newAPIGeminiGenerateContentURL(base, req.Model, "generateContent"),
				Method:   "POST",
				RequestHeaders: map[string]string{
					"Authorization": "Bearer " + maskedKey,
					"Content-Type":  "application/json",
				},
				RequestBody: mustJSON(body),
			}
		}
		msgs := make([]map[string]string, len(req.Messages))
		for i, m := range req.Messages {
			msgs[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		body := map[string]any{
			"model":      req.Model,
			"messages":   msgs,
			"max_tokens": req.MaxTokens,
		}
		if req.Temperature >= 0 {
			body["temperature"] = req.Temperature
		}
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/chat/completions",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterAnthropic:
		if base == "" {
			base = "https://api.anthropic.com"
		}
		msgs := make([]map[string]string, len(req.Messages))
		for i, m := range req.Messages {
			msgs[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		body := map[string]any{
			"model":      req.Model,
			"messages":   msgs,
			"max_tokens": req.MaxTokens,
		}
		if req.Temperature >= 0 {
			body["temperature"] = req.Temperature
		}
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/v1/messages",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"x-api-key":         maskedKey,
				"anthropic-version": "2023-06-01",
				"Content-Type":      "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterGemini:
		if base == "" {
			base = "https://generativelanguage.googleapis.com"
		}
		genCfg := map[string]any{"maxOutputTokens": req.MaxTokens}
		if req.Temperature >= 0 {
			genCfg["temperature"] = req.Temperature
		}
		parts := make([]map[string]any, len(req.Messages))
		for i, m := range req.Messages {
			parts[i] = map[string]any{"text": m.Content}
		}
		body := map[string]any{
			"contents":         []map[string]any{{"parts": parts}},
			"generationConfig": genCfg,
		}
		return DebugCallResult{
			Success:        true,
			ModelID:        req.Model,
			Endpoint:       fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", base, req.Model, maskedKey),
			Method:         "POST",
			RequestHeaders: map[string]string{"Content-Type": "application/json"},
			RequestBody:    mustJSON(body),
		}

	case AdapterVolcen:
		msgs := make([]map[string]string, len(req.Messages))
		for i, m := range req.Messages {
			msgs[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		body := map[string]any{
			"model":      req.Model,
			"messages":   msgs,
			"max_tokens": req.MaxTokens,
		}
		if req.Temperature >= 0 {
			body["temperature"] = req.Temperature
		}
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/chat/completions",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	default: // openai_compat
		msgs := make([]map[string]string, len(req.Messages))
		for i, m := range req.Messages {
			msgs[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		body := map[string]any{
			"model":      req.Model,
			"messages":   msgs,
			"max_tokens": req.MaxTokens,
		}
		if req.Temperature >= 0 {
			body["temperature"] = req.Temperature
		}
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/chat/completions",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}
	}
}

func (d *dryRunProvider) buildImageRequest(req ImageRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)

	switch d.adapterType {
	case AdapterKling:
		parts := splitKlingKey(d.apiKey)
		ka := NewKlingAdapter(parts[0], parts[1])
		token := ka.BuildJWT()
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"n":            1,
			"aspect_ratio": orDefault(req.AspectRatio, "1:1"),
		}
		if req.Size != "" {
			body["size"] = req.Size
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: "https://api.klingai.com/v1/images/generations",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterGemini:
		if base == "" {
			base = "https://generativelanguage.googleapis.com"
		}
		// gemini-* models use GenerateContent with IMAGE modality; imagen-* use :predict
		if strings.HasPrefix(req.Model, "gemini-") {
			body := map[string]any{
				"contents":         []map[string]any{{"parts": []map[string]any{{"text": req.Prompt}}, "role": "user"}},
				"generationConfig": map[string]any{"responseModalities": []string{"IMAGE", "TEXT"}},
			}
			return DebugCallResult{
				Success:        true,
				ModelID:        req.Model,
				Endpoint:       fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", base, req.Model, maskedKey),
				Method:         "POST",
				RequestHeaders: map[string]string{"Content-Type": "application/json"},
				RequestBody:    mustJSON(body),
			}
		}
		body := map[string]any{
			"instances":  []map[string]any{{"prompt": req.Prompt}},
			"parameters": map[string]any{"sampleCount": 1, "aspectRatio": orDefault(req.AspectRatio, "1:1")},
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("instances[].image"))
		return DebugCallResult{
			Success:        true,
			ModelID:        req.Model,
			Endpoint:       fmt.Sprintf("%s/v1beta/models/%s:predict?key=%s", base, req.Model, maskedKey),
			Method:         "POST",
			RequestHeaders: map[string]string{"Content-Type": "application/json"},
			RequestBody:    mustJSON(body),
		}

	case AdapterVolcen:
		body := map[string]any{
			"model":  req.Model,
			"prompt": req.Prompt,
			"size":   orDefault(req.Size, "1024x1024"),
			"n":      1,
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/images/generations",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	default: // openai_compat and new_api
		if d.adapterType == AdapterNewAPI && ResolveNewAPIProtocolProfile(CapabilityFamilyImageGeneration, req.ProtocolProfile) == NewAPIProfileGeminiImages {
			_, debugBody, err := newAPIGeminiImageGenerateContentBody(req)
			if err != nil {
				return DebugCallResult{Success: false, ModelID: req.Model, Error: err.Error()}
			}
			return DebugCallResult{
				Success:  true,
				ModelID:  req.Model,
				Endpoint: newAPIGeminiGenerateContentURL(base, req.Model, "generateContent"),
				Method:   "POST",
				RequestHeaders: map[string]string{
					"Authorization": "Bearer " + maskedKey,
					"Content-Type":  "application/json",
				},
				RequestBody: mustJSON(debugBody),
			}
		}
		if d.adapterType == AdapterNewAPI && ResolveNewAPIProtocolProfile(CapabilityFamilyImageGeneration, req.ProtocolProfile) == NewAPIProfileQwenImages {
			body, err := newAPIQwenImageBody(req)
			if err != nil {
				return DebugCallResult{Success: false, ModelID: req.Model, Error: err.Error()}
			}
			return DebugCallResult{
				Success:  true,
				ModelID:  req.Model,
				Endpoint: base + newAPIQwenImageEndpointPath(req),
				Method:   "POST",
				RequestHeaders: map[string]string{
					"Authorization": "Bearer " + maskedKey,
					"Content-Type":  "application/json",
				},
				RequestBody: mustJSON(body),
			}
		}
		body := map[string]any{
			"model":  req.Model,
			"prompt": req.Prompt,
			"n":      1,
			"size":   orDefault(req.Size, "1024x1024"),
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/images/generations",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}
	}
}

func (d *dryRunProvider) buildTTSRequest(req media.TTSRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	switch d.adapterType {
	case AdapterNewAPI:
		if ResolveNewAPIProtocolProfile(CapabilityFamilyAudioGeneration, req.ProtocolProfile) == NewAPIProfileGeminiAudio {
			body, debugBody, err := newAPIGeminiAudioGenerateContentBody(req)
			if err != nil {
				return DebugCallResult{Success: false, ModelID: req.Model, Error: err.Error()}
			}
			model := firstNonEmptyAI(strings.TrimSpace(req.Model), "gemini-2.5-flash-preview-tts")
			_ = body
			return DebugCallResult{
				Success:  true,
				ModelID:  model,
				Endpoint: newAPIGeminiGenerateContentURL(base, model, "generateContent"),
				Method:   http.MethodPost,
				RequestHeaders: map[string]string{
					"Authorization": "Bearer " + maskedKey,
					"Content-Type":  "application/json",
				},
				RequestBody: mustJSON(debugBody),
			}
		}
	}
	model := firstNonEmptyAI(strings.TrimSpace(req.Model), "tts-1")
	body := map[string]any{
		"model":           model,
		"input":           req.Text,
		"voice":           firstNonEmptyAI(strings.TrimSpace(req.Voice), "alloy"),
		"response_format": firstNonEmptyAI(strings.TrimSpace(req.AudioFormat), "mp3"),
	}
	return DebugCallResult{
		Success:  true,
		ModelID:  model,
		Endpoint: base + "/audio/speech",
		Method:   http.MethodPost,
		RequestHeaders: map[string]string{
			"Authorization": "Bearer " + maskedKey,
			"Content-Type":  "application/json",
		},
		RequestBody: mustJSON(body),
	}
}

func (d *dryRunProvider) buildVideoRequest(req VideoRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	dur := req.Duration
	if dur == 0 {
		dur = 5
	}
	ar := orDefault(req.AspectRatio, "16:9")

	switch d.adapterType {
	case AdapterKling:
		parts := splitKlingKey(d.apiKey)
		ka := NewKlingAdapter(parts[0], parts[1])
		token := ka.BuildJWT()
		endpoint := "https://api.klingai.com/v1/videos/text2video"
		if req.Image != "" {
			endpoint = "https://api.klingai.com/v1/videos/image2video"
		}
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"duration":     dur,
			"aspect_ratio": ar,
		}
		if req.Image != "" {
			body["image"] = req.Image
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: endpoint,
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterGemini:
		if base == "" {
			base = "https://generativelanguage.googleapis.com"
		}
		body := map[string]any{
			"instances":  []map[string]any{{"prompt": req.Prompt}},
			"parameters": map[string]any{"aspectRatio": ar, "durationSeconds": dur, "sampleCount": 1},
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("instances[].image"))
		return DebugCallResult{
			Success:        true,
			ModelID:        req.Model,
			Endpoint:       fmt.Sprintf("%s/v1beta/models/%s:predictLongRunning?key=%s", base, req.Model, maskedKey),
			Method:         "POST",
			RequestHeaders: map[string]string{"Content-Type": "application/json"},
			RequestBody:    mustJSON(body),
		}

	case AdapterVolcen:
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"req_key":      "video_generation",
			"duration":     dur,
			"aspect_ratio": ar,
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("content[].image_url"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/contents/generations/tasks",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterOfficialVideoGenerations:
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"duration":     dur,
			"aspect_ratio": ar,
			"n":            1,
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("input_reference[]"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/videos/generations",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterYunwuUnifiedVideo:
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"aspect_ratio": ar,
			"size":         orDefault(req.Size, "720P"),
			"images":       []string{"https://example.test/reference.png"},
		}
		attachReferenceAssetDebugBindings(body, req.ReferenceAssets, staticReferenceAssetProviderField("images[]"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/video/create",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "application/json",
				"Accept":        "application/json",
			},
			RequestBody: mustJSON(body),
		}

	case AdapterNewAPI:
		if req.Duration == 0 {
			dur = 6
		}
		_, debugBody, err := newAPIVideoGenerationsJSONBody(req, dur)
		if err != nil {
			debugBody = map[string]any{
				"model":    req.Model,
				"prompt":   req.Prompt,
				"duration": dur,
				"error":    err.Error(),
			}
		}
		attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/videos",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "multipart/form-data",
			},
			RequestBody: mustJSON(debugBody),
		}

	default:
		return DebugCallResult{
			Success:  true,
			ModelID:  req.Model,
			Endpoint: base + "/videos",
			Method:   "POST",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer " + maskedKey,
				"Content-Type":  "multipart/form-data",
			},
			RequestBody: fmt.Sprintf("(multipart: model=%s prompt=%q images=%d)", req.Model, req.Prompt, len(req.InputImages)),
		}
	}
}

func (d *dryRunProvider) buildEmbeddingRequest(req EmbeddingRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	body := map[string]any{
		"model": req.Model,
		"input": newAPIEmbeddingInputPayload(req.Inputs),
	}
	if req.EncodingFormat != "" {
		body["encoding_format"] = req.EncodingFormat
	}
	if req.Dimensions > 0 {
		body["dimensions"] = req.Dimensions
	}
	copyNewAPIExtraParams(body, req.ExtraParams)
	return DebugCallResult{
		Success:  true,
		ModelID:  req.Model,
		Endpoint: base + newAPIEmbeddingEndpointPath(req.Model, req.ProtocolProfile),
		Method:   "POST",
		RequestHeaders: map[string]string{
			"Authorization": "Bearer " + maskedKey,
			"Content-Type":  "application/json",
		},
		RequestBody: mustJSON(body),
	}
}

func (d *dryRunProvider) buildRerankRequest(req RerankRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	body := map[string]any{
		"model":     req.Model,
		"query":     req.Query,
		"documents": newAPIRerankDocumentsPayload(req.Documents),
	}
	if req.TopN > 0 {
		body["top_n"] = req.TopN
	}
	if req.ReturnDocuments {
		body["return_documents"] = true
	}
	copyNewAPIExtraParams(body, req.ExtraParams)
	return DebugCallResult{
		Success:  true,
		ModelID:  req.Model,
		Endpoint: base + "/rerank",
		Method:   "POST",
		RequestHeaders: map[string]string{
			"Authorization": "Bearer " + maskedKey,
			"Content-Type":  "application/json",
		},
		RequestBody: mustJSON(body),
	}
}

func (d *dryRunProvider) buildModerationRequest(req ModerationRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	body := map[string]any{
		"input": newAPIEmbeddingInputPayload(req.Inputs),
	}
	if req.Model != "" {
		body["model"] = req.Model
	}
	copyNewAPIExtraParams(body, req.ExtraParams)
	return DebugCallResult{
		Success:  true,
		ModelID:  req.Model,
		Endpoint: base + "/moderations",
		Method:   "POST",
		RequestHeaders: map[string]string{
			"Authorization": "Bearer " + maskedKey,
			"Content-Type":  "application/json",
		},
		RequestBody: mustJSON(body),
	}
}

func (d *dryRunProvider) buildRealtimeRequest(req RealtimeSessionRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)
	endpoint, err := newAPIRealtimeURL(base, req)
	if err != nil {
		endpoint = base + "/realtime"
	}
	headers := map[string]string{"Authorization": "Bearer " + maskedKey}
	for key, value := range req.Headers {
		if isNewAPIRealtimeReservedHeader(key) {
			continue
		}
		if strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
			headers[key] = value
		}
	}
	return DebugCallResult{
		Success:        true,
		ModelID:        req.Model,
		Endpoint:       endpoint,
		Method:         "GET",
		RequestHeaders: headers,
	}
}

type noopRealtimeSession struct{}

func (noopRealtimeSession) SendEvent(context.Context, RealtimeEvent) error { return nil }
func (noopRealtimeSession) ReceiveEvent(context.Context) (RealtimeEvent, error) {
	return RealtimeEvent{}, nil
}
func (noopRealtimeSession) Close() error { return nil }

func mustJSON(v any) string {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
