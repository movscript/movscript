package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
	"google.golang.org/genai"
)

// capturingTransport wraps an http.RoundTripper and records the first request/response
// into the debug recorder attached to the context.
type capturingTransport struct {
	inner http.RoundTripper
	ctx   context.Context
}

func (t *capturingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Capture request body without consuming it.
	var reqBody string
	if req.Body != nil {
		b, _ := io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewReader(b))
		reqBody = string(b)
	}

	reqHeaders := make(map[string]string)
	for k := range req.Header {
		v := req.Header.Get(k)
		if strings.EqualFold(k, "authorization") || strings.EqualFold(k, "x-goog-api-key") {
			v = maskKey(v)
		}
		reqHeaders[k] = v
	}

	start := time.Now()
	resp, err := t.inner.RoundTrip(req)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		recordDebug(t.ctx, DebugCallResult{
			Endpoint:       req.URL.String(),
			Method:         req.Method,
			RequestHeaders: reqHeaders,
			RequestBody:    reqBody,
			LatencyMs:      latency,
			Error:          err.Error(),
		})
		return nil, err
	}

	// Read response body and restore it.
	var respBody string
	if resp.Body != nil {
		b, _ := io.ReadAll(resp.Body)
		resp.Body = io.NopCloser(bytes.NewReader(b))
		respBody = string(b)
	}

	recordDebug(t.ctx, DebugCallResult{
		Endpoint:       req.URL.String(),
		Method:         req.Method,
		RequestHeaders: reqHeaders,
		RequestBody:    reqBody,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   respBody,
		LatencyMs:      latency,
	})
	return resp, nil
}

// GeminiAdapter handles Google Gemini API calls via the go-genai SDK.
// - Text: GenerateContent (Gemini Pro/Flash)
// - Image: GenerateImages on Imagen models
// - Video: GenerateVideos on Veo models (async poll)
type GeminiAdapter struct {
	apiKey  string
	baseURL string
	rawHTTP *http.Client
}

func NewGeminiAdapter(apiKey, baseURL string) *GeminiAdapter {
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}
	return &GeminiAdapter{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		rawHTTP: &http.Client{},
	}
}

func (a *GeminiAdapter) newClient(ctx context.Context) (*genai.Client, error) {
	cfg := &genai.ClientConfig{
		APIKey:  a.apiKey,
		Backend: genai.BackendGeminiAPI,
	}
	if a.baseURL != "https://generativelanguage.googleapis.com" {
		cfg.HTTPOptions = genai.HTTPOptions{BaseURL: a.baseURL}
	}
	// If a debug recorder is attached, inject a capturing transport.
	if _, ok := ctx.Value(debugContextKey{}).(*DebugCallResult); ok {
		inner := http.DefaultTransport
		cfg.HTTPClient = &http.Client{Transport: &capturingTransport{inner: inner, ctx: ctx}}
	}
	return genai.NewClient(ctx, cfg)
}

func (a *GeminiAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	client, err := a.newClient(ctx)
	if err != nil {
		return TextResponse{}, fmt.Errorf("gemini: create client: %w", err)
	}

	var systemParts []*genai.Part
	var userParts []*genai.Part
	for _, m := range req.Messages {
		if m.Role == "system" {
			systemParts = append(systemParts, genai.NewPartFromText(m.Content+"\n\n"))
		} else {
			userParts = append(userParts, genai.NewPartFromText(m.Content))
		}
	}

	cfg := &genai.GenerateContentConfig{}
	if len(systemParts) > 0 {
		cfg.SystemInstruction = genai.NewContentFromParts(systemParts, "")
	}
	if req.MaxTokens > 0 {
		cfg.MaxOutputTokens = int32(req.MaxTokens)
	}
	if req.Temperature >= 0 {
		t := req.Temperature
		cfg.Temperature = &t
	}

	contents := []*genai.Content{genai.NewContentFromParts(userParts, "user")}
	resp, err := client.Models.GenerateContent(ctx, req.Model, contents, cfg)
	if err != nil {
		return TextResponse{}, fmt.Errorf("gemini: generate content: %w", err)
	}
	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return TextResponse{}, fmt.Errorf("gemini: no content returned")
	}

	text := ""
	for _, part := range resp.Candidates[0].Content.Parts {
		if part.Text != "" {
			text += part.Text
		}
	}
	usage := TokenUsage{}
	if resp.UsageMetadata != nil {
		usage.InputTokens = int(resp.UsageMetadata.PromptTokenCount)
		usage.OutputTokens = int(resp.UsageMetadata.CandidatesTokenCount)
	}
	dbg := takeDebug(ctx)
	if dbg != nil {
		dbg.Success = true
		dbg.ModelID = req.Model
	}
	return TextResponse{Content: text, Usage: usage, Debug: dbg}, nil
}

func (a *GeminiAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if strings.TrimSpace(a.apiKey) == "" {
		return media.TTSResponse{}, fmt.Errorf("gemini api_key is required")
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return media.TTSResponse{}, fmt.Errorf("text is required")
	}
	model := firstNonEmptyAI(strings.TrimSpace(req.Model), "gemini-3.1-flash-tts-preview")
	body := map[string]any{
		"model":           model,
		"input":           text,
		"response_format": map[string]any{"type": "audio"},
		"generation_config": map[string]any{
			"speech_config": geminiSpeechConfig(req),
		},
	}
	reqBody, err := json.Marshal(body)
	if err != nil {
		return media.TTSResponse{}, err
	}
	endpoint := a.baseURL + "/v1beta/interactions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("x-goog-api-key", a.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	headers := map[string]string{
		"x-goog-api-key": maskKey(a.apiKey),
		"Content-Type":   "application/json",
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactGeminiTTSBody(body)), LatencyMs: latency, Error: err.Error()})
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.TTSResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactGeminiTTSBody(body)), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("gemini TTS HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	var parsed geminiInteractionResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode gemini TTS response: %w", err)
	}
	audioB64 := firstNonEmptyAI(parsed.OutputAudio.Data, parsed.OutputAudio.InlineData.Data)
	if audioB64 == "" {
		return media.TTSResponse{}, fmt.Errorf("gemini TTS returned no output_audio data")
	}
	pcm, err := base64.StdEncoding.DecodeString(audioB64)
	if err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode gemini TTS audio: %w", err)
	}
	if len(pcm) == 0 {
		return media.TTSResponse{}, fmt.Errorf("gemini TTS returned empty audio")
	}
	sampleRate := intParamOrDefault(req.Params, "sample_rate", 24000)
	channels := intParamOrDefault(req.Params, "channels", 1)
	wav := pcmToWAV(pcm, sampleRate, channels, 16)
	return media.TTSResponse{
		Audio:       wav,
		MimeType:    "audio/wav",
		ProviderRef: firstNonEmptyAI(parsed.ID, parsed.Name),
	}, nil
}

func (a *GeminiAdapter) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	if strings.TrimSpace(a.apiKey) == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("gemini api_key is required")
	}
	if req.Kind != media.AudioGenerationKindMusic {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported gemini audio generation kind %q", req.Kind)
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("prompt is required")
	}
	model := firstNonEmptyAI(strings.TrimSpace(req.Model), "lyria-3-clip-preview")
	body := map[string]any{
		"model": model,
		"input": prompt,
		"response_format": map[string]any{
			"type": "audio",
		},
	}
	reqBody, err := json.Marshal(body)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	endpoint := a.baseURL + "/v1beta/interactions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	httpReq.Header.Set("x-goog-api-key", a.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	headers := map[string]string{
		"x-goog-api-key": maskKey(a.apiKey),
		"Content-Type":   "application/json",
	}
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(body), LatencyMs: latency, Error: err.Error()})
		return media.AudioGenerationResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.AudioGenerationResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(body), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return media.AudioGenerationResponse{}, fmt.Errorf("gemini Lyria HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	var parsed geminiInteractionResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return media.AudioGenerationResponse{}, fmt.Errorf("decode gemini Lyria response: %w", err)
	}
	audioB64, mimeType := geminiInteractionAudio(parsed)
	if audioB64 == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("gemini Lyria returned no output audio data")
	}
	audio, err := base64.StdEncoding.DecodeString(audioB64)
	if err != nil {
		return media.AudioGenerationResponse{}, fmt.Errorf("decode gemini Lyria audio: %w", err)
	}
	if len(audio) == 0 {
		return media.AudioGenerationResponse{}, fmt.Errorf("gemini Lyria returned empty audio")
	}
	return media.AudioGenerationResponse{
		Audio:       audio,
		MimeType:    firstNonEmptyAI(mimeType, geminiLyriaMimeType(req, model)),
		DurationMs:  geminiLyriaDurationMs(req, model),
		ProviderRef: firstNonEmptyAI(parsed.ID, parsed.Name),
	}, nil
}

func (a *GeminiAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	client, err := a.newClient(ctx)
	if err != nil {
		return ImageResponse{}, fmt.Errorf("gemini: create client: %w", err)
	}

	// Gemini Flash/Pro models (gemini-*) use GenerateContent with image output modality.
	// Imagen models (imagen-*) use the dedicated GenerateImages API.
	if strings.HasPrefix(req.Model, "gemini-") {
		return a.imageGenerateViaContent(ctx, client, req)
	}
	return a.imageGenerateViaImagen(ctx, client, req)
}

// imageGenerateViaContent generates an image using GenerateContent with responseModalities=IMAGE.
// Used for Gemini Flash/Pro models that support native image output.
func (a *GeminiAdapter) imageGenerateViaContent(ctx context.Context, client *genai.Client, req ImageRequest) (ImageResponse, error) {
	cfg := &genai.GenerateContentConfig{
		ResponseModalities: []string{"IMAGE", "TEXT"},
	}

	parts := make([]*genai.Part, 0, len(req.InputImageDataList)+2)
	if len(req.InputImageDataList) > 0 {
		for _, img := range req.InputImageDataList {
			if len(img.Bytes) == 0 {
				continue
			}
			mime := img.MimeType
			if mime == "" {
				mime = "image/png"
			}
			parts = append(parts, genai.NewPartFromBytes(img.Bytes, mime))
		}
	} else if len(req.InputImageBytes) > 0 {
		mime := req.InputImageMime
		if mime == "" {
			mime = "image/png"
		}
		parts = append(parts, genai.NewPartFromBytes(req.InputImageBytes, mime))
	} else if req.InputImage != "" {
		imgBytes, imgMime, fetchErr := fetchURLBytes(ctx, req.InputImage, "")
		if fetchErr != nil {
			return ImageResponse{}, fmt.Errorf("gemini image via content: fetch input image: %w", fetchErr)
		}
		if imgMime == "" {
			imgMime = "image/png"
		}
		parts = append(parts, genai.NewPartFromBytes(imgBytes, imgMime))
	}
	parts = append(parts, genai.NewPartFromText(req.Prompt))

	contents := []*genai.Content{genai.NewContentFromParts(parts, "user")}
	resp, err := client.Models.GenerateContent(ctx, req.Model, contents, cfg)
	if err != nil {
		return ImageResponse{}, fmt.Errorf("gemini image via content: %w", err)
	}
	if len(resp.Candidates) == 0 {
		return ImageResponse{}, fmt.Errorf("gemini image via content: no candidates returned")
	}
	var textParts []string
	for _, part := range resp.Candidates[0].Content.Parts {
		if part.InlineData != nil && strings.HasPrefix(part.InlineData.MIMEType, "image/") {
			mime := part.InlineData.MIMEType
			dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(part.InlineData.Data)
			dbg := takeDebug(ctx)
			if dbg != nil {
				dbg.Success = true
				dbg.ModelID = req.Model
			}
			return ImageResponse{URLs: []string{dataURL}, Debug: dbg}, nil
		}
		if part.Text != "" {
			textParts = append(textParts, part.Text)
		}
	}
	hint := ""
	if len(textParts) > 0 {
		t := strings.Join(textParts, " ")
		if len(t) > 200 {
			t = t[:200] + "..."
		}
		hint = "; model returned text instead: " + t
	}
	return ImageResponse{}, fmt.Errorf("gemini image via content: no image part in response (model %q may not support image output%s)", req.Model, hint)
}

// imageGenerateViaImagen generates an image using the Imagen GenerateImages API.
// Used for imagen-* models.
func (a *GeminiAdapter) imageGenerateViaImagen(ctx context.Context, client *genai.Client, req ImageRequest) (ImageResponse, error) {
	aspectRatio := req.AspectRatio
	if aspectRatio == "" {
		aspectRatio = "1:1"
	}
	cfg := &genai.GenerateImagesConfig{
		NumberOfImages: 1,
		AspectRatio:    aspectRatio,
	}

	resp, err := client.Models.GenerateImages(ctx, req.Model, req.Prompt, cfg)
	if err != nil {
		return ImageResponse{}, fmt.Errorf("gemini imagen: %w", err)
	}
	if len(resp.GeneratedImages) == 0 {
		return ImageResponse{}, fmt.Errorf("gemini imagen: no images returned")
	}

	img := resp.GeneratedImages[0].Image
	mime := img.MIMEType
	if mime == "" {
		mime = "image/png"
	}
	dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(img.ImageBytes)
	dbg := takeDebug(ctx)
	if dbg != nil {
		dbg.Success = true
		dbg.ModelID = req.Model
	}
	return ImageResponse{URLs: []string{dataURL}, Debug: dbg}, nil
}

func (a *GeminiAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 || startResp.TaskID == "" {
		return startResp, nil
	}

	// Legacy synchronous path for direct callers. The job worker uses
	// VideoStart/VideoPoll so submitted operation names are persisted first.
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, ctx.Err()
		case <-time.After(5 * time.Second):
		}

		pollResp, err := a.VideoPoll(ctx, VideoPollRequest{
			Model:    req.Model,
			TaskID:   startResp.TaskID,
			TaskKind: startResp.TaskKind,
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
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("gemini veo: operation timed out")
}

func (a *GeminiAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	client, err := a.newClient(ctx)
	if err != nil {
		return VideoResponse{}, fmt.Errorf("gemini: create client: %w", err)
	}

	cfg := &genai.GenerateVideosConfig{}
	if req.AspectRatio != "" {
		cfg.AspectRatio = req.AspectRatio
	}
	if req.Duration > 0 {
		dur := int32(req.Duration)
		cfg.DurationSeconds = &dur
	}

	refImage, err := geminiVideoReferenceImage(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}

	operation, err := client.Models.GenerateVideos(ctx, req.Model, req.Prompt, refImage, cfg)
	if err != nil {
		return VideoResponse{}, fmt.Errorf("gemini veo: start generation: %w", err)
	}
	if operation == nil || operation.Name == "" {
		return VideoResponse{}, fmt.Errorf("gemini veo: start generation returned no operation name")
	}
	status := VideoStatusSubmitted
	if operation.Done {
		resp, err := geminiVideoOperationResponse(ctx, operation, operation.Name, "generate_videos")
		if err != nil {
			return resp, err
		}
		return resp, nil
	}
	dbg := takeDebug(ctx)
	if dbg != nil {
		dbg.Success = true
		dbg.ModelID = req.Model
	}
	return VideoResponse{TaskID: operation.Name, TaskKind: "generate_videos", Status: status, Debug: dbg}, nil
}

func (a *GeminiAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if req.TaskID == "" {
		return VideoResponse{}, fmt.Errorf("gemini veo: operation name is required")
	}
	client, err := a.newClient(ctx)
	if err != nil {
		return VideoResponse{}, fmt.Errorf("gemini: create client: %w", err)
	}
	operation := &genai.GenerateVideosOperation{Name: req.TaskID}
	operation, err = client.Operations.GetVideosOperation(ctx, operation, nil)
	if err != nil {
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, fmt.Errorf("gemini veo: poll operation: %w", err)
	}
	if !operation.Done {
		dbg := takeDebug(ctx)
		if dbg != nil {
			dbg.Success = true
			dbg.ModelID = req.TaskID
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing, Debug: dbg}, nil
	}
	return geminiVideoOperationResponse(ctx, operation, req.TaskID, req.TaskKind)
}

func geminiVideoReferenceImage(ctx context.Context, req VideoRequest) (*genai.Image, error) {
	var imgBytes []byte
	var imgMime string
	if len(req.InputImageDataList) > 0 {
		imgBytes = req.InputImageDataList[0].Bytes
		imgMime = req.InputImageDataList[0].MimeType
	} else if req.Image != "" {
		var fetchErr error
		imgBytes, imgMime, fetchErr = fetchURLBytes(ctx, req.Image, "")
		if fetchErr != nil {
			return nil, fmt.Errorf("gemini veo: fetch reference image: %w", fetchErr)
		}
	}
	if len(imgBytes) == 0 {
		return nil, nil
	}
	return &genai.Image{ImageBytes: imgBytes, MIMEType: imgMime}, nil
}

func geminiVideoOperationResponse(ctx context.Context, operation *genai.GenerateVideosOperation, taskID, taskKind string) (VideoResponse, error) {
	dbg := takeDebug(ctx)
	if dbg != nil {
		dbg.ModelID = taskID
	}
	if len(operation.Error) > 0 {
		msg := fmt.Sprintf("%v", operation.Error)
		if dbg != nil {
			dbg.Success = false
			dbg.Error = msg
		}
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusFailed, Message: msg, Debug: dbg}, fmt.Errorf("gemini veo: operation failed: %s", msg)
	}
	if operation.Response == nil || len(operation.Response.GeneratedVideos) == 0 {
		msg := "operation done but no videos in response"
		if dbg != nil {
			dbg.Success = false
			dbg.Error = msg
		}
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusFailed, Message: msg, Debug: dbg}, fmt.Errorf("gemini veo: %s", msg)
	}
	video := operation.Response.GeneratedVideos[0].Video
	if video == nil {
		msg := "nil video in response"
		if dbg != nil {
			dbg.Success = false
			dbg.Error = msg
		}
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusFailed, Message: msg, Debug: dbg}, fmt.Errorf("gemini veo: %s", msg)
	}
	if dbg != nil {
		dbg.Success = true
	}
	if video.URI != "" {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, URL: video.URI, Debug: dbg}, nil
	}
	if len(video.VideoBytes) > 0 {
		return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusSucceeded, ContentBytes: video.VideoBytes, Debug: dbg}, nil
	}
	msg := "video response has no URI or bytes"
	if dbg != nil {
		dbg.Success = false
		dbg.Error = msg
	}
	return VideoResponse{TaskID: taskID, TaskKind: taskKind, Status: VideoStatusFailed, Message: msg, Debug: dbg}, fmt.Errorf("gemini veo: %s", msg)
}

func (a *GeminiAdapter) Ping(ctx context.Context) error {
	if a.apiKey == "" {
		return fmt.Errorf("gemini: api_key is required")
	}
	client, err := a.newClient(ctx)
	if err != nil {
		return fmt.Errorf("gemini: create client: %w", err)
	}
	_, err = client.Models.List(ctx, nil)
	return err
}

// FetchModels returns all model IDs available via the Gemini API.
func (a *GeminiAdapter) FetchModels(ctx context.Context) ([]string, error) {
	client, err := a.newClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("gemini: create client: %w", err)
	}
	var ids []string
	for m, err := range client.Models.All(ctx) {
		if err != nil {
			break
		}
		name := m.Name
		if len(name) > 7 && name[:7] == "models/" {
			name = name[7:]
		}
		ids = append(ids, name)
	}
	return ids, nil
}

type geminiInteractionResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	OutputAudio struct {
		Data       string `json:"data"`
		MimeType   string `json:"mime_type"`
		InlineData struct {
			Data     string `json:"data"`
			MimeType string `json:"mime_type"`
		} `json:"inline_data"`
	} `json:"output_audio"`
	Outputs []struct {
		Text       string `json:"text"`
		InlineData struct {
			Data     string `json:"data"`
			MimeType string `json:"mime_type"`
		} `json:"inline_data"`
	} `json:"outputs"`
}

func geminiInteractionAudio(resp geminiInteractionResponse) (dataB64, mimeType string) {
	if resp.OutputAudio.Data != "" {
		return resp.OutputAudio.Data, resp.OutputAudio.MimeType
	}
	if resp.OutputAudio.InlineData.Data != "" {
		return resp.OutputAudio.InlineData.Data, resp.OutputAudio.InlineData.MimeType
	}
	for _, output := range resp.Outputs {
		if output.InlineData.Data != "" {
			return output.InlineData.Data, output.InlineData.MimeType
		}
	}
	return "", ""
}

func geminiLyriaMimeType(req media.AudioGenerationRequest, model string) string {
	format := strings.ToLower(firstNonEmptyAI(strings.TrimSpace(req.AudioFormat), stringParam(req.Params, "output_format", "")))
	switch format {
	case "wav":
		return "audio/wav"
	case "mp3", "":
		return "audio/mpeg"
	default:
		if strings.HasPrefix(format, "audio/") {
			return format
		}
	}
	if strings.Contains(strings.ToLower(model), "lyria") {
		return "audio/mpeg"
	}
	return "application/octet-stream"
}

func geminiLyriaDurationMs(req media.AudioGenerationRequest, model string) int {
	if req.DurationSec > 0 {
		return req.DurationSec * 1000
	}
	if strings.Contains(strings.ToLower(model), "clip") {
		return 30 * 1000
	}
	return 0
}

func geminiSpeechConfig(req media.TTSRequest) []map[string]any {
	if raw, ok := req.Params["speakers"]; ok {
		if speakers := geminiSpeakerConfigs(raw); len(speakers) > 0 {
			return speakers
		}
	}
	return []map[string]any{{
		"voice": firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "Kore")),
	}}
}

func geminiSpeakerConfigs(raw any) []map[string]any {
	var items []any
	switch v := raw.(type) {
	case []any:
		items = v
	case []map[string]any:
		items = make([]any, 0, len(v))
		for _, item := range v {
			items = append(items, item)
		}
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		if err := json.Unmarshal([]byte(v), &items); err != nil {
			return nil
		}
	default:
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		speaker := stringParam(m, "speaker", "")
		voice := stringParam(m, "voice", "")
		if speaker == "" || voice == "" {
			continue
		}
		out = append(out, map[string]any{"speaker": speaker, "voice": voice})
	}
	return out
}

func pcmToWAV(pcm []byte, sampleRate, channels, bitsPerSample int) []byte {
	if sampleRate <= 0 {
		sampleRate = 24000
	}
	if channels <= 0 {
		channels = 1
	}
	if bitsPerSample <= 0 {
		bitsPerSample = 16
	}
	dataSize := len(pcm)
	blockAlign := channels * bitsPerSample / 8
	byteRate := sampleRate * blockAlign
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(36+dataSize))
	out.WriteString("WAVE")
	out.WriteString("fmt ")
	_ = binary.Write(&out, binary.LittleEndian, uint32(16))
	_ = binary.Write(&out, binary.LittleEndian, uint16(1))
	_ = binary.Write(&out, binary.LittleEndian, uint16(channels))
	_ = binary.Write(&out, binary.LittleEndian, uint32(sampleRate))
	_ = binary.Write(&out, binary.LittleEndian, uint32(byteRate))
	_ = binary.Write(&out, binary.LittleEndian, uint16(blockAlign))
	_ = binary.Write(&out, binary.LittleEndian, uint16(bitsPerSample))
	out.WriteString("data")
	_ = binary.Write(&out, binary.LittleEndian, uint32(dataSize))
	out.Write(pcm)
	return out.Bytes()
}

func redactGeminiTTSBody(body map[string]any) map[string]any {
	out := cloneProviderTemplateMap(body)
	if text, ok := out["input"].(string); ok {
		out["input"] = truncateDebugString(text, 240)
	}
	return out
}
