package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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

func (d *dryRunProvider) buildTextRequest(req TextRequest) DebugCallResult {
	base := strings.TrimRight(d.baseURL, "/")
	maskedKey := maskKey(d.apiKey)

	switch d.adapterType {
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
				"contents": []map[string]any{{"parts": []map[string]any{{"text": req.Prompt}}, "role": "user"}},
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

	default: // openai_compat
		body := map[string]any{
			"model":  req.Model,
			"prompt": req.Prompt,
			"n":      1,
			"size":   orDefault(req.Size, "1024x1024"),
		}
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

	default: // openai_compat
		body := map[string]any{
			"model":        req.Model,
			"prompt":       req.Prompt,
			"duration":     dur,
			"aspect_ratio": ar,
			"n":            1,
		}
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
	}
}

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
