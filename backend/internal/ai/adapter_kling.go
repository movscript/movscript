package ai

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// KlingAdapter handles Kling (可灵) API with HMAC-SHA256 JWT auth.
type KlingAdapter struct {
	AccessKey string
	SecretKey string
	BaseURL   string
	client    *http.Client
}

func NewKlingAdapter(accessKey, secretKey string) *KlingAdapter {
	return &KlingAdapter{
		AccessKey: accessKey,
		SecretKey: secretKey,
		BaseURL:   "https://api.klingai.com",
		client:    &http.Client{},
	}
}

func (a *KlingAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("kling does not support text generation")
}

func (a *KlingAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	body := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
	}
	var result struct {
		Data struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := a.post(ctx, "/v1/images/generations", body, &result); err != nil {
		return ImageResponse{}, err
	}
	return ImageResponse{URLs: []string{result.Data.TaskID}, Debug: takeDebug(ctx)}, nil
}

func (a *KlingAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	return a.VideoStart(ctx, req)
}

func (a *KlingAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	// Resolve image input: prefer presigned URL, fall back to base64-encoded bytes.
	if len(req.InputImageDataList) > 0 && req.Image == "" {
		img := req.InputImageDataList[0]
		if img.PresignedURL != "" {
			req.Image = img.PresignedURL
		} else if len(img.Bytes) > 0 {
			// No public URL available (e.g. local MinIO); send raw bytes as base64.
			req.Image = "base64:" + base64.StdEncoding.EncodeToString(img.Bytes)
		}
	}
	if req.Image != "" {
		return a.imageToVideo(ctx, req)
	}
	return a.textToVideo(ctx, req)
}

func (a *KlingAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	taskKind := req.TaskKind
	if taskKind == "" {
		taskKind = "text2video"
	}
	paths := []string{fmt.Sprintf("/v1/videos/%s/%s", taskKind, req.TaskID)}
	// Some OpenAI-compatible gateways expose a flat task endpoint.
	if taskKind != "" {
		paths = append(paths, "/v1/videos/"+req.TaskID)
	}

	var lastErr error
	for _, path := range paths {
		resp, err := a.pollVideoPath(ctx, req, path)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !strings.Contains(err.Error(), "API error 404") {
			break
		}
	}
	return VideoResponse{TaskID: req.TaskID, TaskKind: taskKind}, lastErr
}

func (a *KlingAdapter) textToVideo(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	body := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
	}
	if req.Duration > 0 {
		body["duration"] = req.Duration
	}
	if req.AspectRatio != "" {
		body["aspect_ratio"] = req.AspectRatio
	}
	var result struct {
		Data struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := a.post(ctx, "/v1/videos/text2video", body, &result); err != nil {
		return VideoResponse{}, err
	}
	return VideoResponse{TaskID: result.Data.TaskID, TaskKind: "text2video", Status: VideoStatusSubmitted, Debug: takeDebug(ctx)}, nil
}

func (a *KlingAdapter) imageToVideo(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	body := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
	}
	// Kling accepts either "image" (URL) or "image_base64" (raw base64 string).
	if strings.HasPrefix(req.Image, "base64:") {
		body["image_base64"] = strings.TrimPrefix(req.Image, "base64:")
	} else {
		body["image"] = req.Image
	}
	if req.Duration > 0 {
		body["duration"] = req.Duration
	}
	if req.AspectRatio != "" {
		body["aspect_ratio"] = req.AspectRatio
	}
	var result struct {
		Data struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := a.post(ctx, "/v1/videos/image2video", body, &result); err != nil {
		return VideoResponse{}, err
	}
	return VideoResponse{TaskID: result.Data.TaskID, TaskKind: "image2video", Status: VideoStatusSubmitted, Debug: takeDebug(ctx)}, nil
}

func (a *KlingAdapter) pollVideoPath(ctx context.Context, req VideoPollRequest, path string) (VideoResponse, error) {
	var result map[string]any
	if err := a.get(ctx, path, req.TaskID, &result); err != nil {
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, err
	}

	data := result
	if nested, ok := result["data"].(map[string]any); ok {
		data = nested
	}
	status := stringField(data, "task_status", "status")
	normalized := normalizeVideoStatus(status)
	videoURL := deepStringField(data, "url", "video_url", "output_url", "result_url", "download_url")

	switch normalized {
	case VideoStatusSucceeded:
		if videoURL == "" {
			return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: "task succeeded but no video URL in response", Debug: takeDebug(ctx)}, fmt.Errorf("task succeeded but no video URL in response")
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
	case VideoStatusFailed:
		msg := videoTaskErrorMessage(data)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", req.TaskID, msg)
	default:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: normalized, Debug: takeDebug(ctx)}, nil
	}
}

// BuildJWT creates a short-lived HMAC-SHA256 JWT for Kling API auth.
func (a *KlingAdapter) BuildJWT() string {
	now := time.Now().Unix()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"iss":"%s","exp":%d,"nbf":%d}`, a.AccessKey, now+1800, now-5,
	)))
	sig := hmac.New(sha256.New, []byte(a.SecretKey))
	sig.Write([]byte(header + "." + payload))
	signature := base64.RawURLEncoding.EncodeToString(sig.Sum(nil))
	return strings.Join([]string{header, payload, signature}, ".")
}

// Ping verifies Kling credentials by listing recent tasks (free, no generation).
func (a *KlingAdapter) Ping(ctx context.Context) error {
	if a.AccessKey == "" || a.SecretKey == "" {
		return fmt.Errorf("kling credentials incomplete: access_key and secret_key required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		a.BaseURL+"/v1/videos/text2video?pageNum=1&pageSize=1", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.BuildJWT())
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errBody map[string]any
		json.NewDecoder(resp.Body).Decode(&errBody)
		return fmt.Errorf("API error %d: %v", resp.StatusCode, errBody)
	}
	return nil
}

func (a *KlingAdapter) post(ctx context.Context, path string, body any, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	endpoint := a.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	if err != nil {
		return err
	}
	token := a.BuildJWT()
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + maskKey(token),
	}
	// Extract model ID from body for debug context.
	modelID := ""
	if m, ok := body.(map[string]any); ok {
		if v, ok := m["model"]; ok {
			modelID, _ = v.(string)
		}
	}
	start := time.Now()
	resp, err := a.client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: modelID, Endpoint: endpoint, Method: "POST",
			RequestHeaders: headers, RequestBody: string(b),
			LatencyMs: latency, Error: err.Error(),
		})
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: modelID,
		Endpoint: endpoint, Method: "POST",
		RequestHeaders: headers, RequestBody: string(b),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		var errBody map[string]any
		json.Unmarshal(respBody, &errBody)
		return fmt.Errorf("API error %d: %v", resp.StatusCode, errBody)
	}
	return json.Unmarshal(respBody, out)
}

func (a *KlingAdapter) get(ctx context.Context, path string, modelID string, out any) error {
	endpoint := a.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	token := a.BuildJWT()
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + maskKey(token),
	}
	start := time.Now()
	resp, err := a.client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			ModelID: modelID, Endpoint: endpoint, Method: "GET",
			RequestHeaders: headers,
			LatencyMs:      latency, Error: err.Error(),
		})
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: modelID,
		Endpoint: endpoint, Method: "GET",
		RequestHeaders: headers,
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		var errBody map[string]any
		json.Unmarshal(respBody, &errBody)
		return fmt.Errorf("API error %d: %v", resp.StatusCode, errBody)
	}
	return json.Unmarshal(respBody, out)
}
