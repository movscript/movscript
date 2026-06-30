package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"
)

const doubao2APIDefaultBaseURL = "http://127.0.0.1:9090/v1"

// Doubao2APIAdapter calls a locally running doubao2api service.
//
// doubao2api exposes OpenAI-like image generation but uses a custom
// /video/generations endpoint. This adapter intentionally advertises only
// image and text-to-video capabilities.
type Doubao2APIAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewDoubao2APIAdapter(apiKey, baseURL string) *Doubao2APIAdapter {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = doubao2APIDefaultBaseURL
	}
	return &Doubao2APIAdapter{
		APIKey:  strings.TrimSpace(apiKey),
		BaseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{},
	}
}

func (a *Doubao2APIAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("doubao2api adapter supports image and video generation only")
}

func (a *Doubao2APIAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	model := firstNonEmptyAI(req.Model, "doubao-image")
	body := map[string]any{
		"model":  model,
		"prompt": strings.TrimSpace(req.Prompt),
	}
	if body["prompt"] == "" {
		return ImageResponse{}, fmt.Errorf("doubao2api image generation requires prompt")
	}
	if req.N > 0 {
		body["n"] = req.N
	}
	if ratio := doubao2APIRatio(firstNonEmptyAI(req.AspectRatio, req.Size)); ratio != "" {
		body["ratio"] = ratio
	} else if strings.TrimSpace(req.Size) != "" {
		body["size"] = strings.TrimSpace(req.Size)
	}

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/images/generations"
	respBody, status, latency, err := a.postJSON(ctx, endpoint, body)
	a.recordDebug(ctx, model, endpoint, http.MethodPost, body, respBody, status, latency, err)
	if err != nil {
		return ImageResponse{}, err
	}
	if status >= 400 {
		return ImageResponse{}, fmt.Errorf("doubao2api image generation HTTP %d: %s", status, string(respBody))
	}
	var raw struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		OutputFormat string `json:"output_format"`
	}
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return ImageResponse{}, fmt.Errorf("decode doubao2api image response (got: %.120s): %w", string(respBody), err)
	}
	urls := make([]string, 0, len(raw.Data))
	for _, item := range raw.Data {
		if result := openAIImageResult(item.URL, item.B64JSON, raw.OutputFormat); result != "" {
			urls = append(urls, result)
		}
	}
	if len(urls) == 0 {
		return ImageResponse{}, fmt.Errorf("doubao2api image response did not include image URLs")
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func (a *Doubao2APIAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	model := firstNonEmptyAI(req.Model, "doubao-video")
	body := map[string]any{
		"model":  model,
		"prompt": strings.TrimSpace(req.Prompt),
	}
	if body["prompt"] == "" {
		return VideoResponse{}, fmt.Errorf("doubao2api video generation requires prompt")
	}
	if ratio := doubao2APIRatio(firstNonEmptyAI(req.AspectRatio, req.Ratio, req.Size)); ratio != "" {
		body["ratio"] = ratio
	}
	if req.Duration > 0 {
		body["duration"] = req.Duration
	}
	if refImageKey, err := a.doubao2APIReferenceImageKey(ctx, req); err != nil {
		return VideoResponse{}, err
	} else if refImageKey != "" {
		body["ref_image_key"] = refImageKey
	}

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/video/generations"
	respBody, status, latency, err := a.postJSON(ctx, endpoint, body)
	a.recordDebug(ctx, model, endpoint, http.MethodPost, body, respBody, status, latency, err)
	if err != nil {
		return VideoResponse{}, err
	}
	if status >= 400 {
		return VideoResponse{}, fmt.Errorf("doubao2api video generation HTTP %d: %s", status, string(respBody))
	}
	var raw struct {
		Data []struct {
			VideoURL string  `json:"video_url"`
			URL      string  `json:"url"`
			Duration float64 `json:"duration"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return VideoResponse{}, fmt.Errorf("decode doubao2api video response (got: %.120s): %w", string(respBody), err)
	}
	for _, item := range raw.Data {
		videoURL := firstNonEmptyAI(item.VideoURL, item.URL)
		if videoURL == "" {
			continue
		}
		durationSec := int(item.Duration)
		if durationSec <= 0 {
			durationSec = req.Duration
		}
		return VideoResponse{
			Status:      VideoStatusSucceeded,
			URL:         videoURL,
			DurationSec: durationSec,
			Debug:       takeDebug(ctx),
		}, nil
	}
	if strings.TrimSpace(raw.Message) != "" {
		return VideoResponse{}, fmt.Errorf("doubao2api video generation returned no video: %s", strings.TrimSpace(raw.Message))
	}
	return VideoResponse{}, fmt.Errorf("doubao2api video response did not include video URLs")
}

func (a *Doubao2APIAdapter) Ping(ctx context.Context) error {
	healthURL := doubao2APIHealthURL(a.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return err
	}
	a.addAuth(httpReq)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("doubao2api health HTTP %d: %s", resp.StatusCode, string(body))
	}
	var result struct {
		Status   string `json:"status"`
		LoggedIn bool   `json:"logged_in"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("decode doubao2api health response: %w", err)
	}
	if !result.LoggedIn {
		return fmt.Errorf("doubao2api is not logged in (status=%s)", firstNonEmptyAI(result.Status, "unknown"))
	}
	return nil
}

func (a *Doubao2APIAdapter) postJSON(ctx context.Context, endpoint string, body map[string]any) ([]byte, int, int64, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, 0, 0, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	a.addAuth(httpReq)
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return nil, 0, latency, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return respBody, resp.StatusCode, latency, readErr
	}
	return respBody, resp.StatusCode, latency, nil
}

func (a *Doubao2APIAdapter) doubao2APIReferenceImageKey(ctx context.Context, req VideoRequest) (string, error) {
	for _, media := range req.InputImageDataList {
		if len(media.Bytes) > 0 {
			return a.doubao2APIUploadImage(ctx, media.Bytes, media.MimeType, "")
		}
		if ref := strings.TrimSpace(media.PresignedURL); ref != "" {
			return a.doubao2APIReferenceFromString(ctx, ref, media.MimeType)
		}
	}
	if ref := strings.TrimSpace(req.Image); ref != "" {
		return a.doubao2APIReferenceFromString(ctx, ref, "")
	}
	for _, ref := range req.InputImages {
		if key, err := a.doubao2APIReferenceFromString(ctx, ref, ""); err != nil || key != "" {
			return key, err
		}
	}
	return "", nil
}

func (a *Doubao2APIAdapter) doubao2APIReferenceFromString(ctx context.Context, ref, fallbackMime string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", nil
	}
	if doubao2APIIsUploadedImageKey(ref) {
		return ref, nil
	}
	if strings.HasPrefix(ref, "data:") {
		data, mimeType, err := doubao2APIDecodeDataURL(ref)
		if err != nil {
			return "", err
		}
		if mimeType == "" {
			mimeType = firstNonEmptyAI(fallbackMime, "image/png")
		}
		return a.doubao2APIUploadImage(ctx, data, mimeType, "")
	}
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		data, mimeType, err := fetchURLBytes(ctx, ref, "")
		if err != nil {
			return "", fmt.Errorf("fetch doubao2api reference image: %w", err)
		}
		mimeType = firstNonEmptyAI(fallbackMime, mimeType, "image/png")
		return a.doubao2APIUploadImage(ctx, data, mimeType, "")
	}
	if strings.HasPrefix(ref, "asset://") {
		return "", fmt.Errorf("doubao2api image-to-video requires image bytes or a public image URL, got local asset reference %q", ref)
	}
	return "", fmt.Errorf("unsupported doubao2api reference image %q", ref)
}

func (a *Doubao2APIAdapter) doubao2APIUploadImage(ctx context.Context, data []byte, mimeType, filename string) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("doubao2api reference image is empty")
	}
	mimeType = strings.TrimSpace(mimeType)
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	if !strings.HasPrefix(strings.ToLower(mimeType), "image/") {
		mimeType = "image/png"
	}
	if strings.TrimSpace(filename) == "" {
		filename = "reference." + imageExtFromMime(mimeType)
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, doubao2APISafeFilename(filename)))
	partHeader.Set("Content-Type", mimeType)
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(data); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/images/upload"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	a.addAuth(httpReq)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return "", readErr
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("doubao2api image upload HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	key := doubao2APIUploadKey(respBody)
	if key == "" {
		return "", fmt.Errorf("doubao2api image upload response did not include uri/key")
	}
	return key, nil
}

func (a *Doubao2APIAdapter) addAuth(req *http.Request) {
	if strings.TrimSpace(a.APIKey) != "" {
		req.Header.Set("Authorization", "Bearer "+a.APIKey)
	}
}

func (a *Doubao2APIAdapter) recordDebug(ctx context.Context, model, endpoint, method string, requestBody map[string]any, responseBody []byte, status int, latency int64, err error) {
	result := DebugCallResult{
		Success:        err == nil && status < 400,
		ModelID:        model,
		Endpoint:       endpoint,
		Method:         method,
		RequestHeaders: a.debugHeaders(),
		RequestBody:    mustJSON(requestBody),
		ResponseStatus: status,
		ResponseBody:   string(responseBody),
		LatencyMs:      latency,
	}
	if err != nil {
		result.Error = err.Error()
	}
	recordDebug(ctx, result)
}

func (a *Doubao2APIAdapter) debugHeaders() map[string]string {
	headers := map[string]string{"Content-Type": "application/json"}
	if strings.TrimSpace(a.APIKey) != "" {
		headers["Authorization"] = "Bearer " + maskKey(a.APIKey)
	}
	return headers
}

func doubao2APIUploadKey(respBody []byte) string {
	var raw map[string]any
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return ""
	}
	return firstNonEmptyAI(
		doubao2APIStringField(raw, "uri"),
		doubao2APIStringField(raw, "key"),
		doubao2APIStringField(doubao2APIMapField(raw, "data"), "uri"),
		doubao2APIStringField(doubao2APIMapField(raw, "data"), "key"),
	)
}

func doubao2APIStringField(raw map[string]any, key string) string {
	if raw == nil {
		return ""
	}
	value, _ := raw[key].(string)
	return strings.TrimSpace(value)
}

func doubao2APIMapField(raw map[string]any, key string) map[string]any {
	if raw == nil {
		return nil
	}
	value, _ := raw[key].(map[string]any)
	return value
}

func doubao2APIIsUploadedImageKey(ref string) bool {
	ref = strings.TrimSpace(ref)
	return strings.HasPrefix(ref, "tos-") || strings.HasPrefix(ref, "ocean-cloud-tos/")
}

func doubao2APIDecodeDataURL(ref string) ([]byte, string, error) {
	meta, data, ok := strings.Cut(ref, ",")
	if !ok || !strings.HasPrefix(meta, "data:") {
		return nil, "", fmt.Errorf("invalid data URL reference image")
	}
	if !strings.Contains(strings.ToLower(meta), ";base64") {
		return nil, "", fmt.Errorf("doubao2api data URL reference image must be base64 encoded")
	}
	mimeType := strings.TrimPrefix(meta, "data:")
	if idx := strings.Index(mimeType, ";"); idx >= 0 {
		mimeType = mimeType[:idx]
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, "", fmt.Errorf("decode doubao2api data URL reference image: %w", err)
	}
	return decoded, strings.TrimSpace(mimeType), nil
}

func doubao2APISafeFilename(filename string) string {
	filename = strings.TrimSpace(filename)
	filename = strings.ReplaceAll(filename, `"`, "")
	filename = strings.ReplaceAll(filename, "\r", "")
	filename = strings.ReplaceAll(filename, "\n", "")
	if filename == "" {
		return "reference.png"
	}
	return filename
}

func doubao2APIRatio(value string) string {
	value = strings.TrimSpace(value)
	switch value {
	case "1:1", "16:9", "9:16", "4:3", "3:4":
		return value
	case "1024x1024":
		return "1:1"
	case "1792x1024", "1280x720":
		return "16:9"
	case "1024x1792", "720x1280":
		return "9:16"
	case "1024x768":
		return "4:3"
	case "768x1024":
		return "3:4"
	default:
		return ""
	}
}

func doubao2APIHealthURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/v1") {
		return strings.TrimSuffix(baseURL, "/v1") + "/health"
	}
	return baseURL + "/health"
}
