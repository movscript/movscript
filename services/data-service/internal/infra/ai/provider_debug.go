package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
)

// ProviderDebugCallRequest describes a one-off provider call with caller-supplied credentials.
type ProviderDebugCallRequest struct {
	AdapterType string
	BaseURL     string
	APIKey      string
	// EndpointURL is the full API endpoint URL (e.g. https://api.openai.com/v1/images/generations).
	// When set, Capability is inferred from the URL path. Takes precedence over Capability.
	EndpointURL string
	Capability  string // text_generation | image_generation | video_generation | audio_generation | embedding | rerank | moderation | realtime; inferred from EndpointURL if empty
	Model       string
	Prompt      string
	Params      map[string]any // capability-specific extra params (size, duration, aspect_ratio, etc.)
	DryRun      bool           // if true, build the request but do not send it
}

// inferCapabilityFromURL returns a capability constant based on URL path heuristics.
func inferCapabilityFromURL(rawURL string) string {
	lower := strings.ToLower(rawURL)
	if strings.Contains(lower, "embedding") {
		return CapabilityFamilyEmbedding
	}
	if strings.Contains(lower, "rerank") {
		return CapabilityFamilyRerank
	}
	if strings.Contains(lower, "moderation") {
		return CapabilityFamilyModeration
	}
	if strings.Contains(lower, "realtime") || strings.HasPrefix(lower, "ws://") || strings.HasPrefix(lower, "wss://") {
		return CapabilityFamilyRealtime
	}
	if strings.Contains(lower, "image") {
		if strings.Contains(lower, "edit") {
			return CapabilityFamilyImageGeneration
		}
		return CapabilityFamilyImageGeneration
	}
	if strings.Contains(lower, "video") {
		if strings.Contains(lower, "i2v") || strings.Contains(lower, "image-to-video") {
			return CapabilityFamilyVideoGeneration
		}
		return CapabilityFamilyVideoGeneration
	}
	return CapabilityFamilyTextGeneration
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
		req.Capability = CapabilityFamilyTextGeneration
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
	protocolProfile := providerStringParam(params, "protocol_profile", "")

	adapter, err := buildDebugAdapter(req.AdapterType, req.APIKey, baseURL)
	if err != nil {
		return DebugCallResult{ModelID: model, Error: sanitizeDebugError(err.Error())}
	}
	if req.DryRun {
		adapter = newDryRunProvider(req.AdapterType, req.APIKey, baseURL)
	}

	debugCtx, _ := WithDebugRecorder(ctx)

	dryRun := newDryRunProvider(req.AdapterType, req.APIKey, baseURL)

	switch req.Capability {
	case CapabilityFamilyRealtime:
		rreq := RealtimeSessionRequest{
			Model:           model,
			ProtocolProfile: protocolProfile,
			Query:           providerStringMapParam(params, "query"),
			Headers:         providerStringMapParam(params, "headers"),
		}
		realtimeProvider, ok := adapter.(RealtimeProvider)
		if !ok {
			return DebugCallResult{ModelID: model, Error: fmt.Sprintf("%s adapter does not support realtime", req.AdapterType)}
		}
		session, callErr := realtimeProvider.ConnectRealtime(debugCtx, rreq)
		if session != nil {
			_ = session.Close()
		}
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
			result.Success = false
			return *result
		}
		if result := takeDebug(debugCtx); result != nil {
			return *result
		}
		synthetic := dryRun.buildRealtimeRequest(rreq)
		synthetic.Success = true
		return synthetic

	case CapabilityFamilyEmbedding:
		ereq := EmbeddingRequest{
			Model:           model,
			ProtocolProfile: protocolProfile,
			Inputs:          providerStringSliceParam(params, "input", []string{prompt}),
			EncodingFormat:  providerStringParam(params, "encoding_format", ""),
			Dimensions:      providerIntParam(params, "dimensions", 0),
		}
		embeddingProvider, ok := adapter.(EmbeddingProvider)
		if !ok {
			return DebugCallResult{ModelID: model, Error: fmt.Sprintf("%s adapter does not support embedding", req.AdapterType)}
		}
		resp, callErr := embeddingProvider.CreateEmbeddings(debugCtx, ereq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		synthetic := dryRun.buildEmbeddingRequest(ereq)
		synthetic.Success = true
		return synthetic

	case CapabilityFamilyRerank:
		rreq := RerankRequest{
			Model:           model,
			ProtocolProfile: protocolProfile,
			Query:           prompt,
			Documents:       providerRerankDocumentsParam(params),
			TopN:            providerIntParam(params, "top_n", 0),
			ReturnDocuments: providerBoolParam(params, "return_documents", false),
		}
		rerankProvider, ok := adapter.(RerankProvider)
		if !ok {
			return DebugCallResult{ModelID: model, Error: fmt.Sprintf("%s adapter does not support rerank", req.AdapterType)}
		}
		resp, callErr := rerankProvider.Rerank(debugCtx, rreq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		synthetic := dryRun.buildRerankRequest(rreq)
		synthetic.Success = true
		return synthetic

	case CapabilityFamilyModeration:
		mreq := ModerationRequest{
			Model:           model,
			ProtocolProfile: protocolProfile,
			Inputs:          providerStringSliceParam(params, "input", []string{prompt}),
		}
		moderationProvider, ok := adapter.(ModerationProvider)
		if !ok {
			return DebugCallResult{ModelID: model, Error: fmt.Sprintf("%s adapter does not support moderation", req.AdapterType)}
		}
		resp, callErr := moderationProvider.Moderate(debugCtx, mreq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
			result.Success = false
			return *result
		}
		if resp.Debug != nil {
			return *resp.Debug
		}
		synthetic := dryRun.buildModerationRequest(mreq)
		synthetic.Success = true
		return synthetic

	case CapabilityFamilyAudioGeneration:
		treq := media.TTSRequest{
			Model:           model,
			ProtocolProfile: protocolProfile,
			Text:            prompt,
			Voice:           providerStringParam(params, "voice", ""),
			AudioFormat:     providerStringParam(params, "audio_format", ""),
			Params:          params,
		}
		ttsProvider, ok := adapter.(AudioSpeechProvider)
		if !ok {
			return DebugCallResult{ModelID: model, Error: fmt.Sprintf("%s adapter does not support audio speech", req.AdapterType)}
		}
		_, callErr := ttsProvider.Synthesize(debugCtx, treq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
			result.Success = false
			return *result
		}
		if result := takeDebug(debugCtx); result != nil {
			return *result
		}
		synthetic := dryRun.buildTTSRequest(treq)
		synthetic.Success = true
		return synthetic

	case CapabilityFamilyImageGeneration:
		ireq := ImageRequest{
			Model:              model,
			ProtocolProfile:    protocolProfile,
			Prompt:             prompt,
			Size:               providerStringParam(params, "size", ""),
			AspectRatio:        providerStringParam(params, "aspect_ratio", ""),
			Quality:            providerStringParam(params, "quality", ""),
			Style:              providerStringParam(params, "style", ""),
			OutputFormat:       providerStringParam(params, "output_format", ""),
			OptimizePromptMode: providerStringParam(params, "optimize_prompt_mode", ""),
			ExtraParams:        params,
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
			result.Error = sanitizeDebugError(callErr.Error())
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

	case CapabilityFamilyVideoGeneration:
		vreq := VideoRequest{
			Model:                 model,
			ProtocolProfile:       protocolProfile,
			Prompt:                prompt,
			Duration:              providerIntParam(params, "duration", 5),
			Frames:                providerIntParam(params, "frames", 0),
			Width:                 providerIntParam(params, "width", 0),
			Height:                providerIntParam(params, "height", 0),
			AspectRatio:           providerStringParam(params, "aspect_ratio", "16:9"),
			Quality:               providerStringParam(params, "quality", ""),
			Size:                  providerStringParam(params, "size", ""),
			ResolutionName:        providerStringParam(params, "resolution", ""),
			ServiceTier:           providerStringParam(params, "service_tier", ""),
			ExecutionExpiresAfter: providerIntParam(params, "execution_expires_after", 0),
			Priority:              providerIntParam(params, "priority", 0),
			AudioType:             providerStringParam(params, "audio_type", ""),
			MovementAmplitude:     providerStringParam(params, "movement_amplitude", ""),
			Payload:               providerStringParam(params, "payload", ""),
		}
		vreq.Seed = providerInt64PtrParam(params, "seed")
		if req.AdapterType == AdapterNewAPI {
			vreq.Payload = newAPIDebugPayloadFromParams(vreq.Payload, params)
		}
		vreq.CameraFixed = providerBoolPtrParam(params, "camera_fixed")
		vreq.Watermark = providerBoolPtrParam(params, "watermark")
		vreq.GenerateAudio = providerBoolPtrParam(params, "generate_audio")
		vreq.ReturnLastFrame = providerBoolPtrParam(params, "return_last_frame")
		vreq.Workspace = providerBoolPtrParam(params, "workspace")
		vreq.OffPeak = providerBoolPtrParam(params, "off_peak")
		vreq.WebSearch = providerBoolParam(params, "web_search", false)
		resp, callErr := adapter.VideoGenerate(debugCtx, vreq)
		if callErr != nil {
			result := takeDebug(debugCtx)
			if result == nil {
				result = &DebugCallResult{ModelID: model}
			}
			result.Error = sanitizeDebugError(callErr.Error())
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
			Model:           model,
			ProtocolProfile: protocolProfile,
			PromptName:      "provider_debug_text",
			MaxTokens:       providerIntParam(params, "max_tokens", DefaultTextMaxTokens),
			Messages:        []Message{{Role: "user", Content: prompt}},
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
			result.Error = sanitizeDebugError(callErr.Error())
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

	case AdapterNewAPI:
		base := strings.TrimRight(baseURL, "/")
		if base == "" {
			return nil, fmt.Errorf("base_url is required for new_api adapter")
		}
		return NewNewAPIAdapter(apiKey, base), nil

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

	case AdapterDashScope:
		return NewDashScopeAdapter(apiKey, baseURL), nil

	case AdapterVyroSeedance:
		return NewVyroSeedanceAdapter(apiKey, baseURL), nil

	case AdapterVidu:
		return NewViduAdapter(apiKey, baseURL), nil

	case AdapterElevenLabs:
		return NewElevenLabsAdapter(apiKey, baseURL), nil

	case AdapterMiniMax:
		return NewMiniMaxAdapter(apiKey, baseURL), nil

	case AdapterXiaomiMimo:
		return NewXiaomiMimoAdapter(apiKey, baseURL), nil

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

func providerStringSliceParam(params map[string]any, key string, def []string) []string {
	v, ok := params[key]
	if !ok {
		return def
	}
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		if len(out) > 0 {
			return out
		}
	case string:
		if strings.TrimSpace(t) == "" {
			return def
		}
		var list []string
		if err := json.Unmarshal([]byte(t), &list); err == nil && len(list) > 0 {
			return list
		}
		return []string{t}
	}
	return def
}

func providerStringMapParam(params map[string]any, key string) map[string]string {
	v, ok := params[key]
	if !ok {
		return nil
	}
	out := map[string]string{}
	switch t := v.(type) {
	case map[string]string:
		for key, value := range t {
			if strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
				out[key] = value
			}
		}
	case map[string]any:
		for key, value := range t {
			if s, ok := value.(string); ok && strings.TrimSpace(key) != "" && strings.TrimSpace(s) != "" {
				out[key] = s
			}
		}
	case string:
		if strings.TrimSpace(t) == "" {
			return nil
		}
		var parsed map[string]string
		if err := json.Unmarshal([]byte(t), &parsed); err == nil {
			for key, value := range parsed {
				if strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
					out[key] = value
				}
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func providerRerankDocumentsParam(params map[string]any) []RerankDocument {
	v, ok := params["documents"]
	if !ok {
		return []RerankDocument{{Text: "first document"}, {Text: "second document"}}
	}
	switch t := v.(type) {
	case []string:
		out := make([]RerankDocument, 0, len(t))
		for _, text := range t {
			out = append(out, RerankDocument{Text: text})
		}
		return out
	case []any:
		return rerankDocumentsFromAnySlice(t)
	case string:
		var list []any
		if err := json.Unmarshal([]byte(t), &list); err == nil {
			return rerankDocumentsFromAnySlice(list)
		}
		if strings.TrimSpace(t) != "" {
			return []RerankDocument{{Text: t}}
		}
	}
	return []RerankDocument{{Text: "first document"}, {Text: "second document"}}
}

func rerankDocumentsFromAnySlice(items []any) []RerankDocument {
	out := make([]RerankDocument, 0, len(items))
	for _, item := range items {
		switch v := item.(type) {
		case string:
			out = append(out, RerankDocument{Text: v})
		case map[string]any:
			out = append(out, RerankDocument{Data: v})
		}
	}
	if len(out) == 0 {
		return []RerankDocument{{Text: "first document"}, {Text: "second document"}}
	}
	return out
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

func newAPIDebugPayloadFromParams(existing string, params map[string]any) string {
	payload := map[string]any{}
	if strings.TrimSpace(existing) != "" {
		_ = json.Unmarshal([]byte(existing), &payload)
	}
	if payload == nil {
		payload = map[string]any{}
	}
	for _, key := range []string{"fps", "n", "response_format", "user", "metadata"} {
		value, ok := params[key]
		if !ok || isEmptyDebugParam(value) {
			continue
		}
		payload[key] = normalizeProviderJSONParam(value)
	}
	if len(payload) == 0 {
		return ""
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return existing
	}
	return string(raw)
}

func normalizeProviderJSONParam(value any) any {
	s, ok := value.(string)
	if !ok {
		return value
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var parsed any
	if err := json.Unmarshal([]byte(s), &parsed); err == nil {
		return parsed
	}
	return s
}

func isEmptyDebugParam(value any) bool {
	s, ok := value.(string)
	return ok && strings.TrimSpace(s) == ""
}
