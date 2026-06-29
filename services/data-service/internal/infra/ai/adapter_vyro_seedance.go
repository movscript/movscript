package ai

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"
)

type VyroSeedanceAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewVyroSeedanceAdapter(apiKey, baseURL string) *VyroSeedanceAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://115.190.186.95:3002/v1"
	}
	return &VyroSeedanceAdapter{
		APIKey:  strings.TrimSpace(apiKey),
		BaseURL: baseURL,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func (a *VyroSeedanceAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("vyro seedance adapter supports video generation only")
}

func (a *VyroSeedanceAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("vyro seedance adapter supports video generation only")
}

func (a *VyroSeedanceAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	return a.GenerateVideo(ctx, req)
}

func (a *VyroSeedanceAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("vyro seedance api key is required")
	}
	return nil
}

func (a *VyroSeedanceAdapter) GenerateVideo(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return startResp, err
	}
	return startResp, nil
}

func (a *VyroSeedanceAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", req.Model)
	_ = w.WriteField("prompt", req.Prompt)
	if req.AspectRatio != "" {
		_ = w.WriteField("aspect_ratio", req.AspectRatio)
	}
	if req.Size != "" {
		_ = w.WriteField("size", req.Size)
	}
	if req.ResolutionName != "" {
		_ = w.WriteField("resolution", req.ResolutionName)
	}
	if req.Duration > 0 {
		_ = w.WriteField("duration", fmt.Sprintf("%d", req.Duration))
	}

	refImages, err := vyroReferenceImages(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	for i, md := range refImages {
		mimeType := firstNonEmptyAI(md.MimeType, "image/png")
		ext := imageExtFromMime(mimeType)
		partHeader := textproto.MIMEHeader{}
		partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="reference_images"; filename="ref%d.%s"`, i, ext))
		partHeader.Set("Content-Type", mimeType)
		fw, err := w.CreatePart(partHeader)
		if err != nil {
			return VideoResponse{}, err
		}
		_, _ = fw.Write(md.Bytes)
	}
	w.Close()

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/videos"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Content-Type", w.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	debugBody := map[string]any{"model": req.Model, "prompt": req.Prompt, "reference_images": len(refImages)}
	attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("reference_images"))

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	headers := map[string]string{"Content-Type": w.FormDataContentType(), "Authorization": "Bearer " + maskKey(a.APIKey)}
	if err != nil {
		recordDebug(ctx, DebugCallResult{ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(debugBody), LatencyMs: latency, Error: err.Error()})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(debugBody), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return VideoResponse{}, fmt.Errorf("vyro seedance API error %d: %s", resp.StatusCode, string(respBody))
	}
	var raw map[string]any
	if err := jsonUnmarshal(respBody, &raw); err != nil {
		return VideoResponse{}, fmt.Errorf("vyro seedance create task: parse response: %w", err)
	}
	taskID := firstNonEmptyAI(stringField(raw, "id", "task_id", "request_id"), nestedStringField(raw, "data", "id"))
	if taskID == "" {
		if msg := vyroErrorMessage(raw); msg != "" {
			return VideoResponse{}, fmt.Errorf("vyro seedance create task: %s", msg)
		}
		return VideoResponse{}, fmt.Errorf("vyro seedance create task: no task id returned")
	}
	status := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status"), nestedStringField(raw, "data", "status")))
	return VideoResponse{TaskID: taskID, TaskKind: "vyro_seedance", Status: firstNonEmptyAI(status, VideoStatusSubmitted), Debug: takeDebug(ctx)}, nil
}

func (a *VyroSeedanceAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("vyro seedance poll task: task id is required")
	}
	endpoint := strings.TrimRight(a.BaseURL, "/") + "/videos/" + taskID
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet, RequestHeaders: headers, LatencyMs: latency, Error: err.Error()})
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: taskID, Endpoint: endpoint, Method: http.MethodGet, RequestHeaders: headers, ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, fmt.Errorf("vyro seedance poll task API error %d: %s", resp.StatusCode, string(respBody))
	}
	var raw map[string]any
	if err := jsonUnmarshal(respBody, &raw); err != nil {
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind}, fmt.Errorf("vyro seedance poll task: parse response: %w", err)
	}
	status := normalizeVideoStatus(firstNonEmptyAI(stringField(raw, "status"), nestedStringField(raw, "data", "status")))
	if status == "" {
		if msg := vyroErrorMessage(raw); msg != "" {
			return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("vyro seedance poll task: %s", msg)
		}
	}
	videoURL := firstNonEmptyAI(
		stringField(raw, "url", "video_url", "output_url", "result_url", "download_url"),
		nestedStringField(raw, "metadata", "url"),
		nestedStringField(raw, "data", "metadata", "url"),
		nestedStringField(raw, "video", "url"),
		deepStringField(raw, "video_url", "output_url", "result_url", "download_url"),
	)
	switch status {
	case VideoStatusSucceeded:
		if videoURL == "" {
			msg := "task succeeded but no video URL in response"
			return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("%s", msg)
		}
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
	case VideoStatusFailed:
		msg := firstNonEmptyAI(videoTaskErrorMessage(raw), "video generation failed")
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", taskID, msg)
	default:
		return VideoResponse{TaskID: taskID, TaskKind: req.TaskKind, Status: status, Debug: takeDebug(ctx)}, nil
	}
}

func vyroReferenceImages(ctx context.Context, req VideoRequest) ([]MediaData, error) {
	if len(req.InputImageDataList) > 0 {
		return req.InputImageDataList, nil
	}
	refs := append([]string{}, req.InputImages...)
	if req.Image != "" {
		refs = append([]string{req.Image}, refs...)
	}
	out := make([]MediaData, 0, len(refs))
	for _, imgURL := range refs {
		imgURL = strings.TrimSpace(imgURL)
		if imgURL == "" {
			continue
		}
		imgData, mimeType, err := fetchURLBytes(ctx, imgURL, "")
		if err != nil {
			return nil, fmt.Errorf("fetch reference image: %w", err)
		}
		out = append(out, MediaData{Bytes: imgData, MimeType: mimeType})
	}
	return out, nil
}

func vyroErrorMessage(raw map[string]any) string {
	code := strings.TrimSpace(stringField(raw, "code", "error_code"))
	message := strings.TrimSpace(firstNonEmptyAI(
		stringField(raw, "message", "msg", "error"),
		nestedStringField(raw, "error", "message"),
		nestedStringField(raw, "data", "message"),
	))
	if code == "" {
		return message
	}
	if message == "" {
		return code
	}
	return code + ": " + message
}
