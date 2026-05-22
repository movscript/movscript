package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DashScopeAdapter handles Alibaba Cloud DashScope / Model Studio video tasks.
type DashScopeAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewDashScopeAdapter(apiKey, baseURL string) *DashScopeAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://dashscope-intl.aliyuncs.com/api/v1"
	}
	return &DashScopeAdapter{
		APIKey:  apiKey,
		BaseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{},
	}
}

func (a *DashScopeAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("dashscope adapter currently supports video generation only")
}

func (a *DashScopeAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("dashscope adapter currently supports video generation only")
}

func (a *DashScopeAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
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
			return pollResp, fmt.Errorf("video task %s failed: %s", startResp.TaskID, firstNonEmptyAI(pollResp.Message, "video generation failed"))
		}
	}
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("dashscope video generation timed out")
}

func (a *DashScopeAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	body, err := buildDashScopeVideoBody(req)
	if err != nil {
		return VideoResponse{}, err
	}
	var result map[string]any
	if err := a.postJSON(ctx, "/services/aigc/video-generation/video-synthesis", body, &result); err != nil {
		return VideoResponse{}, err
	}
	output, _ := result["output"].(map[string]any)
	taskID := stringField(output, "task_id")
	if taskID == "" {
		taskID = stringField(result, "task_id", "id")
	}
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("dashscope create task: no task_id returned")
	}
	status := normalizeVideoStatus(stringField(output, "task_status", "status"))
	return VideoResponse{TaskID: taskID, TaskKind: "video_synthesis", Status: firstNonEmptyAI(status, VideoStatusSubmitted), Debug: takeDebug(ctx)}, nil
}

func (a *DashScopeAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if strings.TrimSpace(req.TaskID) == "" {
		return VideoResponse{}, fmt.Errorf("dashscope poll task: task id is required")
	}
	var result map[string]any
	if err := a.getJSON(ctx, "/tasks/"+req.TaskID, req.TaskID, &result); err != nil {
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, err
	}
	output, _ := result["output"].(map[string]any)
	status := normalizeVideoStatus(stringField(output, "task_status", "status"))
	videoURL := firstNonEmptyAI(
		stringField(output, "video_url", "url"),
		deepStringField(output, "video_url", "url", "download_url", "output_url", "result_url"),
	)
	duration := dashScopeDuration(result)

	switch status {
	case VideoStatusSucceeded:
		if videoURL == "" {
			msg := "task succeeded but no video URL in response"
			return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("%s", msg)
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: videoURL, DurationSec: duration, Debug: takeDebug(ctx)}, nil
	case VideoStatusFailed:
		msg := videoTaskErrorMessage(output)
		if msg == "" {
			msg = "video generation failed"
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", req.TaskID, msg)
	default:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: status, Debug: takeDebug(ctx)}, nil
	}
}

func (a *DashScopeAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("dashscope api_key is required")
	}
	endpoint := a.BaseURL + "/tasks/movscript-credential-check"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dashscope credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func buildDashScopeVideoBody(req VideoRequest) (map[string]any, error) {
	input := map[string]any{"prompt": req.Prompt}
	refs := dashScopeMediaRefs(req)
	if len(refs.media) > 0 && strings.Contains(strings.ToLower(req.Model), "happyhorse") {
		input["media"] = refs.media
	} else if len(refs.urls) > 0 {
		model := strings.ToLower(req.Model)
		if strings.Contains(model, "r2v") || len(refs.urls) > 1 || refs.hasVideo {
			input["reference_urls"] = refs.urls
		} else {
			input["img_url"] = refs.urls[0]
		}
	}

	params := map[string]any{}
	if req.Duration > 0 {
		params["duration"] = req.Duration
	}
	if req.Size != "" {
		params["size"] = req.Size
	}
	if ratio := firstNonEmptyAI(req.Ratio, req.AspectRatio); ratio != "" {
		params["ratio"] = ratio
	}
	if req.ResolutionName != "" {
		params["resolution"] = req.ResolutionName
	}
	if req.Seed != nil {
		params["seed"] = *req.Seed
	}
	if req.Watermark != nil {
		params["watermark"] = *req.Watermark
	}
	if req.GenerateAudio != nil {
		params["audio"] = *req.GenerateAudio
	}

	body := map[string]any{
		"model": req.Model,
		"input": input,
	}
	if len(params) > 0 {
		body["parameters"] = params
	}
	return body, nil
}

type dashScopeRefs struct {
	urls     []string
	media    []map[string]string
	hasVideo bool
}

func dashScopeMediaRefs(req VideoRequest) dashScopeRefs {
	var refs dashScopeRefs
	add := func(kind string, md MediaData) {
		url := mediaProviderURL(md)
		if url == "" && len(md.Bytes) > 0 {
			mimeType := firstNonEmptyAI(md.MimeType, "application/octet-stream")
			url = "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(md.Bytes)
		}
		if url == "" {
			return
		}
		refs.urls = append(refs.urls, url)
		if kind == "video" {
			refs.hasVideo = true
		}
		mediaType := "reference_image"
		if kind == "video" {
			mediaType = "reference_video"
		}
		refs.media = append(refs.media, map[string]string{"type": mediaType, "url": url})
	}
	for _, img := range req.InputImageDataList {
		add("image", img)
	}
	for _, imgURL := range req.InputImages {
		if strings.TrimSpace(imgURL) != "" {
			refs.urls = append(refs.urls, imgURL)
			refs.media = append(refs.media, map[string]string{"type": "reference_image", "url": imgURL})
		}
	}
	if req.Image != "" {
		refs.urls = append([]string{req.Image}, refs.urls...)
		refs.media = append([]map[string]string{{"type": "reference_image", "url": req.Image}}, refs.media...)
	}
	if req.InputVideoData != nil {
		add("video", *req.InputVideoData)
	}
	if req.InputVideo != "" {
		refs.urls = append(refs.urls, req.InputVideo)
		refs.media = append(refs.media, map[string]string{"type": "reference_video", "url": req.InputVideo})
		refs.hasVideo = true
	}
	return refs
}

func mediaProviderURL(md MediaData) string {
	if md.PresignedURL != "" {
		return md.PresignedURL
	}
	return ""
}

func (a *DashScopeAdapter) postJSON(ctx context.Context, path string, body any, out any) error {
	return a.doJSON(ctx, http.MethodPost, path, "", body, out)
}

func (a *DashScopeAdapter) getJSON(ctx context.Context, path, modelID string, out any) error {
	return a.doJSON(ctx, http.MethodGet, path, modelID, nil, out)
}

func (a *DashScopeAdapter) doJSON(ctx context.Context, method, path, modelID string, body any, out any) error {
	var reqBody []byte
	if body != nil {
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	endpoint := a.BaseURL + path
	httpReq, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	if method == http.MethodPost {
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-DashScope-Async", "enable")
	}
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	if method == http.MethodPost {
		headers["Content-Type"] = "application/json"
		headers["X-DashScope-Async"] = "enable"
	}
	if modelID == "" && body != nil {
		if m, ok := body.(map[string]any); ok {
			modelID, _ = m["model"].(string)
		}
	}

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: modelID, Endpoint: endpoint, Method: method, RequestHeaders: headers, RequestBody: string(reqBody), LatencyMs: latency, Error: err.Error()})
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: modelID, Endpoint: endpoint, Method: method, RequestHeaders: headers, RequestBody: string(reqBody), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return fmt.Errorf("dashscope API error %d: %s", resp.StatusCode, string(respBody))
	}
	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode dashscope response: %w", err)
		}
	}
	return nil
}

func dashScopeDuration(raw map[string]any) int {
	if usage, ok := raw["usage"].(map[string]any); ok {
		for _, key := range []string{"duration", "video_duration", "output_video_duration"} {
			if n, ok := numberValue(usage[key]); ok && n > 0 {
				return int(n)
			}
		}
	}
	return 0
}

func firstNonEmptyAI(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
