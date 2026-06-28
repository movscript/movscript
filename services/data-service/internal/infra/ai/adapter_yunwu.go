package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// YunwuUnifiedVideoAdapter implements Yunwu's native JSON video task endpoints.
type YunwuUnifiedVideoAdapter struct {
	BaseURL string
	APIKey  string
	openai  *OpenAIAdapter
	rawHTTP *http.Client
}

func NewYunwuUnifiedVideoAdapter(apiKey, baseURL string) *YunwuUnifiedVideoAdapter {
	baseURL = normalizeYunwuBaseURL(baseURL)
	return &YunwuUnifiedVideoAdapter{
		BaseURL: baseURL,
		APIKey:  apiKey,
		openai:  NewOpenAIAdapter(baseURL, apiKey),
		rawHTTP: &http.Client{},
	}
}

func (a *YunwuUnifiedVideoAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	return a.openai.TextGenerate(ctx, req)
}

func (a *YunwuUnifiedVideoAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	return a.openai.ImageGenerate(ctx, req)
}

func (a *YunwuUnifiedVideoAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return startResp, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 {
		return startResp, nil
	}
	for i := 0; i < 180; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, ctx.Err()
		case <-time.After(5 * time.Second):
		}
		pollResp, err := a.VideoPoll(ctx, VideoPollRequest{Model: req.Model, TaskID: startResp.TaskID, TaskKind: startResp.TaskKind})
		if err != nil {
			return pollResp, err
		}
		if pollResp.Status == VideoStatusSucceeded {
			return pollResp, nil
		}
		if pollResp.Status == VideoStatusFailed || pollResp.Status == VideoStatusCancelled {
			return pollResp, fmt.Errorf("yunwu video task %s failed: %s", startResp.TaskID, firstNonEmptyAI(pollResp.Message, "video generation failed"))
		}
	}
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("yunwu video generation timed out")
}

func (a *YunwuUnifiedVideoAdapter) Ping(ctx context.Context) error {
	return a.openai.Ping(ctx)
}

func (a *YunwuUnifiedVideoAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	imageURLs, err := yunwuVideoImageURLs(req)
	if err != nil {
		return VideoResponse{}, err
	}
	if len(imageURLs) == 0 {
		return a.openai.VideoStart(ctx, req)
	}

	body := map[string]any{
		"model":        req.Model,
		"prompt":       req.Prompt,
		"aspect_ratio": firstNonEmptyAI(req.AspectRatio, req.Ratio, "1:1"),
		"size":         yunwuVideoSize(req),
		"images":       imageURLs,
	}
	endpoint := strings.TrimRight(a.BaseURL, "/") + "/video/create"
	respBody, status, latency, err := a.postJSON(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: a.debugHeaders(), RequestBody: mustJSON(body), ResponseStatus: status, ResponseBody: string(respBody),
			LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{}, err
	}
	recordDebug(ctx, DebugCallResult{
		Success: status < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: a.debugHeaders(), RequestBody: mustJSON(body), ResponseStatus: status, ResponseBody: string(respBody),
		LatencyMs: latency,
	})
	if status >= 400 {
		return VideoResponse{}, fmt.Errorf("yunwu video create API error %d: %s", status, string(respBody))
	}
	var raw map[string]any
	if err := jsonUnmarshal(respBody, &raw); err != nil {
		return VideoResponse{}, fmt.Errorf("decode yunwu video create response (got: %.120s): %w", string(respBody), err)
	}
	taskID := firstNonEmptyAI(
		stringField(raw, "id", "task_id", "request_id"),
		nestedStringField(raw, "data", "id"),
		nestedStringField(raw, "data", "task_id"),
	)
	videoURL := yunwuVideoURL(raw)
	if videoURL != "" {
		return VideoResponse{TaskID: taskID, TaskKind: "yunwu_video", Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
	}
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("yunwu video create response did not include task id")
	}
	statusText := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status"), nestedStringField(raw, "data", "status")))
	return VideoResponse{TaskID: taskID, TaskKind: "yunwu_video", Status: firstNonEmptyAI(statusText, VideoStatusSubmitted), Debug: takeDebug(ctx)}, nil
}

func (a *YunwuUnifiedVideoAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	endpoint := strings.TrimRight(a.BaseURL, "/") + "/video/query"
	u, err := url.Parse(endpoint)
	if err != nil {
		return VideoResponse{}, err
	}
	q := u.Query()
	q.Set("id", req.TaskID)
	u.RawQuery = q.Encode()

	respBody, status, latency, err := a.doJSON(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: u.String(), Method: http.MethodGet,
			RequestHeaders: a.debugHeaders(), ResponseStatus: status, ResponseBody: string(respBody), LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{}, err
	}
	recordDebug(ctx, DebugCallResult{
		Success: status < 400, ModelID: req.Model, Endpoint: u.String(), Method: http.MethodGet,
		RequestHeaders: a.debugHeaders(), ResponseStatus: status, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if status >= 400 {
		return VideoResponse{}, fmt.Errorf("yunwu video query API error %d: %s", status, string(respBody))
	}
	var raw map[string]any
	if err := jsonUnmarshal(respBody, &raw); err != nil {
		return VideoResponse{}, fmt.Errorf("decode yunwu video query response (got: %.120s): %w", string(respBody), err)
	}
	taskID := firstNonEmptyAI(req.TaskID, stringField(raw, "id", "task_id"), nestedStringField(raw, "data", "id"))
	statusText := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status", "state"), nestedStringField(raw, "data", "status"), nestedStringField(raw, "data", "state")))
	videoURL := yunwuVideoURL(raw)
	switch statusText {
	case VideoStatusSucceeded:
		if videoURL == "" {
			msg := "yunwu video task succeeded but no video URL in response"
			return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("%s", msg)
		}
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
	case VideoStatusFailed, VideoStatusCancelled:
		msg := firstNonEmptyAI(videoTaskErrorMessage(raw), nestedStringField(raw, "data", "message"), "video generation failed")
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: statusText, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("yunwu video task %s failed: %s", taskID, msg)
	default:
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: statusText, Debug: takeDebug(ctx)}, nil
	}
}

func (a *YunwuUnifiedVideoAdapter) postJSON(ctx context.Context, method, endpoint string, body map[string]any) ([]byte, int, int64, error) {
	rawBody, _ := json.Marshal(body)
	return a.doJSON(ctx, method, endpoint, rawBody)
}

func (a *YunwuUnifiedVideoAdapter) doJSON(ctx context.Context, method, endpoint string, rawBody []byte) ([]byte, int, int64, error) {
	var reader io.Reader
	if rawBody != nil {
		reader = bytes.NewReader(rawBody)
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, 0, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	start := time.Now()
	resp, err := a.rawHTTP.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return nil, 0, latency, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, latency, nil
}

func (a *YunwuUnifiedVideoAdapter) debugHeaders() map[string]string {
	return map[string]string{
		"Content-Type":  "application/json",
		"Accept":        "application/json",
		"Authorization": "Bearer " + maskKey(a.APIKey),
	}
}

func normalizeYunwuBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "https://yunwu.ai/v1"
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return baseURL
	}
	path := strings.TrimRight(parsed.Path, "/")
	if path == "" {
		parsed.Path = "/v1"
	}
	return strings.TrimRight(parsed.String(), "/")
}

func yunwuVideoImageURLs(req VideoRequest) ([]string, error) {
	var urls []string
	appendURL := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || !isHTTPURL(value) || hasString(urls, value) {
			return
		}
		urls = append(urls, value)
	}
	appendURL(req.Image)
	for _, image := range req.InputImages {
		appendURL(image)
	}
	missingPublicURL := false
	for _, data := range req.InputImageDataList {
		if strings.TrimSpace(data.PresignedURL) != "" {
			appendURL(data.PresignedURL)
		} else if len(data.Bytes) > 0 {
			missingPublicURL = true
		}
	}
	if missingPublicURL && len(urls) == 0 {
		return nil, fmt.Errorf("yunwu video generation requires public image URLs; configure a public cloud file relay for reference images")
	}
	return urls, nil
}

func yunwuVideoSize(req VideoRequest) string {
	size := firstNonEmptyAI(req.Size, req.ResolutionName, "720P")
	size = strings.ToUpper(strings.TrimSpace(size))
	if size == "720" {
		return "720P"
	}
	if size == "1080" {
		return "1080P"
	}
	return size
}

func yunwuVideoURL(raw map[string]any) string {
	if raw == nil {
		return ""
	}
	candidates := []string{
		stringField(raw, "url", "video_url", "output_url", "result_url"),
		nestedStringField(raw, "data", "url"),
		nestedStringField(raw, "data", "video_url"),
		nestedStringField(raw, "data", "output_url"),
		nestedStringField(raw, "data", "result_url"),
		nestedStringField(raw, "data", "video", "url"),
		nestedStringField(raw, "video", "url"),
	}
	for _, candidate := range candidates {
		if strings.TrimSpace(candidate) != "" {
			return candidate
		}
	}
	for _, key := range []string{"videos", "urls", "outputs", "output"} {
		if value := firstURLFromAny(raw[key]); value != "" {
			return value
		}
		if data, ok := raw["data"].(map[string]any); ok {
			if value := firstURLFromAny(data[key]); value != "" {
				return value
			}
		}
	}
	return ""
}

func firstURLFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		if isHTTPURL(typed) {
			return typed
		}
	case []any:
		for _, item := range typed {
			if value := firstURLFromAny(item); value != "" {
				return value
			}
		}
	case map[string]any:
		for _, key := range []string{"url", "video_url", "output_url", "result_url"} {
			if value := stringField(typed, key); value != "" {
				return value
			}
		}
	}
	return ""
}

func isHTTPURL(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}
