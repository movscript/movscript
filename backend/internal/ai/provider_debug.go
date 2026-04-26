package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// ProviderDebugCallRequest describes a one-off provider call with caller-supplied credentials.
type ProviderDebugCallRequest struct {
	AdapterType string
	BaseURL     string
	APIKey      string
	// EndpointURL is the full API endpoint URL (e.g. https://api.openai.com/v1/images/generations).
	// When set, Capability is inferred from the URL path. Takes precedence over Capability.
	EndpointURL string
	Capability  string         // text | image | image_edit | video | video_i2v | video_v2v; inferred from EndpointURL if empty
	Model       string
	Prompt      string
	Params      map[string]any // capability-specific extra params (size, duration, aspect_ratio, etc.)
	DryRun      bool           // if true, build the request but do not send it
}

// inferCapabilityFromURL returns a capability constant based on URL path heuristics.
func inferCapabilityFromURL(rawURL string) string {
	lower := strings.ToLower(rawURL)
	if strings.Contains(lower, "image") {
		if strings.Contains(lower, "edit") {
			return CapabilityImageEdit
		}
		return CapabilityImage
	}
	if strings.Contains(lower, "video") {
		if strings.Contains(lower, "i2v") || strings.Contains(lower, "image-to-video") {
			return CapabilityVideoI2V
		}
		return CapabilityVideo
	}
	return CapabilityText
}

// ProviderDebugCall executes a direct API call using caller-supplied credentials.
// When DryRun is true it builds the request body/headers and returns them without sending.
// The backend does NOT persist these credentials — they are used in-memory only.
func ProviderDebugCall(ctx context.Context, req ProviderDebugCallRequest) DebugCallResult {
	// Resolve capability: URL takes precedence over explicit field.
	if req.EndpointURL != "" {
		req.Capability = inferCapabilityFromURL(req.EndpointURL)
	}
	if req.Capability == "" {
		req.Capability = CapabilityText
	}

	baseURL := req.BaseURL
	if baseURL == "" {
		if def := GetAdapterDef(req.AdapterType); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}
	model := req.Model
	if model == "" {
		model = "default"
	}
	prompt := req.Prompt
	if prompt == "" {
		prompt = "a simple red circle on white background"
	}
	params := req.Params
	if params == nil {
		params = map[string]any{}
	}

	adapter, err := buildDebugAdapter(req.AdapterType, req.APIKey, baseURL)
	if err != nil {
		return DebugCallResult{ModelID: model, Error: err.Error()}
	}
	if req.DryRun {
		adapter = newDryRunProvider(req.AdapterType, req.APIKey, baseURL)
	}

	debugCtx, _ := WithDebugRecorder(ctx)

	dryRun := newDryRunProvider(req.AdapterType, req.APIKey, baseURL)

	switch req.Capability {
	case CapabilityImage, CapabilityImageEdit:
		ireq := ImageRequest{
			Model:       model,
			Prompt:      prompt,
			Size:        providerStringParam(params, "size", ""),
			AspectRatio: providerStringParam(params, "aspect_ratio", ""),
		}
		resp, callErr := adapter.ImageGenerate(debugCtx, ireq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = callErr.Error()
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		// Adapter uses SDK (no raw HTTP recording) — build synthetic request preview.
		synthetic := dryRun.buildImageRequest(ireq)
		synthetic.Success = true
		return synthetic

	case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
		vreq := VideoRequest{
			Model:       model,
			Prompt:      prompt,
			Duration:    providerIntParam(params, "duration", 5),
			AspectRatio: providerStringParam(params, "aspect_ratio", "16:9"),
		}
		resp, callErr := adapter.VideoGenerate(debugCtx, vreq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = callErr.Error()
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		synthetic := dryRun.buildVideoRequest(vreq)
		synthetic.Success = true
		return synthetic

	default: // text
		treq := TextRequest{
			Model:     model,
			MaxTokens: providerIntParam(params, "max_tokens", 256),
			Messages:  []Message{{Role: "user", Content: prompt}},
		}
		if t, ok := params["temperature"]; ok {
			if f, ok2 := toFloat64(t); ok2 {
				treq.Temperature = float32(f)
			}
		}
		resp, callErr := adapter.TextGenerate(debugCtx, treq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = callErr.Error()
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		synthetic := dryRun.buildTextRequest(treq)
		synthetic.Success = true
		return synthetic
	}
}

// buildDebugAdapter constructs a real adapter instance from caller-supplied credentials.
func buildDebugAdapter(adapterType, apiKey, baseURL string) (Provider, error) {
	switch adapterType {
	case AdapterAnthropic:
		base := strings.TrimRight(baseURL, "/")
		if base == "" {
			base = "https://api.anthropic.com"
		}
		return NewAnthropicAdapter(apiKey, base), nil

	case AdapterKling:
		parts := splitKlingKey(apiKey)
		return NewKlingAdapter(parts[0], parts[1]), nil

	case AdapterVolcen:
		return NewVolcenAdapter(baseURL, apiKey), nil

	case AdapterGemini:
		base := strings.TrimRight(baseURL, "/")
		if base == "" {
			base = "https://generativelanguage.googleapis.com"
		}
		return NewGeminiAdapter(apiKey, base), nil

	default: // openai_compat
		base := strings.TrimRight(baseURL, "/")
		if base == "" {
			return nil, fmt.Errorf("base_url is required for openai_compat adapter")
		}
		return NewOpenAIAdapter(base, apiKey), nil
	}
}

func toFloat64(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case json.Number:
		if f, err := t.Float64(); err == nil {
			return f, true
		}
	}
	return 0, false
}

func providerIntParam(params map[string]any, key string, def int) int {
	v, ok := params[key]
	if !ok {
		return def
	}
	switch t := v.(type) {
	case int:
		return t
	case float64:
		return int(t)
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return int(n)
		}
	case string:
		var n float64
		if err := json.Unmarshal([]byte(t), &n); err == nil {
			return int(n)
		}
	}
	return def
}

func providerStringParam(params map[string]any, key string, def string) string {
	v, ok := params[key]
	if !ok {
		return def
	}
	if s, ok := v.(string); ok {
		return s
	}
	return def
}
