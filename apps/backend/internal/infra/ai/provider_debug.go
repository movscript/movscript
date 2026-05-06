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
	Capability  string // text | image | image_edit | video | video_i2v | video_v2v; inferred from EndpointURL if empty
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
	params = NormalizeGenerationParams(params)

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
			Model:              model,
			Prompt:             prompt,
			Size:               providerStringParam(params, "size", ""),
			AspectRatio:        providerStringParam(params, "aspect_ratio", ""),
			Quality:            providerStringParam(params, "quality", ""),
			Style:              providerStringParam(params, "style", ""),
			OutputFormat:       providerStringParam(params, "output_format", ""),
			OptimizePromptMode: providerStringParam(params, "optimize_prompt_mode", ""),
		}
		ireq.Seed = providerInt64PtrParam(params, "seed")
		ireq.GuidanceScale = providerFloatParam(params, "guidance_scale", 0)
		ireq.Watermark = providerBoolPtrParam(params, "watermark")
		ireq.SequentialMode = providerStringParam(params, "sequential_image_generation", "")
		ireq.SequentialMaxImages = providerIntParam(params, "max_images", 0)
		ireq.WebSearch = providerBoolParam(params, "web_search", false)
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
			Model:          model,
			Prompt:         prompt,
			Duration:       providerIntParam(params, "duration", 5),
			Frames:         providerIntParam(params, "frames", 0),
			AspectRatio:    providerStringParam(params, "aspect_ratio", "16:9"),
			Quality:        providerStringParam(params, "quality", ""),
			Size:           providerStringParam(params, "size", ""),
			ResolutionName: providerStringParam(params, "resolution", ""),
			ServiceTier:    providerStringParam(params, "service_tier", ""),
		}
		vreq.Seed = providerInt64PtrParam(params, "seed")
		vreq.CameraFixed = providerBoolPtrParam(params, "camera_fixed")
		vreq.Watermark = providerBoolPtrParam(params, "watermark")
		vreq.GenerateAudio = providerBoolPtrParam(params, "generate_audio")
		vreq.ReturnLastFrame = providerBoolPtrParam(params, "return_last_frame")
		vreq.Draft = providerBoolPtrParam(params, "draft")
		vreq.WebSearch = providerBoolParam(params, "web_search", false)
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
			Model:      model,
			PromptName: "provider_debug_text",
			MaxTokens:  providerIntParam(params, "max_tokens", DefaultTextMaxTokens),
			Messages:   []Message{{Role: "user", Content: prompt}},
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

func providerFloatParam(params map[string]any, key string, def float64) float64 {
	v, ok := params[key]
	if !ok {
		return def
	}
	if f, ok := toFloat64(v); ok {
		return f
	}
	if s, ok := v.(string); ok {
		var f float64
		if err := json.Unmarshal([]byte(s), &f); err == nil {
			return f
		}
	}
	return def
}

func providerInt64PtrParam(params map[string]any, key string) *int64 {
	v, ok := params[key]
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case int64:
		return &t
	case int:
		n := int64(t)
		return &n
	case float64:
		n := int64(t)
		return &n
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return &n
		}
	case string:
		var n int64
		if err := json.Unmarshal([]byte(t), &n); err == nil {
			return &n
		}
	}
	return nil
}

func providerBoolParam(params map[string]any, key string, def bool) bool {
	v, ok := params[key]
	if !ok {
		return def
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t == "true" || t == "1"
	}
	return def
}

func providerBoolPtrParam(params map[string]any, key string) *bool {
	if _, ok := params[key]; !ok {
		return nil
	}
	b := providerBoolParam(params, key, false)
	return &b
}
