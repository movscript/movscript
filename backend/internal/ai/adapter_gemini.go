package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

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
}

func NewGeminiAdapter(apiKey, baseURL string) *GeminiAdapter {
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}
	return &GeminiAdapter{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
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

	// Build optional reference image.
	var refImage *genai.Image
	var imgBytes []byte
	var imgMime string
	if len(req.InputImageDataList) > 0 {
		imgBytes = req.InputImageDataList[0].Bytes
		imgMime = req.InputImageDataList[0].MimeType
	} else if req.Image != "" {
		var fetchErr error
		imgBytes, imgMime, fetchErr = fetchURLBytes(ctx, req.Image, "")
		if fetchErr != nil {
			return VideoResponse{}, fmt.Errorf("gemini veo: fetch reference image: %w", fetchErr)
		}
	}
	if len(imgBytes) > 0 {
		refImage = &genai.Image{ImageBytes: imgBytes, MIMEType: imgMime}
	}

	operation, err := client.Models.GenerateVideos(ctx, req.Model, req.Prompt, refImage, cfg)
	if err != nil {
		return VideoResponse{}, fmt.Errorf("gemini veo: start generation: %w", err)
	}

	// Poll until done (5s intervals, up to 5 minutes).
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{}, ctx.Err()
		case <-time.After(5 * time.Second):
		}

		operation, err = client.Operations.GetVideosOperation(ctx, operation, nil)
		if err != nil {
			return VideoResponse{}, fmt.Errorf("gemini veo: poll operation: %w", err)
		}
		if !operation.Done {
			continue
		}

		if operation.Response == nil || len(operation.Response.GeneratedVideos) == 0 {
			return VideoResponse{}, fmt.Errorf("gemini veo: operation done but no videos in response")
		}
		video := operation.Response.GeneratedVideos[0].Video
		if video == nil {
			return VideoResponse{}, fmt.Errorf("gemini veo: nil video in response")
		}
		dbg := takeDebug(ctx)
		if dbg != nil {
			dbg.Success = true
			dbg.ModelID = req.Model
		}
		return VideoResponse{URL: video.URI, Debug: dbg}, nil
	}
	return VideoResponse{}, fmt.Errorf("gemini veo: operation timed out")
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
