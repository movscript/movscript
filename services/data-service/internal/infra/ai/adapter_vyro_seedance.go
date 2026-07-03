package ai

import (
	"bytes"
	"context"
	"encoding/json"
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
	if vyroSeedanceIsV20Model(req.Model) {
		return a.videoStartSeedance20(ctx, req)
	}
	return a.videoStartLegacy(ctx, req)
}

func (a *VyroSeedanceAdapter) videoStartLegacy(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	refImages, err := vyroReferenceImages(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	mode := vyroSeedanceMode(req, len(refImages))

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", req.Model)
	_ = w.WriteField("prompt", req.Prompt)
	if mode != "" {
		_ = w.WriteField("mode", mode)
	}
	if req.AspectRatio != "" {
		_ = w.WriteField("aspect_ratio", req.AspectRatio)
	}
	if req.Duration > 0 {
		_ = w.WriteField("duration", fmt.Sprintf("%d", req.Duration))
	}
	generateAudio := vyroSeedanceGenerateAudio(req)
	_ = w.WriteField("generate_audio", vyroSeedanceBoolFormValue(generateAudio))
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
	debugBody := vyroSeedanceDebugRequestBody(req, mode, generateAudio, len(refImages))

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	headers := map[string]string{"Content-Type": w.FormDataContentType(), "Authorization": "Bearer " + maskKey(a.APIKey)}
	if err != nil {
		recordDebug(ctx, DebugCallResult{ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: debugBody, LatencyMs: latency, Error: err.Error()})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: debugBody, ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
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

func (a *VyroSeedanceAdapter) videoStartSeedance20(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	if body, ok := vyroSeedance20JSONBody(req); ok {
		return a.postSeedance20JSON(ctx, req, body)
	}
	return a.postSeedance20Multipart(ctx, req)
}

func (a *VyroSeedanceAdapter) postSeedance20JSON(ctx context.Context, req VideoRequest, body map[string]any) (VideoResponse, error) {
	rawBody, err := json.Marshal(body)
	if err != nil {
		return VideoResponse{}, err
	}
	endpoint := strings.TrimRight(a.BaseURL, "/") + "/videos"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + maskKey(a.APIKey)}

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: string(rawBody), LatencyMs: latency, Error: err.Error()})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: string(rawBody), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return VideoResponse{}, fmt.Errorf("vyro seedance API error %d: %s", resp.StatusCode, string(respBody))
	}
	return parseVyroSeedanceStartResponse(ctx, respBody)
}

func (a *VyroSeedanceAdapter) postSeedance20Multipart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", req.Model)
	_ = w.WriteField("prompt", req.Prompt)
	if req.AspectRatio != "" {
		_ = w.WriteField("aspect_ratio", req.AspectRatio)
	}
	if req.Duration > 0 {
		_ = w.WriteField("duration", fmt.Sprintf("%d", req.Duration))
	}
	if req.ResolutionName != "" {
		_ = w.WriteField("resolution", req.ResolutionName)
	}
	generateAudio := vyroSeedanceGenerateAudio(req)
	_ = w.WriteField("generate_audio", fmt.Sprintf("%t", generateAudio))

	imageCount, audioCount, videoCount, err := vyroSeedance20WriteMultipartMedia(ctx, w, req)
	if err != nil {
		return VideoResponse{}, err
	}
	w.Close()

	endpoint := strings.TrimRight(a.BaseURL, "/") + "/videos"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return VideoResponse{}, err
	}
	httpReq.Header.Set("Content-Type", w.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	debugBody := vyroSeedance20MultipartDebugRequestBody(req, generateAudio, imageCount, audioCount, videoCount)

	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	headers := map[string]string{"Content-Type": w.FormDataContentType(), "Authorization": "Bearer " + maskKey(a.APIKey)}
	if err != nil {
		recordDebug(ctx, DebugCallResult{ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: debugBody, LatencyMs: latency, Error: err.Error()})
		return VideoResponse{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: debugBody, ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return VideoResponse{}, fmt.Errorf("vyro seedance API error %d: %s", resp.StatusCode, string(respBody))
	}
	return parseVyroSeedanceStartResponse(ctx, respBody)
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

func parseVyroSeedanceStartResponse(ctx context.Context, respBody []byte) (VideoResponse, error) {
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

func vyroSeedanceIsV20Model(model string) bool {
	normalized := strings.NewReplacer("-", "", "_", "", " ", "", ".", "").Replace(strings.ToLower(strings.TrimSpace(model)))
	return normalized == "seedance20"
}

type vyroSeedance20URLRefs struct {
	images []string
	audio  string
	video  string
}

func vyroSeedance20JSONBody(req VideoRequest) (map[string]any, bool) {
	refs, ok := vyroSeedance20JSONRefs(req)
	if !ok {
		return nil, false
	}
	body := map[string]any{
		"model":          req.Model,
		"prompt":         req.Prompt,
		"generate_audio": vyroSeedanceGenerateAudio(req),
	}
	if req.AspectRatio != "" {
		body["aspect_ratio"] = req.AspectRatio
	}
	if req.Duration > 0 {
		body["duration"] = req.Duration
	}
	if req.ResolutionName != "" {
		body["resolution"] = req.ResolutionName
	}

	groupCount := 0
	if len(refs.images) > 0 {
		groupCount++
	}
	if refs.audio != "" {
		groupCount++
	}
	if refs.video != "" {
		groupCount++
	}
	if groupCount <= 1 {
		if len(refs.images) == 1 {
			body["image_url"] = refs.images[0]
		}
		if len(refs.images) > 1 {
			body["image_urls"] = refs.images
		}
		if refs.audio != "" {
			body["audio_url"] = refs.audio
		}
		if refs.video != "" {
			body["video_url"] = refs.video
		}
		return body, true
	}

	medias := make([]map[string]string, 0, len(refs.images)+2)
	for _, imageURL := range refs.images {
		medias = append(medias, map[string]string{"role": "image", "url": imageURL})
	}
	if refs.audio != "" {
		medias = append(medias, map[string]string{"role": "audio", "url": refs.audio})
	}
	if refs.video != "" {
		medias = append(medias, map[string]string{"role": "video", "url": refs.video})
	}
	body["medias"] = medias
	return body, true
}

func vyroSeedance20JSONRefs(req VideoRequest) (vyroSeedance20URLRefs, bool) {
	var refs vyroSeedance20URLRefs
	if image := strings.TrimSpace(req.Image); image != "" {
		refs.images = append(refs.images, image)
	}
	for _, image := range req.InputImages {
		if image = strings.TrimSpace(image); image != "" {
			refs.images = append(refs.images, image)
		}
	}
	for _, image := range req.InputImageDataList {
		if url := strings.TrimSpace(image.PresignedURL); url != "" {
			refs.images = append(refs.images, url)
			continue
		}
		if len(image.Bytes) > 0 {
			return refs, false
		}
	}
	if audio := strings.TrimSpace(req.InputAudio); audio != "" {
		refs.audio = audio
	}
	if req.InputAudioData != nil {
		if url := strings.TrimSpace(req.InputAudioData.PresignedURL); url != "" {
			refs.audio = url
		} else if len(req.InputAudioData.Bytes) > 0 {
			return refs, false
		}
	}
	if video := strings.TrimSpace(req.InputVideo); video != "" {
		refs.video = video
	}
	if req.InputVideoData != nil {
		if url := strings.TrimSpace(req.InputVideoData.PresignedURL); url != "" {
			refs.video = url
		} else if len(req.InputVideoData.Bytes) > 0 {
			return refs, false
		}
	}
	return refs, true
}

func vyroSeedance20WriteMultipartMedia(ctx context.Context, w *multipart.Writer, req VideoRequest) (int, int, int, error) {
	images, err := vyroSeedance20ImageMedia(ctx, req)
	if err != nil {
		return 0, 0, 0, err
	}
	for i, md := range images {
		if err := vyroSeedance20WriteMediaPart(w, "image", i, md, "image/png", "png"); err != nil {
			return 0, 0, 0, err
		}
	}

	audios, err := vyroSeedance20SingleMedia(ctx, req.InputAudio, req.InputAudioData, "audio/mpeg")
	if err != nil {
		return 0, 0, 0, err
	}
	for i, md := range audios {
		if err := vyroSeedance20WriteMediaPart(w, "audio", i, md, "audio/mpeg", "mp3"); err != nil {
			return 0, 0, 0, err
		}
	}

	videos, err := vyroSeedance20SingleMedia(ctx, req.InputVideo, req.InputVideoData, "video/mp4")
	if err != nil {
		return 0, 0, 0, err
	}
	for i, md := range videos {
		if err := vyroSeedance20WriteMediaPart(w, "video", i, md, "video/mp4", "mp4"); err != nil {
			return 0, 0, 0, err
		}
	}
	return len(images), len(audios), len(videos), nil
}

func vyroSeedance20ImageMedia(ctx context.Context, req VideoRequest) ([]MediaData, error) {
	refs := append([]string{}, req.InputImages...)
	if req.Image != "" {
		refs = append([]string{req.Image}, refs...)
	}
	out := make([]MediaData, 0, len(refs)+len(req.InputImageDataList))
	for _, imageURL := range refs {
		md, err := vyroSeedance20FetchMedia(ctx, imageURL, "image/png")
		if err != nil {
			return nil, fmt.Errorf("fetch seedance image reference: %w", err)
		}
		if len(md.Bytes) > 0 {
			out = append(out, md)
		}
	}
	for _, md := range req.InputImageDataList {
		if len(md.Bytes) > 0 {
			out = append(out, md)
			continue
		}
		if url := strings.TrimSpace(md.PresignedURL); url != "" {
			fetched, err := vyroSeedance20FetchMedia(ctx, url, firstNonEmptyAI(md.MimeType, "image/png"))
			if err != nil {
				return nil, fmt.Errorf("fetch seedance image reference: %w", err)
			}
			out = append(out, fetched)
		}
	}
	return out, nil
}

func vyroSeedance20SingleMedia(ctx context.Context, mediaURL string, mediaData *MediaData, fallbackMime string) ([]MediaData, error) {
	out := make([]MediaData, 0, 2)
	if strings.TrimSpace(mediaURL) != "" {
		md, err := vyroSeedance20FetchMedia(ctx, mediaURL, fallbackMime)
		if err != nil {
			return nil, err
		}
		if len(md.Bytes) > 0 {
			out = append(out, md)
		}
	}
	if mediaData == nil {
		return out, nil
	}
	if len(mediaData.Bytes) > 0 {
		out = append(out, *mediaData)
		return out, nil
	}
	if url := strings.TrimSpace(mediaData.PresignedURL); url != "" {
		md, err := vyroSeedance20FetchMedia(ctx, url, firstNonEmptyAI(mediaData.MimeType, fallbackMime))
		if err != nil {
			return nil, err
		}
		out = append(out, md)
	}
	return out, nil
}

func vyroSeedance20FetchMedia(ctx context.Context, mediaURL, fallbackMime string) (MediaData, error) {
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return MediaData{}, nil
	}
	data, mimeType, err := fetchURLBytes(ctx, mediaURL, "")
	if err != nil {
		return MediaData{}, err
	}
	return MediaData{Bytes: data, MimeType: firstNonEmptyAI(mimeType, fallbackMime)}, nil
}

func vyroSeedance20WriteMediaPart(w *multipart.Writer, field string, index int, md MediaData, fallbackMime, fallbackExt string) error {
	mimeType := firstNonEmptyAI(md.MimeType, fallbackMime)
	ext := vyroSeedanceMediaExt(mimeType, fallbackExt)
	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s%d.%s"`, field, field, index, ext))
	partHeader.Set("Content-Type", mimeType)
	fw, err := w.CreatePart(partHeader)
	if err != nil {
		return err
	}
	_, err = fw.Write(md.Bytes)
	return err
}

func vyroSeedanceMediaExt(mimeType, fallbackExt string) string {
	if idx := strings.Index(mimeType, ";"); idx >= 0 {
		mimeType = strings.TrimSpace(mimeType[:idx])
	}
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "audio/mpeg", "audio/mp3":
		return "mp3"
	case "audio/wav", "audio/x-wav":
		return "wav"
	case "audio/ogg":
		return "ogg"
	case "audio/flac":
		return "flac"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	case "video/quicktime":
		return "mov"
	default:
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/") {
			return imageExtFromMime(mimeType)
		}
		return fallbackExt
	}
}

func vyroSeedanceMode(req VideoRequest, referenceImageCount int) string {
	switch strings.TrimSpace(req.Operation) {
	case VideoOperationReferenceToVideo:
		return VideoOperationReferenceToVideo
	case VideoOperationImageToVideo, VideoOperationFirstFrameToVideo, VideoOperationFirstLastFrameToVideo:
		return VideoOperationReferenceToVideo
	case "", VideoOperationPromptToVideo:
		if referenceImageCount > 0 {
			return VideoOperationReferenceToVideo
		}
		return ""
	default:
		return strings.TrimSpace(req.Operation)
	}
}

func vyroSeedanceBoolFormValue(value bool) string {
	if value {
		return "1"
	}
	return "0"
}

func vyroSeedanceGenerateAudio(req VideoRequest) bool {
	if req.GenerateAudio == nil {
		return true
	}
	return *req.GenerateAudio
}

func vyroSeedanceDebugRequestBody(req VideoRequest, mode string, generateAudio bool, referenceImageCount int) string {
	fields := []string{
		fmt.Sprintf("model=%s", req.Model),
		fmt.Sprintf("prompt=%q", req.Prompt),
	}
	if mode != "" {
		fields = append(fields, "mode="+mode)
	}
	if req.Duration > 0 {
		fields = append(fields, fmt.Sprintf("duration=%d", req.Duration))
	}
	fields = append(fields, "generate_audio="+vyroSeedanceBoolFormValue(generateAudio))
	if req.AspectRatio != "" {
		fields = append(fields, "aspect_ratio="+req.AspectRatio)
	}
	fields = append(fields, fmt.Sprintf("reference_images=%d", referenceImageCount))
	return "(multipart: " + strings.Join(fields, " ") + ")"
}

func vyroSeedance20MultipartDebugRequestBody(req VideoRequest, generateAudio bool, imageCount, audioCount, videoCount int) string {
	fields := []string{
		fmt.Sprintf("model=%s", req.Model),
		fmt.Sprintf("prompt=%q", req.Prompt),
		fmt.Sprintf("generate_audio=%t", generateAudio),
	}
	if req.Duration > 0 {
		fields = append(fields, fmt.Sprintf("duration=%d", req.Duration))
	}
	if req.AspectRatio != "" {
		fields = append(fields, "aspect_ratio="+req.AspectRatio)
	}
	if req.ResolutionName != "" {
		fields = append(fields, "resolution="+req.ResolutionName)
	}
	fields = append(fields, fmt.Sprintf("image=%d", imageCount), fmt.Sprintf("audio=%d", audioCount), fmt.Sprintf("video=%d", videoCount))
	return "(multipart: " + strings.Join(fields, " ") + ")"
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
