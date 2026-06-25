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

	"github.com/movscript/movscript/internal/domain/media"
)

const (
	murekaDefaultBaseURL        = "https://api.mureka.ai"
	murekaDefaultPollTimeout    = 3 * time.Minute
	murekaDefaultPollInterval   = 2 * time.Second
	murekaMinPollInterval       = 250 * time.Millisecond
	murekaDefaultOutputFormat   = "mp3"
	murekaDefaultGeneratedModel = "auto"
)

// MurekaAdapter handles Mureka's async music generation APIs.
type MurekaAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewMurekaAdapter(apiKey, baseURL string) *MurekaAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = murekaDefaultBaseURL
	}
	return &MurekaAdapter{
		APIKey:  strings.TrimSpace(apiKey),
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client:  debugHTTPClient(apiKey, 0),
	}
}

func (a *MurekaAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return TextResponse{}, fmt.Errorf("mureka api_key is required")
	}
	prompt := murekaLyricsPrompt(req)
	if prompt == "" {
		return TextResponse{}, fmt.Errorf("prompt is required")
	}
	body := map[string]any{"prompt": prompt}
	payload, err := json.Marshal(body)
	if err != nil {
		return TextResponse{}, err
	}
	endpoint := a.BaseURL + "/v1/lyrics/generate"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return TextResponse{}, err
	}
	a.addAuth(httpReq)
	httpReq.Header.Set("Content-Type", "application/json")
	reqHeaders := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
		"Content-Type":  "application/json",
	}
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: reqHeaders, RequestBody: mustJSON(body), LatencyMs: latency, Error: err.Error()})
		return TextResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return TextResponse{}, err
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: reqHeaders, RequestBody: mustJSON(body), ResponseStatus: resp.StatusCode, ResponseBody: string(data), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return TextResponse{}, fmt.Errorf("mureka lyrics HTTP %d: %s", resp.StatusCode, string(data))
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return TextResponse{}, fmt.Errorf("mureka lyrics JSON: %w", err)
	}
	title := firstNonEmptyAI(stringField(raw, "title"), stringField(rawMap(raw, "data"), "title"))
	lyrics := firstNonEmptyAI(stringField(raw, "lyrics"), stringField(rawMap(raw, "data"), "lyrics"))
	content := strings.TrimSpace(lyrics)
	if title != "" {
		if content != "" {
			content = title + "\n\n" + content
		} else {
			content = title
		}
	}
	if content == "" {
		return TextResponse{}, fmt.Errorf("mureka lyrics response missing lyrics")
	}
	return TextResponse{
		Content: content,
		Debug:   takeDebug(ctx),
	}, nil
}

func (a *MurekaAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("mureka adapter supports audio music generation only")
}

func (a *MurekaAdapter) VideoGenerate(_ context.Context, _ VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("mureka adapter supports audio music generation only")
}

func (a *MurekaAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("mureka api_key is required")
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+"/v1/account/billing", nil)
	if err != nil {
		return err
	}
	a.addAuth(httpReq)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mureka credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (a *MurekaAdapter) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("mureka api_key is required")
	}
	if req.Kind != media.AudioGenerationKindMusic {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported mureka audio generation kind %q", req.Kind)
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("prompt is required")
	}

	taskID, queryPath, err := a.startMusicTask(ctx, req, prompt)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	result, err := a.pollMusicTask(ctx, queryPath, taskID, murekaPollTimeout(req.Params), murekaPollInterval(req.Params))
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	audioURL := murekaFindAudioURL(result)
	if audioURL == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("mureka task %s completed without an audio URL", taskID)
	}
	audio, mimeType, err := a.downloadAudio(ctx, audioURL, murekaOutputFormat(req))
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	return media.AudioGenerationResponse{
		Audio:       audio,
		MimeType:    mimeType,
		DurationMs:  req.DurationSec * 1000,
		ProviderRef: taskID,
	}, nil
}

func (a *MurekaAdapter) startMusicTask(ctx context.Context, req media.AudioGenerationRequest, prompt string) (taskID, queryPath string, err error) {
	modelID := strings.TrimSpace(req.Model)
	instrumental := modelID == "instrumental_generation" || boolParamValue(req.Params, "instrumental")
	endpointPath := "/v1/song/generate"
	queryPath = "/v1/song/query/"
	if instrumental {
		endpointPath = "/v1/instrumental/generate"
		queryPath = "/v1/instrumental/query/"
	}

	body := map[string]any{
		"prompt": prompt,
		"model":  stringParam(req.Params, "model", murekaDefaultGeneratedModel),
	}
	if !instrumental {
		if lyrics := stringParam(req.Params, "lyrics", ""); lyrics != "" {
			body["lyrics"] = lyrics
		}
	}
	if req.DurationSec > 0 {
		body["duration"] = req.DurationSec
	}
	if format := murekaOutputFormat(req); format != "" {
		body["output_format"] = format
	}
	if seed, ok := numberParam(req.Params, "seed"); ok {
		body["seed"] = int(seed)
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+endpointPath, bytes.NewReader(payload))
	if err != nil {
		return "", "", err
	}
	a.addAuth(httpReq)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", err
	}
	if resp.StatusCode >= 400 {
		return "", "", fmt.Errorf("mureka music start HTTP %d: %s", resp.StatusCode, string(data))
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return "", "", fmt.Errorf("mureka music start JSON: %w", err)
	}
	taskID = firstNonEmptyAI(stringField(raw, "id", "task_id"), stringField(rawMap(raw, "data"), "id", "task_id"))
	if taskID == "" {
		return "", "", fmt.Errorf("mureka music start response missing task id")
	}
	return taskID, queryPath, nil
}

func (a *MurekaAdapter) pollMusicTask(ctx context.Context, queryPath, taskID string, timeout, interval time.Duration) (map[string]any, error) {
	deadline := time.Now().Add(timeout)
	for {
		raw, err := a.queryMusicTask(ctx, queryPath, taskID)
		if err != nil {
			return raw, err
		}
		status := murekaTaskStatus(raw)
		switch status {
		case "succeeded", "success", "completed", "complete", "finished", "done":
			return raw, nil
		case "failed", "failure", "error", "cancelled", "canceled":
			return raw, fmt.Errorf("mureka task %s failed: %s", taskID, firstNonEmptyAI(murekaTaskMessage(raw), "music generation failed"))
		}
		if murekaFindAudioURL(raw) != "" {
			return raw, nil
		}
		if time.Now().After(deadline) {
			return raw, fmt.Errorf("mureka task %s timed out", taskID)
		}
		select {
		case <-ctx.Done():
			return raw, ctx.Err()
		case <-time.After(interval):
		}
	}
}

func (a *MurekaAdapter) queryMusicTask(ctx context.Context, queryPath, taskID string) (map[string]any, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+queryPath+url.PathEscape(taskID), nil)
	if err != nil {
		return nil, err
	}
	a.addAuth(httpReq)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mureka task query HTTP %d: %s", resp.StatusCode, string(data))
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("mureka task query JSON: %w", err)
	}
	return raw, nil
}

func (a *MurekaAdapter) downloadAudio(ctx context.Context, audioURL, outputFormat string) ([]byte, string, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, audioURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("mureka audio download HTTP %d: %s", resp.StatusCode, string(data))
	}
	mimeType := stripContentTypeParams(resp.Header.Get("Content-Type"))
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = murekaMimeForFormat(outputFormat)
	}
	return data, mimeType, nil
}

func (a *MurekaAdapter) addAuth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+a.APIKey)
}

func murekaLyricsPrompt(req TextRequest) string {
	if prompt := stringParam(req.ExtraParams, "prompt", ""); prompt != "" {
		return prompt
	}
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" && strings.TrimSpace(req.Messages[i].Content) != "" {
			return strings.TrimSpace(req.Messages[i].Content)
		}
	}
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if strings.TrimSpace(req.Messages[i].Content) != "" {
			return strings.TrimSpace(req.Messages[i].Content)
		}
	}
	return ""
}

func murekaPollTimeout(params map[string]any) time.Duration {
	ms := intParamOrDefault(params, "poll_timeout_ms", int(murekaDefaultPollTimeout/time.Millisecond))
	if ms <= 0 {
		return murekaDefaultPollTimeout
	}
	return time.Duration(ms) * time.Millisecond
}

func murekaPollInterval(params map[string]any) time.Duration {
	ms := intParamOrDefault(params, "poll_interval_ms", int(murekaDefaultPollInterval/time.Millisecond))
	interval := time.Duration(ms) * time.Millisecond
	if interval < murekaMinPollInterval {
		return murekaMinPollInterval
	}
	return interval
}

func murekaOutputFormat(req media.AudioGenerationRequest) string {
	format := stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, murekaDefaultOutputFormat))
	return strings.ToLower(strings.TrimSpace(format))
}

func murekaMimeForFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav":
		return "audio/wav"
	case "flac":
		return "audio/flac"
	case "m4a":
		return "audio/mp4"
	default:
		return "audio/mpeg"
	}
}

func murekaTaskStatus(raw map[string]any) string {
	status := firstNonEmptyAI(
		stringField(raw, "status", "state", "task_status"),
		stringField(rawMap(raw, "data"), "status", "state", "task_status"),
		stringField(rawMap(raw, "result"), "status", "state", "task_status"),
	)
	return strings.ToLower(strings.TrimSpace(status))
}

func murekaTaskMessage(raw map[string]any) string {
	return firstNonEmptyAI(
		stringField(raw, "message", "msg", "reason"),
		stringField(rawMap(raw, "error"), "message", "msg", "reason"),
		stringField(rawMap(raw, "data"), "message", "msg", "reason"),
	)
}

func murekaFindAudioURL(raw map[string]any) string {
	preferred := []string{"audio_url", "mp3_url", "wav_url", "download_url", "source_url", "url"}
	for _, key := range preferred {
		if value := stringField(raw, key); looksLikeAudioURL(value) {
			return value
		}
	}
	return murekaFindAudioURLValue(raw)
}

func murekaFindAudioURLValue(value any) string {
	switch v := value.(type) {
	case string:
		if looksLikeAudioURL(v) {
			return strings.TrimSpace(v)
		}
	case []any:
		for _, item := range v {
			if found := murekaFindAudioURLValue(item); found != "" {
				return found
			}
		}
	case map[string]any:
		for _, key := range []string{"audio_url", "mp3_url", "wav_url", "download_url", "source_url", "url"} {
			if found := murekaFindAudioURLValue(v[key]); found != "" {
				return found
			}
		}
		for _, item := range v {
			if found := murekaFindAudioURLValue(item); found != "" {
				return found
			}
		}
	}
	return ""
}

func looksLikeAudioURL(value string) bool {
	value = strings.TrimSpace(value)
	if !(strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")) {
		return false
	}
	lower := strings.ToLower(value)
	for _, marker := range []string{".mp3", ".wav", ".m4a", ".aac", ".flac", "audio"} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func rawMap(raw map[string]any, key string) map[string]any {
	if raw == nil {
		return nil
	}
	if m, ok := raw[key].(map[string]any); ok {
		return m
	}
	return nil
}

func boolParamValue(params map[string]any, key string) bool {
	value, ok := boolParam(params, key)
	return ok && value
}
