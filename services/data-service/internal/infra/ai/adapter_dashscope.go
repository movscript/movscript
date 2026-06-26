package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
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

func (a *DashScopeAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return ImageResponse{}, fmt.Errorf("dashscope api_key is required")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return ImageResponse{}, fmt.Errorf("prompt is required")
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "qwen-image"
	}
	body := buildDashScopeImageBody(req, model, prompt)
	rawBody, err := json.Marshal(body)
	if err != nil {
		return ImageResponse{}, err
	}
	endpoint := a.BaseURL + "/services/aigc/multimodal-generation/generation"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return ImageResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	headers := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
		"Content-Type":  "application/json",
	}
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: string(rawBody), LatencyMs: latency, Error: err.Error()})
		return ImageResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return ImageResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: string(rawBody), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return ImageResponse{}, fmt.Errorf("dashscope image HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return ImageResponse{}, fmt.Errorf("decode dashscope image response: %w", err)
	}
	if code := stringField(parsed, "code"); code != "" {
		return ImageResponse{}, fmt.Errorf("dashscope image error %s: %s", code, stringField(parsed, "message"))
	}
	urls := dashScopeImageURLs(parsed)
	if len(urls) == 0 {
		return ImageResponse{}, fmt.Errorf("dashscope image response did not include image URL")
	}
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
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

func (a *DashScopeAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.TTSResponse{}, fmt.Errorf("dashscope api_key is required")
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return media.TTSResponse{}, fmt.Errorf("text is required")
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "qwen3-tts-flash"
	}
	if strings.Contains(strings.ToLower(model), "-realtime") {
		return a.synthesizeQwenRealtimeTTS(ctx, req, model, text)
	}
	if strings.HasPrefix(strings.ToLower(model), "cosyvoice-") {
		return a.synthesizeCosyVoice(ctx, req, model, text)
	}
	return a.synthesizeQwenTTS(ctx, req, model, text)
}

func (a *DashScopeAdapter) ChatAudio(ctx context.Context, req media.AudioChatRequest) (media.AudioChatResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.AudioChatResponse{}, fmt.Errorf("dashscope api_key is required")
	}
	if len(req.Audio) == 0 {
		return media.AudioChatResponse{}, fmt.Errorf("audio is required")
	}
	model := firstNonEmptyAI(strings.TrimSpace(req.Model), "qwen3-omni-flash-realtime")
	endpoint, err := dashScopeRealtimeURL(a.BaseURL, req.Params, model)
	if err != nil {
		return media.AudioChatResponse{}, err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+a.APIKey)
	if workspace := stringParam(req.Params, "workspace_id", ""); workspace != "" {
		headers.Set("X-DashScope-WorkSpace", workspace)
	}
	dialer := websocket.Dialer{}
	start := time.Now()
	conn, resp, err := dialer.DialContext(ctx, endpoint, headers)
	latency := time.Since(start).Milliseconds()
	debugHeaders := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	if workspace := headers.Get("X-DashScope-WorkSpace"); workspace != "" {
		debugHeaders["X-DashScope-WorkSpace"] = workspace
	}
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, ResponseStatus: status, LatencyMs: latency, Error: err.Error()})
		return media.AudioChatResponse{}, err
	}
	defer conn.Close()

	inputFormat := dashScopeOmniInputAudioFormat(req)
	outputFormat := dashScopeOmniOutputAudioFormat(req)
	outputSampleRate := intParamOrDefault(req.Params, "output_sample_rate", 24000)
	session := map[string]any{
		"modalities":                []string{"text", "audio"},
		"voice":                     firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "Ethan")),
		"instructions":              firstNonEmptyAI(strings.TrimSpace(req.Prompt), stringParam(req.Params, "instructions", ""), "You are a helpful assistant."),
		"input_audio_format":        inputFormat,
		"output_audio_format":       outputFormat,
		"turn_detection":            nil,
		"input_audio_transcription": map[string]any{"model": stringParam(req.Params, "input_audio_transcription_model", "qwen3-asr-flash-realtime")},
	}
	if enableSearch, ok := boolParam(req.Params, "enable_search"); ok {
		session["enable_search"] = enableSearch
	}
	if rawOptions, ok := req.Params["search_options"]; ok {
		session["search_options"] = rawOptions
	}
	if err := dashScopeWriteRealtimeEvent(conn, "session.update", map[string]any{"session": session}); err != nil {
		return media.AudioChatResponse{}, err
	}
	if err := dashScopeWriteRealtimeEvent(conn, "input_audio_buffer.append", map[string]any{"audio": base64.StdEncoding.EncodeToString(req.Audio)}); err != nil {
		return media.AudioChatResponse{}, err
	}
	if err := dashScopeWriteRealtimeEvent(conn, "input_audio_buffer.commit", nil); err != nil {
		return media.AudioChatResponse{}, err
	}
	if err := dashScopeWriteRealtimeEvent(conn, "response.create", nil); err != nil {
		return media.AudioChatResponse{}, err
	}

	audio, text, providerRef, err := dashScopeReadRealtimeAudioChat(ctx, conn)
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()})
		return media.AudioChatResponse{}, err
	}
	if len(audio) == 0 && strings.TrimSpace(text) == "" {
		return media.AudioChatResponse{}, fmt.Errorf("dashscope omni realtime returned empty response")
	}
	durationMs := 0
	if outputFormat == "pcm" && outputSampleRate > 0 {
		durationMs = len(audio) * 1000 / (outputSampleRate * 2)
	}
	recordDebug(ctx, DebugCallResult{Success: true, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, RequestBody: mustJSON(map[string]any{"session": session, "audio_bytes": len(req.Audio)}), LatencyMs: time.Since(start).Milliseconds()})
	return media.AudioChatResponse{
		Audio:       audio,
		Text:        text,
		MimeType:    mimeTypeForDashScopeRealtimeAudioFormat(outputFormat),
		DurationMs:  durationMs,
		ProviderRef: providerRef,
	}, nil
}

func (a *DashScopeAdapter) synthesizeQwenTTS(ctx context.Context, req media.TTSRequest, model, text string) (media.TTSResponse, error) {
	input := map[string]any{
		"text":  text,
		"voice": firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "Cherry")),
	}
	if language := dashScopeQwenLanguage(req); language != "" {
		input["language_type"] = language
	}
	if instructions := stringParam(req.Params, "instructions", ""); instructions != "" {
		input["instructions"] = instructions
	}
	if optimize, ok := boolParam(req.Params, "optimize_instructions"); ok {
		input["optimize_instructions"] = optimize
	}
	body := map[string]any{
		"model": model,
		"input": input,
	}
	return a.postDashScopeTTS(ctx, "/services/aigc/multimodal-generation/generation", model, body, "dashscope qwen tts", dashScopeAudioFormat(req, "wav"))
}

func (a *DashScopeAdapter) synthesizeQwenRealtimeTTS(ctx context.Context, req media.TTSRequest, model, text string) (media.TTSResponse, error) {
	endpoint, err := dashScopeRealtimeURL(a.BaseURL, req.Params, model)
	if err != nil {
		return media.TTSResponse{}, err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+a.APIKey)
	if workspace := stringParam(req.Params, "workspace_id", ""); workspace != "" {
		headers.Set("X-DashScope-WorkSpace", workspace)
	}
	dialer := websocket.Dialer{}
	start := time.Now()
	conn, resp, err := dialer.DialContext(ctx, endpoint, headers)
	latency := time.Since(start).Milliseconds()
	debugHeaders := map[string]string{"Authorization": "Bearer " + maskKey(a.APIKey)}
	if workspace := headers.Get("X-DashScope-WorkSpace"); workspace != "" {
		debugHeaders["X-DashScope-WorkSpace"] = workspace
	}
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, ResponseStatus: status, LatencyMs: latency, Error: err.Error()})
		return media.TTSResponse{}, err
	}
	defer conn.Close()

	format := dashScopeRealtimeAudioFormat(req)
	sampleRate := intParamOrDefault(req.Params, "sample_rate", 24000)
	session := map[string]any{
		"voice":           firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "Cherry")),
		"mode":            stringParam(req.Params, "mode", "commit"),
		"language_type":   dashScopeQwenLanguage(req),
		"response_format": format,
		"sample_rate":     sampleRate,
	}
	if session["language_type"] == "" {
		session["language_type"] = "Auto"
	}
	if instructions := stringParam(req.Params, "instructions", ""); instructions != "" {
		session["instructions"] = instructions
	}
	if optimize, ok := boolParam(req.Params, "optimize_instructions"); ok {
		session["optimize_instructions"] = optimize
	}
	if err := dashScopeWriteRealtimeEvent(conn, "session.update", map[string]any{"session": session}); err != nil {
		return media.TTSResponse{}, err
	}
	if err := dashScopeWriteRealtimeEvent(conn, "input_text_buffer.append", map[string]any{"text": text}); err != nil {
		return media.TTSResponse{}, err
	}
	if err := dashScopeWriteRealtimeEvent(conn, "input_text_buffer.commit", nil); err != nil {
		return media.TTSResponse{}, err
	}

	audio, providerRef, err := dashScopeReadRealtimeAudio(ctx, conn)
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()})
		return media.TTSResponse{}, err
	}
	_ = dashScopeWriteRealtimeEvent(conn, "session.finish", nil)
	if len(audio) == 0 {
		return media.TTSResponse{}, fmt.Errorf("dashscope realtime TTS returned empty audio")
	}
	durationMs := 0
	if format == "pcm" && sampleRate > 0 {
		durationMs = len(audio) * 1000 / (sampleRate * 2)
	}
	recordDebug(ctx, DebugCallResult{Success: true, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: debugHeaders, RequestBody: mustJSON(map[string]any{"session": session, "text_length": len([]rune(text))}), LatencyMs: time.Since(start).Milliseconds()})
	return media.TTSResponse{
		Audio:       audio,
		MimeType:    mimeTypeForDashScopeRealtimeAudioFormat(format),
		DurationMs:  durationMs,
		ProviderRef: providerRef,
	}, nil
}

func (a *DashScopeAdapter) synthesizeCosyVoice(ctx context.Context, req media.TTSRequest, model, text string) (media.TTSResponse, error) {
	input := map[string]any{
		"text":        text,
		"voice":       firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice", "longxiaochun")),
		"format":      dashScopeAudioFormat(req, "mp3"),
		"sample_rate": intParamOrDefault(req.Params, "sample_rate", 22050),
	}
	if volume, ok := numberParam(req.Params, "volume"); ok {
		input["volume"] = int(volume)
	}
	if rate, ok := numberParam(req.Params, "rate"); ok {
		input["rate"] = rate
	} else if speed, ok := numberParam(req.Params, "speed"); ok {
		input["rate"] = speed
	}
	if pitch, ok := numberParam(req.Params, "pitch"); ok {
		input["pitch"] = pitch
	}
	if bitRate, ok := numberParam(req.Params, "bit_rate"); ok {
		input["bit_rate"] = int(bitRate)
	}
	if enableSSML, ok := boolParam(req.Params, "enable_ssml"); ok {
		input["enable_ssml"] = enableSSML
	} else if req.SSML {
		input["enable_ssml"] = true
	}
	if seed, ok := numberParam(req.Params, "seed"); ok {
		input["seed"] = int(seed)
	}
	if instruction := firstNonEmptyAI(stringParam(req.Params, "instruction", ""), stringParam(req.Params, "instructions", "")); instruction != "" {
		input["instruction"] = instruction
	}
	if hints := dashScopeLanguageHints(req); len(hints) > 0 {
		input["language_hints"] = hints
	}
	if enableAIGCTag, ok := boolParam(req.Params, "enable_aigc_tag"); ok {
		input["enable_aigc_tag"] = enableAIGCTag
	}
	body := map[string]any{
		"model": model,
		"input": input,
	}
	return a.postDashScopeTTS(ctx, "/services/audio/tts/SpeechSynthesizer", model, body, "dashscope cosyvoice tts", dashScopeAudioFormat(req, "mp3"))
}

func (a *DashScopeAdapter) postDashScopeTTS(ctx context.Context, path, model string, body map[string]any, label, audioFormat string) (media.TTSResponse, error) {
	reqBody, err := json.Marshal(body)
	if err != nil {
		return media.TTSResponse{}, err
	}
	endpoint := a.BaseURL + path
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	headers := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
		"Content-Type":  "application/json",
	}
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactDashScopeTTSBody(body)), LatencyMs: latency, Error: err.Error()})
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.TTSResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactDashScopeTTSBody(body)), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("%s HTTP %d: %s", label, resp.StatusCode, string(respBody))
	}
	var parsed dashScopeTTSResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode %s response: %w", label, err)
	}
	if parsed.StatusCode >= 400 || parsed.Code != "" {
		return media.TTSResponse{}, fmt.Errorf("%s error %d %s: %s", label, parsed.StatusCode, parsed.Code, parsed.Message)
	}
	audioRef := parsed.Output.Audio
	audio, mimeType, err := a.dashScopeTTSAudio(ctx, audioRef, audioFormat)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if len(audio) == 0 {
		return media.TTSResponse{}, fmt.Errorf("%s returned empty audio", label)
	}
	return media.TTSResponse{
		Audio:       audio,
		MimeType:    firstNonEmptyAI(stripContentTypeParams(mimeType), mimeTypeForDashScopeAudioFormat(audioFormat)),
		ProviderRef: firstNonEmptyAI(audioRef.ID, parsed.RequestID),
	}, nil
}

func (a *DashScopeAdapter) dashScopeTTSAudio(ctx context.Context, ref dashScopeTTSAudio, audioFormat string) ([]byte, string, error) {
	if data := strings.TrimSpace(ref.Data); data != "" {
		decoded, err := base64.StdEncoding.DecodeString(data)
		if err != nil {
			return nil, "", fmt.Errorf("decode dashscope TTS audio data: %w", err)
		}
		return decoded, mimeTypeForDashScopeAudioFormat(audioFormat), nil
	}
	url := strings.TrimSpace(ref.URL)
	if url == "" {
		return nil, "", nil
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, "", fmt.Errorf("download dashscope TTS audio: %w", err)
	}
	defer resp.Body.Close()
	data, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, "", readErr
	}
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("download dashscope TTS audio HTTP %d: %s", resp.StatusCode, string(data))
	}
	mimeType := resp.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = mimeTypeForDashScopeAudioURL(url, audioFormat)
	}
	return data, mimeType, nil
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

func buildDashScopeImageBody(req ImageRequest, model, prompt string) map[string]any {
	params := map[string]any{}
	if size := dashScopeImageSize(req, model); size != "" {
		params["size"] = size
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
	if req.N > 0 && dashScopeImageSupportsMultiN(model) {
		params["n"] = req.N
	}
	body := map[string]any{
		"model": model,
		"input": map[string]any{
			"messages": []map[string]any{{
				"role": "user",
				"content": []map[string]string{{
					"text": prompt,
				}},
			}},
		},
	}
	if len(params) > 0 {
		body["parameters"] = params
	}
	return body
}

func dashScopeImageSize(req ImageRequest, model string) string {
	if size := strings.TrimSpace(req.Size); size != "" {
		return strings.ReplaceAll(size, "x", "*")
	}
	ratio := strings.TrimSpace(req.AspectRatio)
	if ratio == "" {
		return ""
	}
	if strings.Contains(strings.ToLower(model), "2.0") {
		switch ratio {
		case "16:9":
			return "2688*1536"
		case "9:16":
			return "1536*2688"
		case "4:3":
			return "2368*1728"
		case "3:4":
			return "1728*2368"
		case "1:1":
			return "2048*2048"
		}
	}
	switch ratio {
	case "16:9":
		return "1664*928"
	case "9:16":
		return "928*1664"
	case "4:3":
		return "1472*1104"
	case "3:4":
		return "1104*1472"
	case "1:1":
		return "1328*1328"
	default:
		return ""
	}
}

func dashScopePromptExtend(mode string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "":
		return false, false
	case "none", "off", "false", "disabled", "disable":
		return false, true
	default:
		return true, true
	}
}

func dashScopeImageSupportsMultiN(model string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(model)), "2.0")
}

func dashScopeImageURLs(raw map[string]any) []string {
	var urls []string
	var walk func(any)
	walk = func(v any) {
		switch t := v.(type) {
		case map[string]any:
			if image := stringField(t, "image"); image != "" {
				urls = append(urls, image)
			}
			for key, value := range t {
				if key == "image" {
					continue
				}
				walk(value)
			}
		case []any:
			for _, item := range t {
				walk(item)
			}
		}
	}
	if output, ok := raw["output"]; ok {
		walk(output)
	}
	return urls
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

type dashScopeTTSResponse struct {
	StatusCode int    `json:"status_code"`
	RequestID  string `json:"request_id"`
	Code       string `json:"code"`
	Message    string `json:"message"`
	Output     struct {
		Audio dashScopeTTSAudio `json:"audio"`
	} `json:"output"`
	Usage map[string]any `json:"usage"`
}

type dashScopeTTSAudio struct {
	Data      string `json:"data"`
	URL       string `json:"url"`
	ID        string `json:"id"`
	ExpiresAt int64  `json:"expires_at"`
}

func dashScopeQwenLanguage(req media.TTSRequest) string {
	if language := stringParam(req.Params, "language_type", ""); language != "" {
		return language
	}
	switch strings.ToLower(strings.TrimSpace(req.Language)) {
	case "":
		return ""
	case "zh", "zh-cn", "cmn", "mandarin", "chinese":
		return "Chinese"
	case "en", "en-us", "en-gb", "english":
		return "English"
	case "de", "german":
		return "German"
	case "it", "italian":
		return "Italian"
	case "pt", "portuguese":
		return "Portuguese"
	case "es", "spanish":
		return "Spanish"
	case "ja", "jp", "japanese":
		return "Japanese"
	case "ko", "korean":
		return "Korean"
	case "fr", "french":
		return "French"
	case "ru", "russian":
		return "Russian"
	default:
		return strings.TrimSpace(req.Language)
	}
}

func dashScopeLanguageHints(req media.TTSRequest) []string {
	if raw, ok := req.Params["language_hints"]; ok {
		switch v := raw.(type) {
		case []string:
			return append([]string(nil), v...)
		case []any:
			out := make([]string, 0, len(v))
			for _, item := range v {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					out = append(out, strings.TrimSpace(s))
				}
			}
			return out
		case string:
			if strings.TrimSpace(v) != "" {
				return []string{strings.TrimSpace(v)}
			}
		}
	}
	switch strings.ToLower(strings.TrimSpace(req.Language)) {
	case "zh", "zh-cn", "cmn", "mandarin", "chinese":
		return []string{"zh"}
	case "en", "en-us", "en-gb", "english":
		return []string{"en"}
	case "fr", "french":
		return []string{"fr"}
	case "de", "german":
		return []string{"de"}
	case "ja", "jp", "japanese":
		return []string{"ja"}
	case "ko", "korean":
		return []string{"ko"}
	case "ru", "russian":
		return []string{"ru"}
	case "pt", "portuguese":
		return []string{"pt"}
	default:
		return nil
	}
}

func dashScopeAudioFormat(req media.TTSRequest, fallback string) string {
	value := strings.TrimSpace(req.AudioFormat)
	if value == "" {
		value = firstNonEmptyAI(stringParam(req.Params, "format", ""), stringParam(req.Params, "audio_format", ""), fallback)
	}
	switch strings.ToLower(value) {
	case "wav", "pcm", "opus":
		return strings.ToLower(value)
	default:
		return "mp3"
	}
}

func dashScopeRealtimeAudioFormat(req media.TTSRequest) string {
	value := strings.TrimSpace(req.AudioFormat)
	if value == "" {
		value = firstNonEmptyAI(stringParam(req.Params, "response_format", ""), stringParam(req.Params, "format", ""), "wav")
	}
	switch strings.ToLower(value) {
	case "pcm", "wav", "mp3", "opus":
		return strings.ToLower(value)
	default:
		return "wav"
	}
}

func dashScopeOmniInputAudioFormat(req media.AudioChatRequest) string {
	value := strings.TrimSpace(firstNonEmptyAI(req.AudioFormat, stringParam(req.Params, "input_audio_format", "")))
	if value == "" {
		value = "pcm"
	}
	switch strings.ToLower(value) {
	case "pcm", "g711_ulaw", "g711_alaw":
		return strings.ToLower(value)
	default:
		return "pcm"
	}
}

func dashScopeOmniOutputAudioFormat(req media.AudioChatRequest) string {
	value := strings.TrimSpace(firstNonEmptyAI(stringParam(req.Params, "output_audio_format", ""), stringParam(req.Params, "response_format", "")))
	if value == "" {
		value = "pcm"
	}
	switch strings.ToLower(value) {
	case "pcm", "wav", "mp3", "opus":
		return strings.ToLower(value)
	default:
		return "pcm"
	}
}

func dashScopeRealtimeURL(baseURL string, params map[string]any, model string) (string, error) {
	if raw := strings.TrimSpace(stringParam(params, "realtime_url", "")); raw != "" {
		u, err := url.Parse(raw)
		if err != nil {
			return "", err
		}
		q := u.Query()
		if q.Get("model") == "" {
			q.Set("model", model)
		}
		u.RawQuery = q.Encode()
		return u.String(), nil
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "https://dashscope-intl.aliyuncs.com/api/v1"
	}
	u, err := url.Parse(base)
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
		u.Scheme = "wss"
	}
	path := strings.TrimRight(u.Path, "/")
	if strings.HasSuffix(path, "/realtime") {
		u.Path = path
	} else if strings.Contains(path, "/api/v1") {
		u.Path = strings.Replace(path, "/api/v1", "/api-ws/v1/realtime", 1)
	} else if path == "" || path == "/" {
		u.Path = "/api-ws/v1/realtime"
	} else {
		u.Path = path + "/api-ws/v1/realtime"
	}
	q := u.Query()
	q.Set("model", model)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func dashScopeWriteRealtimeEvent(conn *websocket.Conn, eventType string, payload map[string]any) error {
	body := map[string]any{
		"event_id": fmt.Sprintf("event_%d", time.Now().UnixNano()),
		"type":     eventType,
	}
	for key, value := range payload {
		body[key] = value
	}
	return conn.WriteJSON(body)
}

func dashScopeReadRealtimeAudioChat(ctx context.Context, conn *websocket.Conn) ([]byte, string, string, error) {
	var audio bytes.Buffer
	var text strings.Builder
	providerRef := ""
	for {
		if deadline, ok := ctx.Deadline(); ok {
			_ = conn.SetReadDeadline(deadline)
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return audio.Bytes(), text.String(), providerRef, err
		}
		var event map[string]any
		if err := json.Unmarshal(raw, &event); err != nil {
			return audio.Bytes(), text.String(), providerRef, fmt.Errorf("decode dashscope realtime event: %w", err)
		}
		eventType := stringField(event, "type")
		switch eventType {
		case "error":
			errObj, _ := event["error"].(map[string]any)
			return audio.Bytes(), text.String(), providerRef, fmt.Errorf("dashscope realtime error %s: %s", stringField(errObj, "code"), stringField(errObj, "message"))
		case "response.created", "response.done":
			if response, ok := event["response"].(map[string]any); ok {
				providerRef = firstNonEmptyAI(providerRef, stringField(response, "id"))
			}
			if eventType == "response.done" {
				return audio.Bytes(), text.String(), providerRef, nil
			}
		case "response.audio.delta":
			providerRef = firstNonEmptyAI(providerRef, stringField(event, "response_id"))
			delta := strings.TrimSpace(stringField(event, "delta"))
			if delta == "" {
				continue
			}
			chunk, err := base64.StdEncoding.DecodeString(delta)
			if err != nil {
				return audio.Bytes(), text.String(), providerRef, fmt.Errorf("decode dashscope realtime audio delta: %w", err)
			}
			audio.Write(chunk)
		case "response.text.delta", "response.audio_transcript.delta":
			text.WriteString(stringField(event, "delta"))
		case "response.text.done", "response.audio_transcript.done":
			if transcript := stringField(event, "transcript", "text"); transcript != "" {
				current := text.String()
				if !strings.Contains(current, transcript) {
					if current != "" && !strings.HasSuffix(current, " ") {
						text.WriteString(" ")
					}
					text.WriteString(transcript)
				}
			}
		case "session.finished":
			return audio.Bytes(), text.String(), providerRef, nil
		}
	}
}

func dashScopeReadRealtimeAudio(ctx context.Context, conn *websocket.Conn) ([]byte, string, error) {
	var audio bytes.Buffer
	providerRef := ""
	for {
		if deadline, ok := ctx.Deadline(); ok {
			_ = conn.SetReadDeadline(deadline)
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return audio.Bytes(), providerRef, err
		}
		var event map[string]any
		if err := json.Unmarshal(raw, &event); err != nil {
			return audio.Bytes(), providerRef, fmt.Errorf("decode dashscope realtime event: %w", err)
		}
		eventType := stringField(event, "type")
		switch eventType {
		case "error":
			errObj, _ := event["error"].(map[string]any)
			return audio.Bytes(), providerRef, fmt.Errorf("dashscope realtime error %s: %s", stringField(errObj, "code"), stringField(errObj, "message"))
		case "response.created", "response.done":
			if response, ok := event["response"].(map[string]any); ok {
				providerRef = firstNonEmptyAI(providerRef, stringField(response, "id"))
			}
			if eventType == "response.done" {
				return audio.Bytes(), providerRef, nil
			}
		case "response.audio.delta":
			providerRef = firstNonEmptyAI(providerRef, stringField(event, "response_id"))
			delta := strings.TrimSpace(stringField(event, "delta"))
			if delta == "" {
				continue
			}
			chunk, err := base64.StdEncoding.DecodeString(delta)
			if err != nil {
				return audio.Bytes(), providerRef, fmt.Errorf("decode dashscope realtime audio delta: %w", err)
			}
			audio.Write(chunk)
		case "session.finished":
			return audio.Bytes(), providerRef, nil
		}
	}
}

func mimeTypeForDashScopeAudioFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav":
		return "audio/wav"
	case "pcm":
		return "audio/L16"
	case "opus":
		return "audio/ogg"
	default:
		return "audio/mpeg"
	}
}

func mimeTypeForDashScopeRealtimeAudioFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "pcm":
		return "audio/L16"
	case "mp3":
		return "audio/mpeg"
	case "opus":
		return "audio/ogg"
	default:
		return "audio/wav"
	}
}

func mimeTypeForDashScopeAudioURL(url, fallbackFormat string) string {
	lower := strings.ToLower(strings.Split(url, "?")[0])
	switch {
	case strings.HasSuffix(lower, ".wav"):
		return "audio/wav"
	case strings.HasSuffix(lower, ".pcm"):
		return "audio/L16"
	case strings.HasSuffix(lower, ".opus"):
		return "audio/ogg"
	case strings.HasSuffix(lower, ".mp3"):
		return "audio/mpeg"
	default:
		return mimeTypeForDashScopeAudioFormat(fallbackFormat)
	}
}

func redactDashScopeTTSBody(body map[string]any) map[string]any {
	out := cloneProviderTemplateMap(body)
	if input, ok := out["input"].(map[string]any); ok {
		if text, ok := input["text"].(string); ok {
			input["text"] = truncateDebugString(text, 240)
		}
	}
	return out
}

func firstNonEmptyAI(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
