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

// ViduAdapter handles Vidu video generation tasks.
type ViduAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewViduAdapter(apiKey, baseURL string) *ViduAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.vidu.com/ent/v2"
	}
	return &ViduAdapter{
		APIKey:  apiKey,
		BaseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{},
	}
}

func (a *ViduAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("vidu adapter currently supports video generation only")
}

func (a *ViduAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("vidu adapter currently supports video generation only")
}

func (a *ViduAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
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
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("vidu video generation timed out")
}

func (a *ViduAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	path, body, err := buildViduVideoStart(req)
	if err != nil {
		return VideoResponse{}, err
	}
	debugBody := cloneDebugMap(body)
	switch path {
	case "/img2video":
		attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, staticReferenceAssetProviderField("images[]"))
	case "/reference2video":
		attachReferenceAssetDebugBindings(debugBody, req.ReferenceAssets, indexedReferenceAssetProviderField("subjects[%d].images[]"))
	}
	var result map[string]any
	if err := a.postJSONWithDebugBody(ctx, path, body, debugBody, &result); err != nil {
		return VideoResponse{}, err
	}
	taskID := stringField(result, "task_id", "id")
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("vidu create task: no task_id returned")
	}
	status := normalizeVideoStatus(stringField(result, "state", "status"))
	return VideoResponse{TaskID: taskID, TaskKind: strings.TrimPrefix(path, "/"), Status: firstNonEmptyAI(status, VideoStatusSubmitted), Debug: takeDebug(ctx)}, nil
}

func (a *ViduAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if strings.TrimSpace(req.TaskID) == "" {
		return VideoResponse{}, fmt.Errorf("vidu poll task: task id is required")
	}
	var result map[string]any
	if err := a.getJSON(ctx, "/tasks/"+req.TaskID+"/creations", req.TaskID, &result); err != nil {
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, err
	}
	status := normalizeVideoStatus(stringField(result, "state", "status"))
	videoURL := viduCreationURL(result)

	switch status {
	case VideoStatusSucceeded:
		if videoURL == "" {
			msg := "task succeeded but no video URL in response"
			return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("%s", msg)
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: videoURL, Debug: takeDebug(ctx)}, nil
	case VideoStatusFailed:
		msg := firstNonEmptyAI(stringField(result, "message", "reason", "err_code"), "video generation failed")
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", req.TaskID, msg)
	default:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: status, Debug: takeDebug(ctx)}, nil
	}
}

func (a *ViduAdapter) VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error) {
	if strings.TrimSpace(req.TaskID) == "" {
		return VideoResponse{}, fmt.Errorf("vidu cancel task: task id is required")
	}
	var result map[string]any
	if err := a.postJSON(ctx, "/tasks/"+req.TaskID+"/cancel", map[string]any{}, &result); err != nil {
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing}, err
	}
	return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusCancelled, Message: "video task cancelled", Debug: takeDebug(ctx)}, nil
}

func (a *ViduAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("vidu api_key is required")
	}
	endpoint := a.BaseURL + "/tasks/movscript-credential-check/creations"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Token "+a.APIKey)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vidu credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func buildViduVideoStart(req VideoRequest) (string, map[string]any, error) {
	images := viduImageRefs(req)
	body := map[string]any{
		"model":  req.Model,
		"prompt": req.Prompt,
	}
	addViduCommonParams(body, req)
	switch {
	case len(images) == 0:
		return "/text2video", body, nil
	case len(images) == 1:
		body["images"] = []string{images[0]}
		return "/img2video", body, nil
	default:
		subjects := make([]map[string]any, 0, len(images))
		for i, img := range images {
			subjects = append(subjects, map[string]any{
				"name":   fmt.Sprintf("%d", i+1),
				"images": []string{img},
			})
		}
		body["subjects"] = subjects
		return "/reference2video", body, nil
	}
}

func addViduCommonParams(body map[string]any, req VideoRequest) {
	if req.Duration > 0 {
		body["duration"] = req.Duration
	}
	if req.AspectRatio != "" {
		body["aspect_ratio"] = req.AspectRatio
	}
	if req.ResolutionName != "" {
		body["resolution"] = req.ResolutionName
	}
	if req.Seed != nil && *req.Seed >= 0 {
		body["seed"] = *req.Seed
	}
	if req.GenerateAudio != nil {
		body["audio"] = *req.GenerateAudio
	}
	if req.AudioType != "" {
		body["audio_type"] = viduAudioType(req.AudioType)
	}
	if req.MovementAmplitude != "" {
		body["movement_amplitude"] = req.MovementAmplitude
	}
	if req.OffPeak != nil {
		body["off_peak"] = *req.OffPeak
	}
	if req.Payload != "" {
		body["payload"] = req.Payload
	}
}

func viduImageRefs(req VideoRequest) []string {
	refs := make([]string, 0, len(req.InputImageDataList)+len(req.InputImages)+1)
	if req.Image != "" {
		refs = append(refs, req.Image)
	}
	for _, imgURL := range req.InputImages {
		if strings.TrimSpace(imgURL) != "" {
			refs = append(refs, imgURL)
		}
	}
	for _, img := range req.InputImageDataList {
		url := mediaProviderURL(img)
		if url == "" && len(img.Bytes) > 0 {
			mimeType := firstNonEmptyAI(img.MimeType, "image/png")
			url = "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(img.Bytes)
		}
		if url != "" {
			refs = append(refs, url)
		}
	}
	return refs
}

func viduAudioType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "speech_only", "speech-only":
		return "Speech_only"
	case "sound_effect_only", "sound-effect_only", "sound-effect-only":
		return "Sound-effect_only"
	case "all":
		return "All"
	default:
		return value
	}
}

func viduCreationURL(raw map[string]any) string {
	creations, _ := raw["creations"].([]any)
	for _, item := range creations {
		if m, ok := item.(map[string]any); ok {
			if url := stringField(m, "url", "video_url", "download_url"); url != "" {
				return url
			}
		}
	}
	return deepStringField(raw, "url", "video_url", "download_url", "output_url", "result_url")
}

func (a *ViduAdapter) postJSON(ctx context.Context, path string, body any, out any) error {
	return a.doJSON(ctx, http.MethodPost, path, "", body, nil, out)
}

func (a *ViduAdapter) postJSONWithDebugBody(ctx context.Context, path string, body any, debugBody any, out any) error {
	return a.doJSON(ctx, http.MethodPost, path, "", body, debugBody, out)
}

func (a *ViduAdapter) getJSON(ctx context.Context, path, modelID string, out any) error {
	return a.doJSON(ctx, http.MethodGet, path, modelID, nil, nil, out)
}

func (a *ViduAdapter) doJSON(ctx context.Context, method, path, modelID string, body any, debugBody any, out any) error {
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
	httpReq.Header.Set("Authorization", "Token "+a.APIKey)
	if method == http.MethodPost {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	headers := map[string]string{"Authorization": "Token " + maskKey(a.APIKey)}
	if method == http.MethodPost {
		headers["Content-Type"] = "application/json"
	}
	if modelID == "" && body != nil {
		if m, ok := body.(map[string]any); ok {
			modelID, _ = m["model"].(string)
		}
	}
	debugRequestBody := string(reqBody)
	if debugBody != nil {
		debugRequestBody = mustJSON(debugBody)
	}

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: modelID, Endpoint: endpoint, Method: method, RequestHeaders: headers, RequestBody: debugRequestBody, LatencyMs: latency, Error: err.Error()})
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: modelID, Endpoint: endpoint, Method: method, RequestHeaders: headers, RequestBody: debugRequestBody, ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return fmt.Errorf("vidu API error %d: %s", resp.StatusCode, string(respBody))
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode vidu response: %w", err)
		}
	}
	return nil
}
