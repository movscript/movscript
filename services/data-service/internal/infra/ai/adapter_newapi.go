package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
)

// NewAPIAdapter treats New API as a first-class relay gateway. Most OpenAI-
// compatible endpoints are delegated to OpenAIAdapter; video uses New API's
// documented Sora multipart fields instead of MovScript's OpenAI video adapter.
type NewAPIAdapter struct {
	openai  *OpenAIAdapter
	BaseURL string
	APIKey  string
	rawHTTP *http.Client
}

func NewNewAPIAdapter(apiKey, baseURL string) *NewAPIAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	a := &NewAPIAdapter{
		BaseURL: baseURL,
		APIKey:  apiKey,
		rawHTTP: &http.Client{},
	}
	if baseURL != "" {
		a.openai = NewOpenAIAdapter(baseURL, apiKey)
		a.rawHTTP = a.openai.rawHTTP
	}
	return a
}

func (a *NewAPIAdapter) compat() (*OpenAIAdapter, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return nil, fmt.Errorf("new_api base_url is required")
	}
	if a.openai == nil {
		a.openai = NewOpenAIAdapter(a.BaseURL, a.APIKey)
	}
	if a.rawHTTP == nil {
		a.rawHTTP = &http.Client{}
	}
	a.openai.BaseURL = strings.TrimRight(a.BaseURL, "/")
	a.openai.APIKey = a.APIKey
	a.openai.rawHTTP = a.rawHTTP
	return a.openai, nil
}

func (a *NewAPIAdapter) claudeMessages() (*AnthropicAdapter, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return nil, fmt.Errorf("new_api base_url is required")
	}
	return NewAnthropicAdapter(a.APIKey, a.BaseURL), nil
}

func (a *NewAPIAdapter) ProxyTarget(context.Context) (string, string, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return "", "", fmt.Errorf("new_api base_url is required")
	}
	return strings.TrimRight(a.BaseURL, "/"), a.APIKey, nil
}

func (a *NewAPIAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyTextGeneration, "chat"); err != nil {
		return TextResponse{}, err
	}
	switch ResolveNewAPIProtocolProfile(CapabilityFamilyTextGeneration, req.ProtocolProfile) {
	case NewAPIProfileClaudeMessages:
		claude, err := a.claudeMessages()
		if err != nil {
			return TextResponse{}, err
		}
		return claude.TextGenerate(ctx, req)
	case NewAPIProfileGeminiGenerateContent:
		return a.geminiGenerateContent(ctx, req)
	}
	compat, err := a.compat()
	if err != nil {
		return TextResponse{}, err
	}
	return compat.TextGenerate(ctx, req)
}

func (a *NewAPIAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyTextGeneration, "chat"); err != nil {
		return nil, err
	}
	switch ResolveNewAPIProtocolProfile(CapabilityFamilyTextGeneration, req.ProtocolProfile) {
	case NewAPIProfileClaudeMessages:
		claude, err := a.claudeMessages()
		if err != nil {
			return nil, err
		}
		return claude.TextStream(ctx, req)
	case NewAPIProfileGeminiGenerateContent:
		return a.geminiGenerateContentStream(ctx, req)
	}
	compat, err := a.compat()
	if err != nil {
		return nil, err
	}
	return compat.TextStream(ctx, req)
}

func (a *NewAPIAdapter) ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.Text.ProtocolProfile, CapabilityFamilyTextGeneration, "responses"); err != nil {
		return TextResponse{}, err
	}
	compat, err := a.compat()
	if err != nil {
		return TextResponse{}, err
	}
	return compat.ResponsesGenerate(ctx, req)
}

func (a *NewAPIAdapter) ResponsesStream(ctx context.Context, req ResponsesRequest) (<-chan ResponsesStreamEvent, error) {
	if err := validateNewAPIRequestProfileOperation(req.Text.ProtocolProfile, CapabilityFamilyTextGeneration, "responses"); err != nil {
		return nil, err
	}
	compat, err := a.compat()
	if err != nil {
		return nil, err
	}
	return compat.ResponsesStream(ctx, req)
}

func (a *NewAPIAdapter) geminiGenerateContent(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	if strings.TrimSpace(a.BaseURL) == "" {
		return TextResponse{}, fmt.Errorf("new_api base_url is required")
	}
	body, debugBody, err := newAPIGeminiGenerateContentBody(req)
	if err != nil {
		return TextResponse{}, err
	}
	var raw newAPIGeminiGenerateContentResponse
	endpoint := newAPIGeminiGenerateContentURL(a.BaseURL, req.Model, "generateContent")
	if err := a.postJSONAbsoluteWithDebugBody(ctx, endpoint, req.Model, body, debugBody, &raw); err != nil {
		return TextResponse{}, err
	}
	resp, err := newAPIGeminiTextResponse(raw)
	if err != nil {
		return TextResponse{}, err
	}
	resp.Debug = takeDebug(ctx)
	return resp, nil
}

func (a *NewAPIAdapter) geminiGenerateContentStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	attachTextPromptDebug(ctx, req)
	if strings.TrimSpace(a.BaseURL) == "" {
		return nil, fmt.Errorf("new_api base_url is required")
	}
	if a.rawHTTP == nil {
		a.rawHTTP = &http.Client{}
	}
	body, debugBody, err := newAPIGeminiGenerateContentBody(req)
	if err != nil {
		return nil, err
	}
	endpoint := newAPIGeminiGenerateContentURL(a.BaseURL, req.Model, "streamGenerateContent") + "?alt=sse"
	reqBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Accept":        "text/event-stream",
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(debugBody), LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		err := fmt.Errorf("new_api gemini stream HTTP %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(respBody))
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(debugBody), ResponseStatus: resp.StatusCode,
			ResponseBody: string(respBody), LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		sentDone := false
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") || !strings.HasPrefix(line, "data:") {
				continue
			}
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				out <- TextStreamEvent{Done: true}
				sentDone = true
				return
			}
			var chunk newAPIGeminiGenerateContentResponse
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}
			event := newAPIGeminiTextStreamEvent(chunk)
			if event.ContentDelta != "" || event.FinishReason != "" || event.Usage.InputTokens > 0 ||
				event.Usage.OutputTokens > 0 || event.Usage.ReasoningTokens > 0 {
				out <- event
			}
		}
		if err := scanner.Err(); err != nil {
			out <- TextStreamEvent{Error: fmt.Sprintf("new_api gemini stream receive: %v", err)}
			return
		}
		if !sentDone {
			out <- TextStreamEvent{Done: true}
		}
	}()
	return out, nil
}

func (a *NewAPIAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyImageGeneration, req.Operation); err != nil {
		return ImageResponse{}, err
	}
	switch ResolveNewAPIProtocolProfile(CapabilityFamilyImageGeneration, req.ProtocolProfile) {
	case NewAPIProfileGeminiImages:
		return a.geminiImageGenerate(ctx, req)
	case NewAPIProfileQwenImages:
		return a.qwenImageGenerate(ctx, req)
	}
	compat, err := a.compat()
	if err != nil {
		return ImageResponse{}, err
	}
	return compat.ImageGenerate(ctx, req)
}

func (a *NewAPIAdapter) geminiImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return ImageResponse{}, fmt.Errorf("new_api base_url is required")
	}
	body, debugBody, err := newAPIGeminiImageGenerateContentBody(req)
	if err != nil {
		return ImageResponse{}, err
	}
	var raw newAPIGeminiGenerateContentResponse
	endpoint := newAPIGeminiGenerateContentURL(a.BaseURL, req.Model, "generateContent")
	if err := a.postJSONAbsoluteWithDebugBody(ctx, endpoint, req.Model, body, debugBody, &raw); err != nil {
		return ImageResponse{}, err
	}
	urls, textHint := newAPIGeminiImageURLs(raw)
	if len(urls) == 0 {
		if textHint != "" {
			return ImageResponse{}, fmt.Errorf("new_api gemini image returned no image output; text output: %.200s", textHint)
		}
		return ImageResponse{}, fmt.Errorf("new_api gemini image returned no image output")
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func (a *NewAPIAdapter) qwenImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	path := newAPIQwenImageEndpointPath(req)
	body, err := newAPIQwenImageBody(req)
	if err != nil {
		return ImageResponse{}, err
	}
	var raw struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		OutputFormat string `json:"output_format"`
	}
	if err := a.postJSON(ctx, path, req.Model, body, &raw); err != nil {
		return ImageResponse{}, err
	}
	outputFormat := firstNonEmptyAI(raw.OutputFormat, newAPIQwenImageOutputFormatHint(req))
	urls := make([]string, 0, len(raw.Data))
	for _, item := range raw.Data {
		if result := openAIImageResult(item.URL, item.B64JSON, outputFormat); result != "" {
			urls = append(urls, result)
		}
	}
	if len(urls) == 0 {
		return ImageResponse{}, fmt.Errorf("new_api qwen image response did not include image output")
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func newAPIQwenImageEndpointPath(req ImageRequest) string {
	switch strings.TrimSpace(req.Operation) {
	case ImageOperationReferenceToImage, ImageOperationEditImage:
		return "/images/edits"
	}
	if newAPIQwenImageHasInput(req) || req.EditOnly {
		return "/images/edits"
	}
	return "/images/generations"
}

func newAPIQwenImageBody(req ImageRequest) (map[string]any, error) {
	model := strings.TrimSpace(req.Model)
	if model == "" {
		return nil, fmt.Errorf("new_api qwen image model is required")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return nil, fmt.Errorf("new_api qwen image prompt is required")
	}
	content := newAPIQwenImageContent(req, prompt)
	body := map[string]any{
		"model":  model,
		"prompt": prompt,
		"input": map[string]any{
			"messages": []map[string]any{{
				"role":    "user",
				"content": content,
			}},
		},
	}
	if params := newAPIQwenImageParameters(req); len(params) > 0 {
		body["parameters"] = params
	}
	if responseFormat := newAPIQwenImageResponseFormat(req); responseFormat != "" {
		body["response_format"] = responseFormat
	}
	if outputFormat := newAPIQwenImageTopLevelOutputFormat(req); outputFormat != "" {
		body["output_format"] = outputFormat
	}
	return body, nil
}

func newAPIQwenImageContent(req ImageRequest, prompt string) []map[string]any {
	content := make([]map[string]any, 0, len(req.InputImageDataList)+2)
	addImage := func(value string) {
		if value = strings.TrimSpace(value); value != "" {
			content = append(content, map[string]any{"image": value})
		}
	}
	addImage(req.InputImage)
	if len(req.InputImageBytes) > 0 {
		mimeType := firstNonEmptyAI(strings.TrimSpace(req.InputImageMime), "image/png")
		addImage("data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(req.InputImageBytes))
	}
	for _, mediaData := range req.InputImageDataList {
		if value := strings.TrimSpace(mediaData.PresignedURL); value != "" {
			addImage(value)
			continue
		}
		if len(mediaData.Bytes) > 0 {
			mimeType := firstNonEmptyAI(strings.TrimSpace(mediaData.MimeType), "image/png")
			addImage("data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(mediaData.Bytes))
		}
	}
	addImage(req.CloudFileID)
	content = append(content, map[string]any{"text": prompt})
	return content
}

func newAPIQwenImageHasInput(req ImageRequest) bool {
	return strings.TrimSpace(req.InputImage) != "" ||
		len(req.InputImageBytes) > 0 ||
		len(req.InputImageDataList) > 0 ||
		strings.TrimSpace(req.CloudFileID) != ""
}

func newAPIQwenImageParameters(req ImageRequest) map[string]any {
	params := map[string]any{}
	if size := newAPIQwenImageSize(req); size != "" {
		params["size"] = size
	}
	if n := newAPIQwenImageCount(req); n > 0 {
		params["n"] = n
	}
	if req.Seed != nil {
		params["seed"] = *req.Seed
	}
	if req.Watermark != nil {
		params["watermark"] = *req.Watermark
	}
	if promptExtend, ok := dashScopePromptExtend(req.OptimizePromptMode); ok {
		params["prompt_extend"] = promptExtend
	}
	copyNewAPIQwenImageExtraParams(params, req.ExtraParams)
	return params
}

func newAPIQwenImageSize(req ImageRequest) string {
	if size := strings.TrimSpace(req.Size); size != "" {
		return strings.ReplaceAll(size, "x", "*")
	}
	if size := stringValueTrim(req.ExtraParams["image_size"]); size != "" {
		return strings.ReplaceAll(size, "x", "*")
	}
	return dashScopeImageSize(req, req.Model)
}

func newAPIQwenImageCount(req ImageRequest) int {
	for _, key := range []string{"n", "image_count"} {
		if n, ok := intValue(req.ExtraParams[key]); ok && n > 0 {
			return n
		}
	}
	if req.N > 0 {
		return req.N
	}
	return 0
}

func newAPIQwenImageResponseFormat(req ImageRequest) string {
	if responseFormat := stringValueTrim(req.ExtraParams["response_format"]); responseFormat != "" {
		return responseFormat
	}
	format := strings.ToLower(strings.TrimSpace(req.OutputFormat))
	if format == "url" || format == "b64_json" {
		return format
	}
	return ""
}

func newAPIQwenImageTopLevelOutputFormat(req ImageRequest) string {
	format := strings.ToLower(strings.TrimSpace(req.OutputFormat))
	switch format {
	case "", "url", "b64_json":
		return ""
	default:
		return format
	}
}

func newAPIQwenImageOutputFormatHint(req ImageRequest) string {
	format := strings.ToLower(strings.TrimSpace(req.OutputFormat))
	switch format {
	case "jpeg", "jpg", "png", "webp":
		return format
	default:
		return ""
	}
}

func copyNewAPIQwenImageExtraParams(params map[string]any, extra map[string]any) {
	for key, value := range extra {
		key = strings.TrimSpace(key)
		if isNewAPIReservedExtraParamKey(key) || isNewAPIQwenImageBodyParamKey(key) {
			continue
		}
		if _, exists := params[key]; exists {
			continue
		}
		params[key] = value
	}
}

func isNewAPIQwenImageBodyParamKey(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "prompt", "input", "parameters", "response_format", "output_format", "image", "images":
		return true
	default:
		return false
	}
}

func (a *NewAPIAdapter) CreateEmbeddings(ctx context.Context, req EmbeddingRequest) (EmbeddingResponse, error) {
	if err := validateNewAPIRequestProfile(req.ProtocolProfile, CapabilityFamilyEmbedding); err != nil {
		return EmbeddingResponse{}, err
	}
	path := newAPIEmbeddingEndpointPath(req.Model, req.ProtocolProfile)
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
	var raw struct {
		Model string `json:"model"`
		Data  []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
		Usage newAPITokenUsage `json:"usage"`
	}
	if err := a.postJSON(ctx, path, req.Model, body, &raw); err != nil {
		return EmbeddingResponse{}, err
	}
	data := make([]EmbeddingVector, 0, len(raw.Data))
	for _, item := range raw.Data {
		data = append(data, EmbeddingVector{Index: item.Index, Embedding: item.Embedding})
	}
	return EmbeddingResponse{Model: raw.Model, Data: data, Usage: raw.Usage.tokenUsage(), Debug: takeDebug(ctx)}, nil
}

func (a *NewAPIAdapter) Rerank(ctx context.Context, req RerankRequest) (RerankResponse, error) {
	if err := validateNewAPIRequestProfile(req.ProtocolProfile, CapabilityFamilyRerank); err != nil {
		return RerankResponse{}, err
	}
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
	var raw struct {
		ID      string         `json:"id"`
		Results []RerankResult `json:"results"`
		Meta    map[string]any `json:"meta"`
	}
	if err := a.postJSON(ctx, "/rerank", req.Model, body, &raw); err != nil {
		return RerankResponse{}, err
	}
	return RerankResponse{ID: raw.ID, Results: raw.Results, Meta: raw.Meta, Debug: takeDebug(ctx)}, nil
}

func (a *NewAPIAdapter) Moderate(ctx context.Context, req ModerationRequest) (ModerationResponse, error) {
	if err := validateNewAPIRequestProfile(req.ProtocolProfile, CapabilityFamilyModeration); err != nil {
		return ModerationResponse{}, err
	}
	body := map[string]any{
		"input": newAPIEmbeddingInputPayload(req.Inputs),
	}
	if req.Model != "" {
		body["model"] = req.Model
	}
	copyNewAPIExtraParams(body, req.ExtraParams)
	var raw struct {
		ID      string             `json:"id"`
		Model   string             `json:"model"`
		Results []ModerationResult `json:"results"`
	}
	if err := a.postJSON(ctx, "/moderations", req.Model, body, &raw); err != nil {
		return ModerationResponse{}, err
	}
	return ModerationResponse{ID: raw.ID, Model: raw.Model, Results: raw.Results, Debug: takeDebug(ctx)}, nil
}

func (a *NewAPIAdapter) ConnectRealtime(ctx context.Context, req RealtimeSessionRequest) (RealtimeSession, error) {
	if err := validateNewAPIRequestProfile(req.ProtocolProfile, CapabilityFamilyRealtime); err != nil {
		return nil, err
	}
	if _, err := a.compat(); err != nil {
		return nil, err
	}
	endpoint, err := newAPIRealtimeURL(a.BaseURL, req)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+a.APIKey)
	for key, value := range req.Headers {
		if isNewAPIRealtimeReservedHeader(key) {
			continue
		}
		if strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
			headers.Set(key, value)
		}
	}
	debugHeaders := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	for key, values := range headers {
		if strings.EqualFold(key, "Authorization") || len(values) == 0 {
			continue
		}
		debugHeaders[key] = values[0]
	}
	start := time.Now()
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, endpoint, headers)
	latency := time.Since(start).Milliseconds()
	statusCode := 0
	if resp != nil {
		statusCode = resp.StatusCode
	}
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodGet,
			RequestHeaders: debugHeaders, ResponseStatus: statusCode, LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	recordDebug(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodGet,
		RequestHeaders: debugHeaders, ResponseStatus: statusCode, LatencyMs: latency,
	})
	return &websocketRealtimeSession{conn: conn}, nil
}

func (a *NewAPIAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyAudioGeneration, AudioOperationTextToSpeech); err != nil {
		return media.TTSResponse{}, err
	}
	if ResolveNewAPIProtocolProfile(CapabilityFamilyAudioGeneration, req.ProtocolProfile) == NewAPIProfileGeminiAudio {
		return a.geminiAudioSynthesize(ctx, req)
	}
	compat, err := a.compat()
	if err != nil {
		return media.TTSResponse{}, err
	}
	return compat.Synthesize(ctx, req)
}

func (a *NewAPIAdapter) GenerateSpeechToSpeech(ctx context.Context, req media.SpeechToSpeechRequest) (media.SpeechToSpeechResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyAudioGeneration, AudioOperationSpeechToSpeech); err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	compat, err := a.compat()
	if err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	return compat.GenerateSpeechToSpeech(ctx, req)
}

func (a *NewAPIAdapter) Transcribe(ctx context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyAudioGeneration, AudioOperationSpeechToText); err != nil {
		return media.SubtitleResponse{}, err
	}
	compat, err := a.compat()
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	return compat.Transcribe(ctx, req)
}

func (a *NewAPIAdapter) TranslateSpeech(ctx context.Context, req media.SpeechTranslateRequest) (media.SubtitleResponse, error) {
	if err := validateNewAPIRequestProfileOperation(req.ProtocolProfile, CapabilityFamilyAudioGeneration, AudioOperationSpeechTranslate); err != nil {
		return media.SubtitleResponse{}, err
	}
	compat, err := a.compat()
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	return compat.TranslateSpeech(ctx, req)
}

func (a *NewAPIAdapter) geminiAudioSynthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return media.TTSResponse{}, fmt.Errorf("new_api base_url is required")
	}
	body, debugBody, err := newAPIGeminiAudioGenerateContentBody(req)
	if err != nil {
		return media.TTSResponse{}, err
	}
	var raw newAPIGeminiGenerateContentResponse
	model := firstNonEmptyAI(strings.TrimSpace(req.Model), "gemini-2.5-flash-preview-tts")
	endpoint := newAPIGeminiGenerateContentURL(a.BaseURL, model, "generateContent")
	if err := a.postJSONAbsoluteWithDebugBody(ctx, endpoint, model, body, debugBody, &raw); err != nil {
		return media.TTSResponse{}, err
	}
	audioB64, mimeType := newAPIGeminiAudioOutput(raw)
	if audioB64 == "" {
		return media.TTSResponse{}, fmt.Errorf("new_api gemini audio returned no audio output")
	}
	audio, err := base64.StdEncoding.DecodeString(audioB64)
	if err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode new_api gemini audio: %w", err)
	}
	if len(audio) == 0 {
		return media.TTSResponse{}, fmt.Errorf("new_api gemini audio returned empty audio")
	}
	rawMimeType := firstNonEmptyAI(strings.TrimSpace(mimeType), "audio/wav")
	mimeType = firstNonEmptyAI(stripContentTypeParams(rawMimeType), "audio/wav")
	if newAPIGeminiAudioNeedsWAVWrap(rawMimeType) {
		sampleRate := intParamOrDefault(req.Params, "sample_rate", newAPIGeminiAudioSampleRate(rawMimeType, 24000))
		channels := intParamOrDefault(req.Params, "channels", 1)
		audio = pcmToWAV(audio, sampleRate, channels, 16)
		mimeType = "audio/wav"
	}
	return media.TTSResponse{Audio: audio, MimeType: mimeType}, nil
}

func (a *NewAPIAdapter) Align(ctx context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	if err := validateNewAPIRequestProfile(req.ProtocolProfile, CapabilityFamilyAudioGeneration); err != nil {
		return media.SubtitleResponse{}, err
	}
	compat, err := a.compat()
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	return compat.Align(ctx, req)
}

func (a *NewAPIAdapter) Ping(ctx context.Context) error {
	_, err := a.FetchModels(ctx)
	return err
}

func (a *NewAPIAdapter) FetchModels(ctx context.Context) ([]string, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return nil, fmt.Errorf("new_api base_url is required")
	}
	client := a.rawHTTP
	if client == nil {
		client = &http.Client{}
	}
	endpoint := strings.TrimRight(a.BaseURL, "/") + "/models"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, Endpoint: endpoint, Method: http.MethodGet,
			RequestHeaders: headers, LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, Endpoint: endpoint, Method: http.MethodGet,
		RequestHeaders: headers, ResponseStatus: resp.StatusCode, ResponseBody: string(body), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("new_api models API error %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(body))
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := jsonUnmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode new_api models response: %w", err)
	}
	ids := make([]string, 0, len(parsed.Data))
	for _, model := range parsed.Data {
		if id := strings.TrimSpace(model.ID); id != "" {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func (a *NewAPIAdapter) postJSON(ctx context.Context, path, model string, requestBody map[string]any, out any) error {
	return a.postJSONWithDebugBody(ctx, path, model, requestBody, requestBody, out)
}

func (a *NewAPIAdapter) postJSONWithDebugBody(ctx context.Context, path, model string, requestBody map[string]any, debugBody map[string]any, out any) error {
	endpoint := strings.TrimRight(a.BaseURL, "/") + path
	return a.postJSONEndpointWithDebugBody(ctx, endpoint, strings.TrimPrefix(path, "/"), model, requestBody, debugBody, out)
}

func (a *NewAPIAdapter) postJSONAbsoluteWithDebugBody(ctx context.Context, endpoint, model string, requestBody map[string]any, debugBody map[string]any, out any) error {
	label := strings.TrimPrefix(endpoint, strings.TrimRight(a.BaseURL, "/")+"/")
	if parsed, err := url.Parse(endpoint); err == nil && parsed.Path != "" {
		label = strings.TrimPrefix(parsed.Path, "/")
	}
	return a.postJSONEndpointWithDebugBody(ctx, endpoint, label, model, requestBody, debugBody, out)
}

func (a *NewAPIAdapter) postJSONEndpointWithDebugBody(ctx context.Context, endpoint, label, model string, requestBody map[string]any, debugBody map[string]any, out any) error {
	if _, err := a.compat(); err != nil {
		return err
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(debugBody), LatencyMs: latency, Error: err.Error(),
		})
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: headers, RequestBody: mustJSON(debugBody),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return fmt.Errorf("new_api %s API error %d: %s", label, resp.StatusCode, sanitizeNewAPIErrorBody(respBody))
	}
	if out == nil {
		return nil
	}
	if err := jsonUnmarshal(respBody, out); err != nil {
		return fmt.Errorf("decode new_api %s response (got: %.120s): %w", label, sanitizeNewAPIErrorBody(respBody), err)
	}
	return nil
}

func (a *NewAPIAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 || startResp.TaskID == "" {
		return startResp, nil
	}
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{}, ctx.Err()
		case <-time.After(5 * time.Second):
		}
		pollResp, err := a.VideoPoll(ctx, VideoPollRequest{
			Model:           req.Model,
			ProtocolProfile: req.ProtocolProfile,
			TaskID:          startResp.TaskID,
			TaskKind:        startResp.TaskKind,
		})
		if err != nil {
			return pollResp, err
		}
		if pollResp.Status == VideoStatusSucceeded {
			return pollResp, nil
		}
		if pollResp.Status == VideoStatusFailed {
			msg := pollResp.Message
			if msg == "" {
				msg = "video generation failed"
			}
			return pollResp, fmt.Errorf("video task %s failed: %s", startResp.TaskID, msg)
		}
	}
	return VideoResponse{}, fmt.Errorf("video generation timed out (task %s)", startResp.TaskID)
}

func (a *NewAPIAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	profile, err := newAPIVideoProtocolProfile(req.ProtocolProfile, "")
	if err != nil {
		return VideoResponse{}, err
	}
	if !NewAPIProtocolProfileSupportsOperation(profile, CapabilityFamilyVideoGeneration, req.Operation) {
		return VideoResponse{}, fmt.Errorf("new_api protocol_profile %q does not support operation %q", profile, strings.TrimSpace(req.Operation))
	}
	switch profile {
	case NewAPIProfileVideoGenerations:
		return a.videoStartGenerationsJSON(ctx, req)
	case NewAPIProfileSoraVideoMultipart:
		return a.videoStartSoraMultipart(ctx, req)
	case NewAPIProfileKlingVideo:
		return a.videoStartKlingJSON(ctx, req)
	case NewAPIProfileJimengAction:
		return a.videoStartJimengActionJSON(ctx, req)
	default:
		return VideoResponse{}, fmt.Errorf("new_api video protocol_profile %q is not supported", profile)
	}
}

func (a *NewAPIAdapter) videoStartGenerationsJSON(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	duration := req.Duration
	if duration <= 0 {
		duration = 6
	}
	body, debugBody, err := newAPIVideoGenerationsJSONBody(req, duration)
	if err != nil {
		return VideoResponse{}, err
	}
	var raw map[string]any
	if err := a.postJSONWithDebugBody(ctx, "/video/generations", req.Model, body, debugBody, &raw); err != nil {
		return VideoResponse{}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, "", duration, "new_api_video_generations", newAPIVideoGenerationsContentPath)
}

func (a *NewAPIAdapter) videoStartKlingJSON(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	duration := req.Duration
	if duration <= 0 {
		duration = 6
	}
	body, debugBody, err := newAPIVideoGenerationsJSONBody(req, duration)
	if err != nil {
		return VideoResponse{}, err
	}
	image, imageSource := newAPIVideoImage(req)
	if image == "" {
		if payloadImage := stringValueTrim(body["image"]); payloadImage != "" {
			image = payloadImage
			imageSource = "payload.image"
		}
	}
	if aspectRatio := strings.TrimSpace(req.AspectRatio); aspectRatio != "" {
		if _, exists := body["aspect_ratio"]; !exists {
			body["aspect_ratio"] = aspectRatio
			debugBody["aspect_ratio"] = aspectRatio
		}
	}
	taskKind := "new_api_kling_text2video"
	path := "/kling/v1/videos/text2video"
	if image != "" || strings.EqualFold(strings.TrimSpace(req.Operation), VideoOperationImageToVideo) {
		path = "/kling/v1/videos/image2video"
		taskKind = "new_api_kling_image2video"
		if image == "" {
			return VideoResponse{}, fmt.Errorf("new_api kling image2video requires image input")
		}
		if strings.HasPrefix(image, "base64:") {
			body["image_base64"] = strings.TrimPrefix(image, "base64:")
			delete(body, "image")
			debugBody["image_base64"] = imageSource
			delete(debugBody, "image")
		} else {
			body["image"] = image
			debugBody["image"] = imageSource
		}
	}
	var raw map[string]any
	if err := a.postJSONAbsoluteWithDebugBody(ctx, newAPIGatewayRootURL(a.BaseURL)+path, req.Model, body, debugBody, &raw); err != nil {
		return VideoResponse{}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, "", duration, taskKind, nil)
}

func (a *NewAPIAdapter) videoStartJimengActionJSON(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	body, debugBody, duration, err := newAPIJimengActionJSONBody(req)
	if err != nil {
		return VideoResponse{}, err
	}
	var raw map[string]any
	endpoint := newAPIJimengActionURL(a.BaseURL, "CVSync2AsyncSubmitTask")
	if err := a.postJSONAbsoluteWithDebugBody(ctx, endpoint, req.Model, body, debugBody, &raw); err != nil {
		return VideoResponse{}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, "", duration, "new_api_jimeng_action", nil)
}

func (a *NewAPIAdapter) videoStartSoraMultipart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	writeMultipartField(w, "model", req.Model)
	writeMultipartField(w, "prompt", req.Prompt)
	duration := req.Duration
	if duration <= 0 {
		duration = 6
	}
	writeMultipartField(w, "duration", strconv.Itoa(duration))
	width, height := newAPIVideoDimensions(req)
	if width > 0 {
		writeMultipartField(w, "width", strconv.Itoa(width))
	}
	if height > 0 {
		writeMultipartField(w, "height", strconv.Itoa(height))
	}
	payload := newAPIVideoPayload(req)
	for _, key := range []string{"fps", "n"} {
		if n, ok := intValue(payload[key]); ok && n > 0 {
			writeMultipartField(w, key, strconv.Itoa(n))
		}
	}
	if req.Seed != nil {
		writeMultipartField(w, "seed", strconv.FormatInt(*req.Seed, 10))
	} else if n, ok := int64Value(payload["seed"]); ok {
		writeMultipartField(w, "seed", strconv.FormatInt(n, 10))
	}
	if responseFormat := stringValueTrim(payload["response_format"]); responseFormat != "" {
		writeMultipartField(w, "response_format", responseFormat)
	}
	if user := stringValueTrim(payload["user"]); user != "" {
		if err := validateNewAPIVideoUser(user); err != nil {
			return VideoResponse{}, err
		}
		writeMultipartField(w, "user", user)
	}
	if metadata, ok := payload["metadata"]; ok {
		metadata, err := validateNewAPIVideoMetadata(metadata)
		if err != nil {
			return VideoResponse{}, err
		}
		payload["metadata"] = metadata
		raw, err := json.Marshal(metadata)
		if err != nil {
			return VideoResponse{}, fmt.Errorf("new_api video metadata must be JSON-serializable: %w", err)
		}
		writeMultipartField(w, "metadata", string(raw))
	}
	image, imageSource := newAPIVideoImage(req)
	if image != "" {
		writeMultipartField(w, "image", image)
	}
	if err := w.Close(); err != nil {
		return VideoResponse{}, err
	}

	debugBody := map[string]any{
		"model":    req.Model,
		"prompt":   req.Prompt,
		"duration": duration,
	}
	if width > 0 {
		debugBody["width"] = width
	}
	if height > 0 {
		debugBody["height"] = height
	}
	for _, key := range []string{"fps", "seed", "n", "response_format", "user", "metadata"} {
		if value, ok := payload[key]; ok {
			debugBody[key] = value
		}
	}
	if req.Seed != nil {
		debugBody["seed"] = *req.Seed
	}
	if image != "" {
		debugBody["image"] = imageSource
	}
	attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("image"))

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/videos"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Content-Type", w.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{
		"Content-Type":  w.FormDataContentType(),
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(debugBody), LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: headers, RequestBody: mustJSON(debugBody),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return VideoResponse{}, fmt.Errorf("new_api video start API error %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(respBody))
	}
	var raw map[string]any
	if err := jsonUnmarshal(respBody, &raw); err != nil {
		return VideoResponse{}, fmt.Errorf("unexpected new_api video start response (got: %.120s): %w", sanitizeNewAPIErrorBody(respBody), err)
	}
	taskID := firstNonEmptyAI(
		stringField(raw, "id", "task_id", "request_id"),
		nestedStringField(raw, "data", "id"),
		nestedStringField(raw, "data", "task_id"),
	)
	videoURL := firstNonEmptyAI(
		stringField(raw, "url", "video_url", "output_url", "download_url"),
		nestedStringField(raw, "video", "url"),
		nestedStringField(raw, "data", "url"),
		nestedStringField(raw, "data", "video", "url"),
	)
	status := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status"), nestedStringField(raw, "data", "status")))
	durationSec := intFromAny(raw["seconds"])
	if durationSec <= 0 {
		durationSec = duration
	}
	if videoURL != "" {
		return VideoResponse{TaskID: taskID, TaskKind: "new_api_video", Status: VideoStatusSucceeded, URL: videoURL, DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
	}
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("no video URL or task ID returned by New API")
	}
	if status == VideoStatusSucceeded {
		return a.downloadNewAPIVideoContent(ctx, taskID, "new_api_video", durationSec)
	}
	if status == VideoStatusFailed {
		msg := videoTaskErrorMessage(raw)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: taskID, TaskKind: "new_api_video", Status: VideoStatusFailed, Message: msg, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", taskID, msg)
	}
	return VideoResponse{TaskID: taskID, TaskKind: "new_api_video", Status: firstNonEmptyAI(status, VideoStatusSubmitted), DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
}

func (a *NewAPIAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	profile, err := newAPIVideoProtocolProfile(req.ProtocolProfile, req.TaskKind)
	if err != nil {
		return VideoResponse{}, err
	}
	switch profile {
	case NewAPIProfileVideoGenerations:
		return a.videoPollGenerationsJSON(ctx, req)
	case NewAPIProfileSoraVideoMultipart:
		return a.videoPollSoraMultipart(ctx, req)
	case NewAPIProfileKlingVideo:
		return a.videoPollKlingJSON(ctx, req)
	case NewAPIProfileJimengAction:
		return a.videoPollJimengActionJSON(ctx, req)
	default:
		return VideoResponse{}, fmt.Errorf("new_api video protocol_profile %q is not supported", profile)
	}
}

func (a *NewAPIAdapter) videoPollGenerationsJSON(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("video task id is required")
	}
	pollURL := strings.TrimRight(a.BaseURL, "/") + "/video/generations/" + taskID
	raw, durationSec, err := a.getNewAPIVideoTask(ctx, pollURL, taskID)
	if err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: firstNonEmptyAI(req.TaskKind, "new_api_video_generations")}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, taskID, durationSec, firstNonEmptyAI(req.TaskKind, "new_api_video_generations"), newAPIVideoGenerationsContentPath)
}

func (a *NewAPIAdapter) videoPollKlingJSON(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("video task id is required")
	}
	taskKind := strings.TrimSpace(req.TaskKind)
	pathKind := "text2video"
	if strings.Contains(taskKind, "image2video") {
		pathKind = "image2video"
	}
	if taskKind == "" {
		taskKind = "new_api_kling_" + pathKind
	}
	pollURL := fmt.Sprintf("%s/kling/v1/videos/%s/%s", newAPIGatewayRootURL(a.BaseURL), pathKind, taskID)
	raw, durationSec, err := a.getNewAPIVideoTask(ctx, pollURL, taskID)
	if err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, taskID, durationSec, taskKind, nil)
}

func (a *NewAPIAdapter) videoPollJimengActionJSON(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("video task id is required")
	}
	taskKind := firstNonEmptyAI(req.TaskKind, "new_api_jimeng_action")
	pollURL := strings.TrimRight(a.BaseURL, "/") + "/video/generations/" + taskID
	raw, durationSec, err := a.getNewAPIVideoTask(ctx, pollURL, taskID)
	if err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind}, err
	}
	return a.newAPIVideoResponseFromTaskBody(ctx, raw, taskID, durationSec, taskKind, nil)
}

func (a *NewAPIAdapter) videoPollSoraMultipart(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if _, err := a.compat(); err != nil {
		return VideoResponse{}, err
	}
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("video task id is required")
	}
	pollURL := strings.TrimRight(a.BaseURL, "/") + "/videos/" + taskID
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, pollURL, nil)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: taskID, Endpoint: pollURL, Method: http.MethodGet,
			RequestHeaders: headers, LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, fmt.Errorf("poll new_api video task: %w", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: taskID, Endpoint: pollURL, Method: http.MethodGet,
		RequestHeaders: headers, ResponseStatus: resp.StatusCode, ResponseBody: string(body), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, fmt.Errorf("poll new_api video task API error %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(body))
	}
	var raw map[string]any
	if err := jsonUnmarshal(body, &raw); err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, fmt.Errorf("poll new_api video task: parse response: %w", err)
	}
	status := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status"), nestedStringField(raw, "data", "status")))
	durationSec := intFromAny(raw["seconds"])
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "data", "seconds"))
	}
	videoURL := firstNonEmptyAI(
		stringField(raw, "url", "video_url", "output_url", "download_url"),
		nestedStringField(raw, "video", "url"),
		nestedStringField(raw, "data", "url"),
		nestedStringField(raw, "data", "video", "url"),
	)
	switch status {
	case VideoStatusSucceeded:
		if videoURL != "" {
			return VideoResponse{TaskID: taskID, TaskKind: firstNonEmptyAI(req.TaskKind, "new_api_video"), Status: VideoStatusSucceeded, URL: videoURL, DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
		}
		return a.downloadNewAPIVideoContent(ctx, taskID, firstNonEmptyAI(req.TaskKind, "new_api_video"), durationSec)
	case VideoStatusFailed:
		msg := videoTaskErrorMessage(raw)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: taskID, TaskKind: firstNonEmptyAI(req.TaskKind, "new_api_video"), Status: VideoStatusFailed, Message: msg, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", taskID, msg)
	default:
		return VideoResponse{TaskID: taskID, TaskKind: firstNonEmptyAI(req.TaskKind, "new_api_video"), Status: status, DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
	}
}

func (a *NewAPIAdapter) downloadVideoContent(ctx context.Context, taskID string) (VideoResponse, error) {
	compat, err := a.compat()
	if err != nil {
		return VideoResponse{}, err
	}
	return compat.downloadVideoContent(ctx, taskID)
}

func (a *NewAPIAdapter) getNewAPIVideoTask(ctx context.Context, endpoint, taskID string) (map[string]any, int, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("poll new_api video task: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet,
			RequestHeaders: headers, LatencyMs: latency, Error: err.Error(),
		})
		return nil, 0, fmt.Errorf("poll new_api video task: %w", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet,
		RequestHeaders: headers, ResponseStatus: resp.StatusCode, ResponseBody: string(body), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return nil, 0, fmt.Errorf("poll new_api video task API error %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(body))
	}
	var raw map[string]any
	if err := jsonUnmarshal(body, &raw); err != nil {
		return nil, 0, fmt.Errorf("poll new_api video task: parse response: %w", err)
	}
	durationSec := intFromAny(raw["seconds"])
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "data", "seconds"))
	}
	if durationSec <= 0 {
		durationSec = intFromAny(raw["duration"])
	}
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "metadata", "duration"))
	}
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "data", "metadata", "duration"))
	}
	return raw, durationSec, nil
}

func (a *NewAPIAdapter) newAPIVideoResponseFromTaskBody(ctx context.Context, raw map[string]any, fallbackTaskID string, defaultDuration int, taskKind string, contentPath func(string) string) (VideoResponse, error) {
	taskID := firstNonEmptyAI(
		stringField(raw, "id", "task_id", "request_id"),
		nestedStringField(raw, "data", "id"),
		nestedStringField(raw, "data", "task_id"),
		strings.TrimSpace(fallbackTaskID),
	)
	videoURL := firstNonEmptyAI(
		stringField(raw, "url", "video_url", "output_url", "download_url", "result_url"),
		nestedStringField(raw, "video", "url"),
		nestedStringField(raw, "data", "url"),
		nestedStringField(raw, "data", "video", "url"),
		deepStringField(raw, "url", "video_url", "output_url", "download_url", "result_url"),
	)
	status := normalizeVideoStatus(firstNonEmptyAI(
		stringField(raw, "status", "task_status", "state"),
		nestedStringField(raw, "data", "status"),
		nestedStringField(raw, "data", "task_status"),
		nestedStringField(raw, "data", "state"),
	))
	durationSec := intFromAny(raw["seconds"])
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "data", "seconds"))
	}
	if durationSec <= 0 {
		durationSec = intFromAny(raw["duration"])
	}
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "metadata", "duration"))
	}
	if durationSec <= 0 {
		durationSec = intFromAny(nestedAny(raw, "data", "metadata", "duration"))
	}
	if durationSec <= 0 {
		durationSec = defaultDuration
	}
	taskKind = firstNonEmptyAI(taskKind, "new_api_video")
	if videoURL != "" {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, URL: videoURL, DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
	}
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("no video URL or task ID returned by New API")
	}
	switch status {
	case VideoStatusSucceeded:
		if contentPath != nil {
			return a.downloadNewAPIVideoContentPath(ctx, taskID, taskKind, durationSec, contentPath(taskID))
		}
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s succeeded but no video URL was returned", taskID)
	case VideoStatusFailed:
		msg := videoTaskErrorMessage(raw)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusFailed, Message: msg, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", taskID, msg)
	default:
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: firstNonEmptyAI(status, VideoStatusSubmitted), DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
	}
}

func (a *NewAPIAdapter) downloadNewAPIVideoContent(ctx context.Context, taskID, taskKind string, durationSec int) (VideoResponse, error) {
	content, err := a.downloadVideoContent(ctx, taskID)
	if content.TaskID == "" {
		content.TaskID = taskID
	}
	content.TaskKind = firstNonEmptyAI(content.TaskKind, taskKind, "new_api_video")
	content.Status = VideoStatusSucceeded
	content.DurationSec = durationSec
	return content, err
}

func (a *NewAPIAdapter) downloadNewAPIVideoContentPath(ctx context.Context, taskID, taskKind string, durationSec int, path string) (VideoResponse, error) {
	if strings.TrimSpace(path) == "" {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("new_api video content path is empty")
	}
	endpoint := strings.TrimRight(a.BaseURL, "/") + path
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, DurationSec: durationSec, Debug: takeDebug(ctx)}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet, RequestHeaders: headers, LatencyMs: latency, Error: err.Error()})
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, DurationSec: durationSec, Debug: takeDebug(ctx)}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet, RequestHeaders: headers, ResponseStatus: resp.StatusCode, ResponseBody: string(body), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, DurationSec: durationSec, Debug: takeDebug(ctx)}, fmt.Errorf("download new_api video content API error %d: %s", resp.StatusCode, sanitizeNewAPIErrorBody(body))
	}
	return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, ContentBytes: body, DurationSec: durationSec, Debug: takeDebug(ctx)}, nil
}

func newAPIVideoGenerationsContentPath(taskID string) string {
	return "/video/generations/" + strings.TrimSpace(taskID) + "/content"
}

func newAPIJimengActionURL(baseURL, action string) string {
	return newAPIGatewayRootURL(baseURL) + "/jimeng/?Action=" + url.QueryEscape(action) + "&Version=2022-08-31"
}

func newAPIGeminiGenerateContentURL(baseURL, model, action string) string {
	model = strings.TrimSpace(strings.TrimPrefix(model, "models/"))
	return newAPIGatewayRootURL(baseURL) + "/v1beta/models/" + url.PathEscape(model) + ":" + action
}

func newAPIGatewayRootURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/v1") {
		return strings.TrimSuffix(baseURL, "/v1")
	}
	return baseURL
}

func newAPIVideoProtocolProfile(profile, taskKind string) (string, error) {
	if profile = strings.TrimSpace(profile); profile == "" {
		taskKind = strings.TrimSpace(taskKind)
		switch {
		case strings.Contains(taskKind, "kling"):
			profile = NewAPIProfileKlingVideo
		case strings.Contains(taskKind, "jimeng"):
			profile = NewAPIProfileJimengAction
		case strings.Contains(taskKind, "sora"):
			profile = NewAPIProfileSoraVideoMultipart
		case strings.Contains(taskKind, "video_generations"):
			profile = NewAPIProfileVideoGenerations
		default:
			profile = DefaultNewAPIProtocolProfile(CapabilityFamilyVideoGeneration)
		}
	}
	def, ok := NewAPIProtocolProfile(profile)
	if !ok || def.CapabilityFamily != CapabilityFamilyVideoGeneration {
		return "", fmt.Errorf("unknown new_api video protocol_profile %q", profile)
	}
	return profile, nil
}

func validateNewAPIRequestProfile(profile, capabilityFamily string) error {
	profile = strings.TrimSpace(profile)
	if profile == "" {
		return nil
	}
	def, ok := NewAPIProtocolProfile(profile)
	if !ok {
		return fmt.Errorf("unknown new_api protocol_profile %q", profile)
	}
	if !def.Implemented {
		return fmt.Errorf("new_api protocol_profile %q is known but not implemented yet", profile)
	}
	if def.CapabilityFamily != strings.TrimSpace(capabilityFamily) {
		return fmt.Errorf("new_api protocol_profile %q requires capability %q", profile, def.CapabilityFamily)
	}
	return nil
}

func validateNewAPIRequestProfileOperation(profile, capabilityFamily, operation string) error {
	if err := validateNewAPIRequestProfile(profile, capabilityFamily); err != nil {
		return err
	}
	if strings.TrimSpace(profile) == "" || strings.TrimSpace(operation) == "" {
		return nil
	}
	if !NewAPIProtocolProfileSupportsOperation(profile, capabilityFamily, operation) {
		return fmt.Errorf("new_api protocol_profile %q does not support operation %q", strings.TrimSpace(profile), strings.TrimSpace(operation))
	}
	return nil
}

type newAPIGeminiGenerateContentResponse struct {
	Candidates []struct {
		Content struct {
			Role  string                    `json:"role"`
			Parts []newAPIGeminiContentPart `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount        int `json:"promptTokenCount"`
		CandidatesTokenCount    int `json:"candidatesTokenCount"`
		TotalTokenCount         int `json:"totalTokenCount"`
		CachedContentTokenCount int `json:"cachedContentTokenCount"`
		ThoughtsTokenCount      int `json:"thoughtsTokenCount"`
	} `json:"usageMetadata"`
}

type newAPIGeminiContentPart struct {
	Text       string `json:"text"`
	InlineData *struct {
		MIMEType      string `json:"mimeType"`
		MIMETypeSnake string `json:"mime_type"`
		Data          string `json:"data"`
	} `json:"inlineData"`
	InlineDataSnake *struct {
		MIMEType      string `json:"mimeType"`
		MIMETypeSnake string `json:"mime_type"`
		Data          string `json:"data"`
	} `json:"inline_data"`
}

func newAPIGeminiImageGenerateContentBody(req ImageRequest) (map[string]any, map[string]any, error) {
	if strings.TrimSpace(req.Model) == "" {
		return nil, nil, fmt.Errorf("new_api gemini image model is required")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return nil, nil, fmt.Errorf("new_api gemini image prompt is required")
	}
	parts := newAPIGeminiImageParts(req, prompt)
	body := map[string]any{
		"contents": []map[string]any{{
			"role":  "user",
			"parts": parts,
		}},
	}
	generationConfig := map[string]any{
		"responseModalities": []string{"IMAGE", "TEXT"},
	}
	if req.N > 0 {
		generationConfig["candidateCount"] = req.N
	}
	if req.Seed != nil {
		generationConfig["seed"] = *req.Seed
	}
	applyNewAPIGeminiExtraParams(body, generationConfig, req.ExtraParams)
	if len(generationConfig) > 0 {
		body["generationConfig"] = generationConfig
	}
	return body, sanitizeNewAPIGeminiImageDebugBody(body), nil
}

func newAPIGeminiImageParts(req ImageRequest, prompt string) []map[string]any {
	parts := make([]map[string]any, 0, len(req.InputImageDataList)+3)
	addNewAPIGeminiImagePart(&parts, req.InputImage, req.InputImageMime)
	if len(req.InputImageBytes) > 0 {
		parts = append(parts, newAPIGeminiInlineImagePart(firstNonEmptyAI(req.InputImageMime, "image/png"), base64.StdEncoding.EncodeToString(req.InputImageBytes)))
	}
	for _, mediaData := range req.InputImageDataList {
		if value := strings.TrimSpace(mediaData.PresignedURL); value != "" {
			addNewAPIGeminiImagePart(&parts, value, mediaData.MimeType)
			continue
		}
		if len(mediaData.Bytes) > 0 {
			parts = append(parts, newAPIGeminiInlineImagePart(firstNonEmptyAI(mediaData.MimeType, "image/png"), base64.StdEncoding.EncodeToString(mediaData.Bytes)))
		}
	}
	addNewAPIGeminiImagePart(&parts, req.CloudFileID, "")
	parts = append(parts, map[string]any{"text": prompt})
	return parts
}

func addNewAPIGeminiImagePart(parts *[]map[string]any, value, mimeType string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	mimeType = firstNonEmptyAI(strings.TrimSpace(mimeType), newAPIGeminiImageMimeFromValue(value))
	lower := strings.ToLower(value)
	switch {
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"), strings.HasPrefix(lower, "gs://"):
		*parts = append(*parts, map[string]any{"fileData": map[string]any{
			"mimeType": mimeType,
			"fileUri":  value,
		}})
	case strings.HasPrefix(lower, "data:"):
		if part, ok := newAPIGeminiImagePartFromDataURL(value, mimeType); ok {
			*parts = append(*parts, part)
		}
	case strings.HasPrefix(lower, "base64:"):
		*parts = append(*parts, newAPIGeminiInlineImagePart(mimeType, strings.TrimSpace(value[len("base64:"):])))
	default:
		*parts = append(*parts, newAPIGeminiInlineImagePart(mimeType, value))
	}
}

func newAPIGeminiImagePartFromDataURL(value, fallbackMime string) (map[string]any, bool) {
	idx := strings.Index(value, ",")
	if idx < 0 {
		return nil, false
	}
	header := value[:idx]
	data := strings.TrimSpace(value[idx+1:])
	if data == "" {
		return nil, false
	}
	mimeType := fallbackMime
	if strings.HasPrefix(strings.ToLower(header), "data:") {
		mimeType = strings.TrimSpace(strings.TrimPrefix(strings.SplitN(header, ";", 2)[0], "data:"))
	}
	return newAPIGeminiInlineImagePart(firstNonEmptyAI(mimeType, "image/png"), data), true
}

func newAPIGeminiInlineImagePart(mimeType, data string) map[string]any {
	return map[string]any{"inlineData": map[string]any{
		"mimeType": firstNonEmptyAI(strings.TrimSpace(mimeType), "image/png"),
		"data":     strings.TrimSpace(data),
	}}
}

func newAPIGeminiImageMimeFromValue(value string) string {
	lower := strings.ToLower(strings.TrimSpace(value))
	switch {
	case strings.Contains(lower, ".jpg"), strings.Contains(lower, ".jpeg"):
		return "image/jpeg"
	case strings.Contains(lower, ".webp"):
		return "image/webp"
	case strings.Contains(lower, ".gif"):
		return "image/gif"
	default:
		return "image/png"
	}
}

func sanitizeNewAPIGeminiImageDebugBody(body map[string]any) map[string]any {
	out, _ := sanitizeNewAPIGeminiImageDebugValue(body).(map[string]any)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func sanitizeNewAPIGeminiImageDebugValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			if (key == "inlineData" || key == "inline_data") && item != nil {
				if inline, ok := item.(map[string]any); ok {
					copied := make(map[string]any, len(inline))
					for inlineKey, inlineValue := range inline {
						if inlineKey == "data" && stringValueTrim(inlineValue) != "" {
							copied[inlineKey] = "base64 image"
							continue
						}
						copied[inlineKey] = inlineValue
					}
					out[key] = copied
					continue
				}
			}
			out[key] = sanitizeNewAPIGeminiImageDebugValue(item)
		}
		return out
	case []map[string]any:
		out := make([]map[string]any, 0, len(v))
		for _, item := range v {
			sanitized, _ := sanitizeNewAPIGeminiImageDebugValue(item).(map[string]any)
			out = append(out, sanitized)
		}
		return out
	case []any:
		out := make([]any, 0, len(v))
		for _, item := range v {
			out = append(out, sanitizeNewAPIGeminiImageDebugValue(item))
		}
		return out
	default:
		return value
	}
}

func newAPIGeminiAudioGenerateContentBody(req media.TTSRequest) (map[string]any, map[string]any, error) {
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return nil, nil, fmt.Errorf("new_api gemini audio text is required")
	}
	body := map[string]any{
		"contents": []map[string]any{{
			"role": "user",
			"parts": []map[string]any{{
				"text": text,
			}},
		}},
	}
	generationConfig := map[string]any{
		"responseModalities": []string{"AUDIO"},
		"speechConfig":       newAPIGeminiAudioSpeechConfig(req),
	}
	applyNewAPIGeminiAudioParams(body, generationConfig, req.Params)
	if len(generationConfig) > 0 {
		body["generationConfig"] = generationConfig
	}
	return body, redactGeminiTTSBody(body), nil
}

func newAPIGeminiAudioSpeechConfig(req media.TTSRequest) map[string]any {
	if speakers := geminiSpeakerConfigs(req.Params["speakers"]); len(speakers) > 0 {
		configs := make([]map[string]any, 0, len(speakers))
		for _, speaker := range speakers {
			configs = append(configs, map[string]any{
				"speaker": stringParam(speaker, "speaker", ""),
				"voiceConfig": map[string]any{
					"prebuiltVoiceConfig": map[string]any{
						"voiceName": stringParam(speaker, "voice", "Kore"),
					},
				},
			})
		}
		return map[string]any{
			"multiSpeakerVoiceConfig": map[string]any{
				"speakerVoiceConfigs": configs,
			},
		}
	}
	voice := firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "Kore"))
	return map[string]any{
		"voiceConfig": map[string]any{
			"prebuiltVoiceConfig": map[string]any{
				"voiceName": voice,
			},
		},
	}
}

func applyNewAPIGeminiAudioParams(body map[string]any, generationConfig map[string]any, params map[string]any) {
	for key, value := range params {
		if isNewAPIReservedExtraParamKey(key) || isEmptyNewAPIAny(value) {
			continue
		}
		switch strings.TrimSpace(key) {
		case "voice", "speakers", "sample_rate", "channels":
			continue
		case "generationConfig", "generation_config":
			if config, ok := value.(map[string]any); ok {
				for configKey, configValue := range config {
					if !isEmptyNewAPIAny(configValue) {
						generationConfig[configKey] = configValue
					}
				}
			}
		case "speechConfig", "speech_config":
			generationConfig["speechConfig"] = value
		case "response_modalities", "responseModalities":
			generationConfig["responseModalities"] = value
		case "temperature":
			generationConfig["temperature"] = value
		case "top_p", "topP":
			generationConfig["topP"] = value
		case "top_k", "topK":
			generationConfig["topK"] = value
		case "candidate_count", "candidateCount":
			generationConfig["candidateCount"] = value
		case "safety_settings":
			body["safetySettings"] = value
		default:
			body[key] = value
		}
	}
}

func newAPIGeminiGenerateContentBody(req TextRequest) (map[string]any, map[string]any, error) {
	contents, systemInstruction := newAPIGeminiContents(req.Messages)
	if len(contents) == 0 {
		contents = []map[string]any{{"role": "user", "parts": []map[string]any{{"text": ""}}}}
	}
	body := map[string]any{"contents": contents}
	if len(systemInstruction) > 0 {
		body["systemInstruction"] = map[string]any{"parts": systemInstruction}
	}
	generationConfig := map[string]any{}
	if req.MaxTokens > 0 {
		generationConfig["maxOutputTokens"] = req.MaxTokens
	}
	if req.Temperature >= 0 {
		generationConfig["temperature"] = req.Temperature
	}
	if req.JSONMode {
		generationConfig["responseMimeType"] = "application/json"
	}
	applyNewAPIGeminiExtraParams(body, generationConfig, req.ExtraParams)
	if len(generationConfig) > 0 {
		body["generationConfig"] = generationConfig
	}
	return body, body, nil
}

func newAPIGeminiContents(messages []Message) ([]map[string]any, []map[string]any) {
	contents := make([]map[string]any, 0, len(messages))
	systemParts := make([]map[string]any, 0)
	for _, message := range messages {
		parts := newAPIGeminiParts(message)
		if len(parts) == 0 {
			continue
		}
		if strings.EqualFold(message.Role, "system") {
			systemParts = append(systemParts, parts...)
			continue
		}
		contents = append(contents, map[string]any{
			"role":  newAPIGeminiRole(message.Role),
			"parts": parts,
		})
	}
	return contents, systemParts
}

func newAPIGeminiParts(message Message) []map[string]any {
	parts := make([]map[string]any, 0, 1+len(message.ContentParts))
	if strings.TrimSpace(message.Content) != "" {
		parts = append(parts, map[string]any{"text": message.Content})
	}
	for _, raw := range message.ContentParts {
		if len(raw) == 0 {
			continue
		}
		part := map[string]any{}
		for key, value := range raw {
			part[key] = value
		}
		parts = append(parts, part)
	}
	return parts
}

func newAPIGeminiRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant", "model":
		return "model"
	default:
		return "user"
	}
}

func applyNewAPIGeminiExtraParams(body map[string]any, generationConfig map[string]any, params map[string]any) {
	for key, value := range params {
		if isNewAPIReservedExtraParamKey(key) || isEmptyNewAPIAny(value) {
			continue
		}
		switch strings.TrimSpace(key) {
		case "generationConfig", "generation_config":
			if config, ok := value.(map[string]any); ok {
				for configKey, configValue := range config {
					if !isEmptyNewAPIAny(configValue) {
						generationConfig[configKey] = configValue
					}
				}
			}
		case "max_tokens", "maxOutputTokens":
			generationConfig["maxOutputTokens"] = value
		case "temperature":
			generationConfig["temperature"] = value
		case "top_p", "topP":
			generationConfig["topP"] = value
		case "top_k", "topK":
			generationConfig["topK"] = value
		case "stop_sequences", "stopSequences":
			generationConfig["stopSequences"] = value
		case "candidate_count", "candidateCount":
			generationConfig["candidateCount"] = value
		case "response_mime_type", "responseMimeType":
			generationConfig["responseMimeType"] = value
		case "response_schema", "responseSchema":
			generationConfig["responseSchema"] = value
		case "safety_settings":
			body["safetySettings"] = value
		case "tool_config":
			body["toolConfig"] = value
		case "cached_content":
			body["cachedContent"] = value
		default:
			body[key] = value
		}
	}
}

func newAPIGeminiTextResponse(raw newAPIGeminiGenerateContentResponse) (TextResponse, error) {
	if len(raw.Candidates) == 0 {
		return TextResponse{}, fmt.Errorf("new_api gemini returned no candidates")
	}
	candidate := raw.Candidates[0]
	content := newAPIGeminiTextFromParts(candidate.Content.Parts)
	if content == "" {
		return TextResponse{}, fmt.Errorf("new_api gemini returned no text content")
	}
	return TextResponse{
		Content:      content,
		FinishReason: candidate.FinishReason,
		Usage:        newAPIGeminiTokenUsage(raw),
	}, nil
}

func newAPIGeminiImageURLs(raw newAPIGeminiGenerateContentResponse) ([]string, string) {
	urls := make([]string, 0)
	textParts := make([]string, 0)
	for _, candidate := range raw.Candidates {
		for _, part := range candidate.Content.Parts {
			inline := part.InlineData
			if inline == nil {
				inline = part.InlineDataSnake
			}
			if inline != nil {
				mimeType := firstNonEmptyAI(strings.TrimSpace(inline.MIMEType), strings.TrimSpace(inline.MIMETypeSnake), "image/png")
				if strings.HasPrefix(strings.ToLower(mimeType), "image/") && strings.TrimSpace(inline.Data) != "" {
					urls = append(urls, "data:"+mimeType+";base64,"+strings.TrimSpace(inline.Data))
				}
			}
			if text := strings.TrimSpace(part.Text); text != "" {
				textParts = append(textParts, text)
			}
		}
	}
	return urls, strings.Join(textParts, " ")
}

func newAPIGeminiAudioOutput(raw newAPIGeminiGenerateContentResponse) (dataB64, mimeType string) {
	for _, candidate := range raw.Candidates {
		for _, part := range candidate.Content.Parts {
			inline := part.InlineData
			if inline == nil {
				inline = part.InlineDataSnake
			}
			if inline == nil || strings.TrimSpace(inline.Data) == "" {
				continue
			}
			mimeType = firstNonEmptyAI(strings.TrimSpace(inline.MIMEType), strings.TrimSpace(inline.MIMETypeSnake), "audio/wav")
			if strings.HasPrefix(strings.ToLower(mimeType), "audio/") {
				return strings.TrimSpace(inline.Data), mimeType
			}
		}
	}
	return "", ""
}

func newAPIGeminiAudioNeedsWAVWrap(mimeType string) bool {
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	return strings.Contains(mimeType, "l16") ||
		strings.Contains(mimeType, "pcm") ||
		strings.Contains(mimeType, "audio/raw")
}

func newAPIGeminiAudioSampleRate(mimeType string, fallback int) int {
	lower := strings.ToLower(mimeType)
	for _, marker := range []string{"rate=", "rate:"} {
		if idx := strings.Index(lower, marker); idx >= 0 {
			rest := lower[idx+len(marker):]
			var parsed int
			if _, err := fmt.Sscanf(rest, "%d", &parsed); err == nil && parsed > 0 {
				return parsed
			}
		}
	}
	return fallback
}

func newAPIGeminiTextStreamEvent(raw newAPIGeminiGenerateContentResponse) TextStreamEvent {
	event := TextStreamEvent{Usage: newAPIGeminiTokenUsage(raw)}
	if len(raw.Candidates) == 0 {
		return event
	}
	candidate := raw.Candidates[0]
	event.Role = candidate.Content.Role
	event.ContentDelta = newAPIGeminiTextFromParts(candidate.Content.Parts)
	event.FinishReason = candidate.FinishReason
	return event
}

func newAPIGeminiTextFromParts(parts []newAPIGeminiContentPart) string {
	var out strings.Builder
	for _, part := range parts {
		out.WriteString(part.Text)
	}
	return out.String()
}

func newAPIGeminiTokenUsage(raw newAPIGeminiGenerateContentResponse) TokenUsage {
	return TokenUsage{
		InputTokens:       raw.UsageMetadata.PromptTokenCount,
		OutputTokens:      raw.UsageMetadata.CandidatesTokenCount,
		CachedInputTokens: raw.UsageMetadata.CachedContentTokenCount,
		ReasoningTokens:   raw.UsageMetadata.ThoughtsTokenCount,
	}
}

func newAPIJimengActionJSONBody(req VideoRequest) (map[string]any, map[string]any, int, error) {
	payload := newAPIVideoPayload(req)
	body := map[string]any{}
	copyNewAPIJimengPayloadParams(body, payload)
	reqKey := firstNonEmptyAI(stringValueTrim(body["req_key"]), strings.TrimSpace(req.Model))
	if reqKey == "" {
		return nil, nil, 0, fmt.Errorf("new_api jimeng req_key/provider_model_id is required")
	}
	body["req_key"] = reqKey
	body["model"] = reqKey
	prompt := firstNonEmptyAI(stringValueTrim(body["prompt"]), strings.TrimSpace(req.Prompt))
	if prompt == "" {
		return nil, nil, 0, fmt.Errorf("new_api jimeng prompt is required")
	}
	body["prompt"] = prompt

	duration := req.Duration
	if duration <= 0 {
		duration = 5
	}
	if req.Frames > 0 {
		body["frames"] = req.Frames
	} else if _, ok := intValue(body["frames"]); !ok && duration > 0 {
		body["frames"] = newAPIJimengFramesForDuration(duration)
	}
	if req.Seed != nil {
		if _, exists := body["seed"]; !exists {
			body["seed"] = *req.Seed
		}
	}
	if aspectRatio := strings.TrimSpace(firstNonEmptyAI(req.AspectRatio, req.Ratio)); aspectRatio != "" {
		if _, exists := body["aspect_ratio"]; !exists {
			body["aspect_ratio"] = aspectRatio
		}
	}
	imageURLs, binaryImages := newAPIJimengVideoImages(req)
	mergeNewAPIJimengStringSliceField(body, "image_urls", imageURLs)
	mergeNewAPIJimengStringSliceField(body, "binary_data_base64", binaryImages)
	switch strings.TrimSpace(req.Operation) {
	case VideoOperationImageToVideo, VideoOperationFirstFrameToVideo:
		if newAPIJimengBodyImageCount(body) < 1 {
			return nil, nil, 0, fmt.Errorf("new_api jimeng %s requires image input", strings.TrimSpace(req.Operation))
		}
	case VideoOperationFirstLastFrameToVideo:
		if newAPIJimengBodyImageCount(body) < 2 {
			return nil, nil, 0, fmt.Errorf("new_api jimeng first_last_frame_to_video requires two image inputs")
		}
	}
	debugBody := sanitizeNewAPIJimengDebugBody(body)
	attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("image_urls"))
	return body, debugBody, duration, nil
}

func copyNewAPIJimengPayloadParams(body map[string]any, params map[string]any) {
	for key, value := range params {
		key = strings.TrimSpace(key)
		if strings.EqualFold(key, "req_key") {
			if _, exists := body["req_key"]; !exists {
				body["req_key"] = value
			}
			continue
		}
		if isNewAPIReservedExtraParamKey(key) {
			continue
		}
		if _, exists := body[key]; exists {
			continue
		}
		// Jimeng Action should stay forwarding-oriented: keep provider business fields,
		// while filtering route/internal/security keys above.
		body[key] = value
	}
}

func newAPIJimengFramesForDuration(duration int) int {
	if duration <= 0 {
		return 121
	}
	return duration*24 + 1
}

func newAPIJimengVideoImages(req VideoRequest) ([]string, []string) {
	urls := []string{}
	binary := []string{}
	addNewAPIJimengImageValue(req.Image, &urls, &binary)
	for _, value := range req.InputImages {
		addNewAPIJimengImageValue(value, &urls, &binary)
	}
	for _, mediaData := range req.InputImageDataList {
		if value := strings.TrimSpace(mediaData.PresignedURL); value != "" {
			addNewAPIJimengImageValue(value, &urls, &binary)
			continue
		}
		if len(mediaData.Bytes) > 0 {
			binary = append(binary, base64.StdEncoding.EncodeToString(mediaData.Bytes))
		}
	}
	return urls, binary
}

func addNewAPIJimengImageValue(value string, urls, binary *[]string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	lower := strings.ToLower(value)
	switch {
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"):
		*urls = append(*urls, value)
	case strings.HasPrefix(lower, "base64:"):
		*binary = append(*binary, strings.TrimSpace(value[len("base64:"):]))
	case strings.HasPrefix(lower, "data:"):
		if idx := strings.Index(value, ","); idx >= 0 {
			*binary = append(*binary, strings.TrimSpace(value[idx+1:]))
			return
		}
		*binary = append(*binary, value)
	default:
		*binary = append(*binary, value)
	}
}

func mergeNewAPIJimengStringSliceField(body map[string]any, key string, values []string) {
	if len(values) == 0 {
		return
	}
	merged := append(newAPIJimengStringSliceFromAny(body[key]), values...)
	if len(merged) == 0 {
		return
	}
	body[key] = merged
}

func newAPIJimengBodyImageCount(body map[string]any) int {
	urlCount := len(newAPIJimengStringSliceFromAny(body["image_urls"]))
	binaryCount := len(newAPIJimengStringSliceFromAny(body["binary_data_base64"]))
	if urlCount > binaryCount {
		return urlCount
	}
	return binaryCount
}

func sanitizeNewAPIJimengDebugBody(body map[string]any) map[string]any {
	debugBody := copyMapAI(body)
	if images := newAPIJimengStringSliceFromAny(debugBody["binary_data_base64"]); len(images) > 0 {
		debugBody["binary_data_base64"] = fmt.Sprintf("%d base64 image(s)", len(images))
	}
	if images := newAPIJimengStringSliceFromAny(debugBody["image_urls"]); len(images) > 0 {
		debugBody["image_urls"] = fmt.Sprintf("%d url image(s)", len(images))
	}
	return debugBody
}

func newAPIJimengStringSliceFromAny(value any) []string {
	switch v := value.(type) {
	case []string:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if item = strings.TrimSpace(item); item != "" {
				out = append(out, item)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := stringValueTrim(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		if s := strings.TrimSpace(v); s != "" {
			return []string{s}
		}
	}
	return nil
}

func writeMultipartField(w *multipart.Writer, key, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	_ = w.WriteField(key, value)
}

func newAPIVideoGenerationsJSONBody(req VideoRequest, duration int) (map[string]any, map[string]any, error) {
	payload := newAPIVideoPayload(req)
	body := map[string]any{}
	copyNewAPIExtraParams(body, payload)
	body["model"] = req.Model
	if strings.TrimSpace(req.Prompt) != "" {
		body["prompt"] = req.Prompt
	}
	if duration > 0 {
		body["duration"] = duration
	}
	width, height := newAPIVideoDimensions(req)
	if width > 0 {
		body["width"] = width
	}
	if height > 0 {
		body["height"] = height
	}
	if size := newAPIVideoTaskSize(req, width, height); size != "" {
		body["size"] = size
	}
	for _, key := range []string{"fps", "n"} {
		if n, ok := intValue(payload[key]); ok && n > 0 {
			body[key] = n
		}
	}
	if req.Seed != nil {
		body["seed"] = *req.Seed
	} else if n, ok := int64Value(payload["seed"]); ok {
		body["seed"] = n
	}
	if responseFormat := stringValueTrim(payload["response_format"]); responseFormat != "" {
		body["response_format"] = responseFormat
	}
	if user := stringValueTrim(payload["user"]); user != "" {
		if err := validateNewAPIVideoUser(user); err != nil {
			return nil, nil, err
		}
		body["user"] = user
	}
	metadata, err := newAPIVideoTaskMetadata(req, payload, duration)
	if err != nil {
		return nil, nil, err
	}
	if len(metadata) > 0 {
		body["metadata"] = metadata
	}
	image, imageSource := newAPIVideoImage(req)
	if image != "" {
		body["image"] = image
	}
	images, imageSources := newAPIVideoImages(req)
	if len(images) > 0 {
		body["images"] = images
	}
	debugBody := copyMapAI(body)
	if image != "" {
		debugBody["image"] = imageSource
	}
	if len(imageSources) > 0 {
		debugBody["images"] = imageSources
	}
	attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("image"))
	return body, debugBody, nil
}

func newAPIVideoTaskSize(req VideoRequest, width, height int) string {
	if size := strings.TrimSpace(req.Size); size != "" {
		return size
	}
	if width > 0 && height > 0 {
		return fmt.Sprintf("%dx%d", width, height)
	}
	return ""
}

func newAPIVideoTaskMetadata(req VideoRequest, payload map[string]any, duration int) (map[string]any, error) {
	metadata := map[string]any{}
	if raw, ok := payload["metadata"]; ok {
		parsed, err := validateNewAPIVideoMetadata(raw)
		if err != nil {
			return nil, err
		}
		for key, value := range parsed {
			metadata[key] = value
		}
	}
	copyNewAPIVideoPayloadMetadataFields(metadata, payload)
	setNewAPIMapStringIfAbsent(metadata, "ratio", firstNonEmptyAI(stringValueTrim(payload["ratio"]), req.Ratio, req.AspectRatio))
	setNewAPIMapStringIfAbsent(metadata, "aspectRatio", firstNonEmptyAI(stringValueTrim(payload["aspectRatio"]), req.AspectRatio, req.Ratio))
	setNewAPIMapStringIfAbsent(metadata, "resolution", firstNonEmptyAI(stringValueTrim(payload["resolution"]), req.ResolutionName))
	if req.GenerateAudio != nil {
		setNewAPIMapAnyIfAbsent(metadata, "generate_audio", *req.GenerateAudio)
		setNewAPIMapAnyIfAbsent(metadata, "generateAudio", *req.GenerateAudio)
	}
	if req.ReturnLastFrame != nil {
		setNewAPIMapAnyIfAbsent(metadata, "return_last_frame", *req.ReturnLastFrame)
	}
	if req.CameraFixed != nil {
		setNewAPIMapAnyIfAbsent(metadata, "camera_fixed", *req.CameraFixed)
	}
	if req.Watermark != nil {
		setNewAPIMapAnyIfAbsent(metadata, "watermark", *req.Watermark)
	}
	if req.Seed != nil {
		setNewAPIMapAnyIfAbsent(metadata, "seed", *req.Seed)
	}
	if req.Frames > 0 {
		setNewAPIMapAnyIfAbsent(metadata, "frames", req.Frames)
	}
	if duration > 0 {
		setNewAPIMapAnyIfAbsent(metadata, "durationSeconds", duration)
	}
	if req.ServiceTier != "" {
		setNewAPIMapAnyIfAbsent(metadata, "service_tier", req.ServiceTier)
	}
	if req.ExecutionExpiresAfter > 0 {
		setNewAPIMapAnyIfAbsent(metadata, "execution_expires_after", req.ExecutionExpiresAfter)
	}
	if req.WebSearch {
		setNewAPIMapAnyIfAbsent(metadata, "tools", []map[string]any{{"type": "web_search"}})
	}
	if len(metadata) == 0 {
		return nil, nil
	}
	if err := validateNewAPIVideoMetadataValue("metadata", metadata); err != nil {
		return nil, err
	}
	return metadata, nil
}

func copyNewAPIVideoPayloadMetadataFields(metadata map[string]any, payload map[string]any) {
	for _, key := range []string{
		"content",
		"callback_url",
		"return_last_frame",
		"service_tier",
		"execution_expires_after",
		"generate_audio",
		"generateAudio",
		"draft",
		"tools",
		"resolution",
		"ratio",
		"durationSeconds",
		"aspectRatio",
		"negativePrompt",
		"negative_prompt",
		"personGeneration",
		"storageUri",
		"compressionQuality",
		"resizeMode",
		"camera_fixed",
		"watermark",
		"frames",
		"seed",
		"sampleCount",
	} {
		if value, ok := payload[key]; ok && !isEmptyNewAPIAny(value) {
			setNewAPIMapAnyIfAbsent(metadata, key, value)
		}
	}
}

func newAPIEmbeddingInputPayload(inputs []string) any {
	cleaned := make([]string, 0, len(inputs))
	for _, input := range inputs {
		if strings.TrimSpace(input) != "" {
			cleaned = append(cleaned, input)
		}
	}
	if len(cleaned) == 1 {
		return cleaned[0]
	}
	return cleaned
}

func newAPIEmbeddingEndpointPath(model, profile string) string {
	switch ResolveNewAPIProtocolProfile(CapabilityFamilyEmbedding, profile) {
	case NewAPIProfileGeminiEngineEmbeddings:
		return "/engines/" + url.PathEscape(strings.TrimSpace(model)) + "/embeddings"
	default:
		return "/embeddings"
	}
}

func newAPIRerankDocumentsPayload(documents []RerankDocument) []any {
	out := make([]any, 0, len(documents))
	for _, document := range documents {
		if len(document.Data) > 0 {
			out = append(out, document.Data)
			continue
		}
		out = append(out, document.Text)
	}
	return out
}

func copyNewAPIExtraParams(body map[string]any, params map[string]any) {
	for key, value := range params {
		key = strings.TrimSpace(key)
		if isNewAPIReservedExtraParamKey(key) {
			continue
		}
		if _, exists := body[key]; exists {
			continue
		}
		body[key] = value
	}
}

func isNewAPIReservedExtraParamKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	switch lower {
	case "",
		"model",
		"model_id",
		"model-id",
		"modelid",
		"req_key",
		"req-key",
		"reqkey",
		"protocol_profile",
		"protocol-profile",
		"protocolprofile",
		"adapter",
		"adapter_type",
		"adapter-type",
		"adaptertype",
		"provider_id",
		"provider-id",
		"providerid",
		"provider_model_id",
		"provider-model-id",
		"providermodelid",
		"route_id",
		"route-id",
		"routeid",
		"route_binding_id",
		"route-binding-id",
		"routebindingid",
		"route_group",
		"route-group",
		"routegroup",
		"base_url",
		"base-url",
		"baseurl",
		"endpoint_path_prefix",
		"endpoint-path-prefix",
		"endpointpathprefix",
		"endpoint_mode",
		"endpoint-mode",
		"endpointmode":
		return true
	default:
		return isSensitiveDebugKey(lower)
	}
}

func newAPIRealtimeURL(baseURL string, req RealtimeSessionRequest) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("new_api base_url is required")
	}
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	case "wss", "ws":
	default:
		return "", fmt.Errorf("unsupported realtime base_url scheme %q", u.Scheme)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/realtime"
	q := u.Query()
	if req.Model != "" {
		q.Set("model", req.Model)
	}
	for key, value := range req.Query {
		key = strings.TrimSpace(key)
		if strings.EqualFold(key, "model") || isNewAPIRealtimeReservedQuery(key) {
			continue
		}
		if key != "" && strings.TrimSpace(value) != "" {
			q.Set(key, value)
		}
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func isNewAPIRealtimeReservedHeader(key string) bool {
	key = strings.TrimSpace(key)
	return key == "" || isSensitiveDebugKey(key)
}

func isNewAPIRealtimeReservedQuery(key string) bool {
	key = strings.TrimSpace(key)
	return key == "" || isSensitiveDebugKey(key)
}

type websocketRealtimeSession struct {
	conn *websocket.Conn
}

func (s *websocketRealtimeSession) SendEvent(ctx context.Context, event RealtimeEvent) error {
	if s == nil || s.conn == nil {
		return fmt.Errorf("realtime session is closed")
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = s.conn.SetWriteDeadline(deadline)
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	return s.conn.WriteJSON(map[string]any(event))
}

func (s *websocketRealtimeSession) ReceiveEvent(ctx context.Context) (RealtimeEvent, error) {
	if s == nil || s.conn == nil {
		return nil, fmt.Errorf("realtime session is closed")
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = s.conn.SetReadDeadline(deadline)
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	var event map[string]any
	if err := s.conn.ReadJSON(&event); err != nil {
		return nil, err
	}
	return RealtimeEvent(event), nil
}

func (s *websocketRealtimeSession) Close() error {
	if s == nil || s.conn == nil {
		return nil
	}
	return s.conn.Close()
}

type newAPITokenUsage struct {
	PromptTokens        int `json:"prompt_tokens"`
	CompletionTokens    int `json:"completion_tokens"`
	TotalTokens         int `json:"total_tokens"`
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	PromptTokensDetails struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
	CompletionTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
	InputTokensDetails struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"input_tokens_details"`
	OutputTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"output_tokens_details"`
}

func (u newAPITokenUsage) tokenUsage() TokenUsage {
	input := firstPositiveInt(u.InputTokens, u.PromptTokens)
	output := firstPositiveInt(u.OutputTokens, u.CompletionTokens)
	if output == 0 && u.TotalTokens > input {
		output = u.TotalTokens - input
	}
	return TokenUsage{
		InputTokens:       input,
		OutputTokens:      output,
		CachedInputTokens: firstPositiveInt(u.InputTokensDetails.CachedTokens, u.PromptTokensDetails.CachedTokens),
		ReasoningTokens:   firstPositiveInt(u.OutputTokensDetails.ReasoningTokens, u.CompletionTokensDetails.ReasoningTokens),
	}
}

func firstPositiveInt(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func newAPIVideoDimensions(req VideoRequest) (int, int) {
	if req.Width > 0 && req.Height > 0 {
		return req.Width, req.Height
	}
	if width, height, ok := parseVideoSize(firstNonEmptyAI(req.Size, req.ResolutionName)); ok {
		return width, height
	}
	switch strings.TrimSpace(req.AspectRatio) {
	case "9:16":
		return 720, 1280
	case "1:1":
		return 1024, 1024
	case "16:9":
		return 1280, 720
	default:
		return req.Width, req.Height
	}
}

func parseVideoSize(value string) (int, int, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "*", "x")
	parts := strings.Split(value, "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, errW := strconv.Atoi(strings.TrimSpace(parts[0]))
	height, errH := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errW != nil || errH != nil || width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func newAPIVideoImage(req VideoRequest) (string, string) {
	if value := strings.TrimSpace(req.Image); value != "" {
		return value, "url"
	}
	for _, value := range req.InputImages {
		if value = strings.TrimSpace(value); value != "" {
			return value, "url"
		}
	}
	for _, mediaData := range req.InputImageDataList {
		if value := strings.TrimSpace(mediaData.PresignedURL); value != "" {
			return value, "url"
		}
		if len(mediaData.Bytes) > 0 {
			return base64.StdEncoding.EncodeToString(mediaData.Bytes), "base64"
		}
	}
	return "", ""
}

func newAPIVideoImages(req VideoRequest) ([]string, []string) {
	images := []string{}
	sources := []string{}
	seen := map[string]bool{}
	add := func(value, source string) {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			return
		}
		seen[value] = true
		images = append(images, value)
		sources = append(sources, source)
	}
	add(req.Image, "url")
	for _, value := range req.InputImages {
		add(value, "url")
	}
	for _, mediaData := range req.InputImageDataList {
		if value := strings.TrimSpace(mediaData.PresignedURL); value != "" {
			add(value, "url")
			continue
		}
		if len(mediaData.Bytes) > 0 {
			add(base64.StdEncoding.EncodeToString(mediaData.Bytes), "base64")
		}
	}
	return images, sources
}

func newAPIVideoPayload(req VideoRequest) map[string]any {
	payload := map[string]any{}
	if strings.TrimSpace(req.Payload) == "" {
		return payload
	}
	_ = json.Unmarshal([]byte(req.Payload), &payload)
	if payload == nil {
		return map[string]any{}
	}
	return payload
}

func setNewAPIMapAnyIfAbsent(m map[string]any, key string, value any) {
	key = strings.TrimSpace(key)
	if key == "" || isEmptyNewAPIAny(value) {
		return
	}
	if _, exists := m[key]; exists {
		return
	}
	m[key] = value
}

func setNewAPIMapStringIfAbsent(m map[string]any, key string, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	setNewAPIMapAnyIfAbsent(m, key, value)
}

func isEmptyNewAPIAny(value any) bool {
	switch v := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(v) == ""
	case []any:
		return len(v) == 0
	case []string:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	default:
		return false
	}
}

func validateNewAPIVideoUser(user string) error {
	if containsNewAPISensitiveVideoValue(user) {
		return fmt.Errorf("new_api video user must not contain email, token, or cookie data")
	}
	return nil
}

func validateNewAPIVideoMetadata(metadata any) (map[string]any, error) {
	metadataMap, ok := metadata.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("new_api video metadata must be a JSON object")
	}
	if err := validateNewAPIVideoMetadataValue("metadata", metadataMap); err != nil {
		return nil, err
	}
	return metadataMap, nil
}

func validateNewAPIVideoMetadataValue(path string, value any) error {
	switch v := value.(type) {
	case map[string]any:
		for key, child := range v {
			if isNewAPISensitiveVideoMetadataKey(key) {
				return fmt.Errorf("new_api video metadata must not contain sensitive key %q", key)
			}
			if isNewAPIReservedVideoMetadataKey(key) {
				return fmt.Errorf("new_api video metadata must not contain reserved key %q", key)
			}
			childPath := path + "." + key
			if err := validateNewAPIVideoMetadataValue(childPath, child); err != nil {
				return err
			}
		}
	case []any:
		for index, child := range v {
			if err := validateNewAPIVideoMetadataValue(fmt.Sprintf("%s[%d]", path, index), child); err != nil {
				return err
			}
		}
	case string:
		if containsNewAPISensitiveVideoValue(v) {
			return fmt.Errorf("new_api video metadata field %s must not contain email, token, or cookie data", path)
		}
	}
	return nil
}

func isNewAPIReservedVideoMetadataKey(key string) bool {
	return isNewAPIReservedExtraParamKey(key)
}

func isNewAPISensitiveVideoMetadataKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "" {
		return false
	}
	switch lower {
	case "authorization", "cookie", "set-cookie", "token", "access_token", "api_key", "apikey", "secret", "email", "user_email":
		return true
	default:
		return strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "cookie")
	}
}

func sanitizeNewAPIErrorBody(body []byte) string {
	return sanitizeAIErrorBody(body)
}

func containsNewAPISensitiveVideoValue(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	lower := strings.ToLower(trimmed)
	if looksLikeNewAPIEmail(trimmed) {
		return true
	}
	if strings.HasPrefix(lower, "bearer ") || strings.HasPrefix(trimmed, "sk-") || strings.HasPrefix(trimmed, "sk_") {
		return true
	}
	for _, marker := range []string{"api_key=", "apikey=", "access_token=", "token=", "authorization:", "set-cookie:", "cookie:", "sessionid=", "session="} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return looksLikeJWT(trimmed)
}

func looksLikeNewAPIEmail(value string) bool {
	at := strings.IndexByte(value, '@')
	if at <= 0 || at >= len(value)-1 {
		return false
	}
	domain := value[at+1:]
	return strings.Contains(domain, ".") && !strings.ContainsAny(value, " \t\r\n")
}

func looksLikeJWT(value string) bool {
	if len(value) < 40 {
		return false
	}
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			return false
		}
	}
	return true
}

func intFromAny(value any) int {
	if n, ok := intValue(value); ok {
		return n
	}
	if s := stringValueTrim(value); s != "" {
		n, _ := strconv.Atoi(s)
		return n
	}
	return 0
}

func intValue(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case json.Number:
		n, err := v.Int64()
		return int(n), err == nil
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		return n, err == nil
	default:
		return 0, false
	}
}

func int64Value(value any) (int64, bool) {
	switch v := value.(type) {
	case int:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		return int64(v), true
	case json.Number:
		n, err := v.Int64()
		return n, err == nil
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func stringValueTrim(value any) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func nestedAny(raw map[string]any, keys ...string) any {
	var current any = raw
	for _, key := range keys {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = m[key]
	}
	return current
}
