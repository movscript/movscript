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
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
)

type ElevenLabsAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewElevenLabsAdapter(apiKey, baseURL string) *ElevenLabsAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.elevenlabs.io/v1"
	}
	return &ElevenLabsAdapter{
		APIKey:  strings.TrimSpace(apiKey),
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client:  debugHTTPClient(apiKey, 0),
	}
}

func (a *ElevenLabsAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("elevenlabs adapter supports audio generation only")
}

func (a *ElevenLabsAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("elevenlabs adapter supports audio generation only")
}

func (a *ElevenLabsAdapter) VideoGenerate(_ context.Context, _ VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("elevenlabs adapter supports audio generation only")
}

func (a *ElevenLabsAdapter) Ping(ctx context.Context) error {
	if a.APIKey == "" {
		return fmt.Errorf("elevenlabs api_key is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+"/voices", nil)
	if err != nil {
		return err
	}
	req.Header.Set("xi-api-key", a.APIKey)
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("elevenlabs credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (a *ElevenLabsAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.TTSResponse{}, fmt.Errorf("elevenlabs api_key is required")
	}
	voiceID := strings.TrimSpace(req.Voice)
	if voiceID == "" {
		return media.TTSResponse{}, fmt.Errorf("voice is required")
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return media.TTSResponse{}, fmt.Errorf("text is required")
	}

	outputFormat := stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, "mp3_44100_128"))
	endpoint := a.BaseURL + "/text-to-speech/" + url.PathEscape(voiceID)
	if outputFormat != "" {
		endpoint += "?output_format=" + url.QueryEscape(outputFormat)
	}
	body := map[string]any{
		"text":     text,
		"model_id": firstNonEmptyAI(req.Model, "eleven_v3"),
	}
	if settings := elevenLabsVoiceSettings(req.Params); len(settings) > 0 {
		body["voice_settings"] = settings
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return media.TTSResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", audioAcceptForOutputFormat(outputFormat))

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("elevenlabs TTS HTTP %d: %s", resp.StatusCode, string(data))
	}
	mimeType := resp.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = audioAcceptForOutputFormat(outputFormat)
	}
	return media.TTSResponse{
		Audio:       data,
		MimeType:    stripContentTypeParams(mimeType),
		ProviderRef: resp.Header.Get("request-id"),
	}, nil
}

func (a *ElevenLabsAdapter) Transcribe(ctx context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.SubtitleResponse{}, fmt.Errorf("elevenlabs api_key is required")
	}
	if len(req.Audio) == 0 {
		return media.SubtitleResponse{}, fmt.Errorf("audio is required")
	}
	if strings.Contains(strings.ToLower(firstNonEmptyAI(req.Model, "")), "realtime") {
		return a.transcribeRealtime(ctx, req)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	filename := "audio" + extFromAudioMime(req.MimeType)
	filePart, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if _, err := filePart.Write(req.Audio); err != nil {
		return media.SubtitleResponse{}, err
	}
	_ = writer.WriteField("model_id", firstNonEmptyAI(req.Model, "scribe_v2"))
	if lang := strings.TrimSpace(req.Language); lang != "" {
		_ = writer.WriteField("language_code", lang)
	}
	_ = writer.WriteField("diarize", boolStringParam(req.Params, "diarize", false))
	_ = writer.WriteField("tag_audio_events", boolStringParam(req.Params, "tag_audio_events", true))
	if err := writer.Close(); err != nil {
		return media.SubtitleResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/speech-to-text", &body)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if resp.StatusCode >= 400 {
		return media.SubtitleResponse{}, fmt.Errorf("elevenlabs STT HTTP %d: %s", resp.StatusCode, string(data))
	}

	timing, transcript := parseElevenLabsTranscript(data, req.Language)
	content := []byte(transcript)
	if len(content) == 0 {
		content = data
	}
	return media.SubtitleResponse{
		Timing:      timing,
		Format:      "json",
		Content:     content,
		MimeType:    "application/json",
		ProviderRef: resp.Header.Get("request-id"),
	}, nil
}

func (a *ElevenLabsAdapter) transcribeRealtime(ctx context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	model := firstNonEmptyAI(req.Model, "scribe_v2_realtime")
	endpoint, err := elevenLabsRealtimeSTTURL(a.BaseURL, req.Params, model, req.Language)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	headers := http.Header{}
	headers.Set("xi-api-key", a.APIKey)
	start := time.Now()
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, endpoint, headers)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: map[string]string{"xi-api-key": maskKey(a.APIKey)}, ResponseStatus: status, LatencyMs: latency, Error: err.Error()})
		return media.SubtitleResponse{}, err
	}
	defer conn.Close()

	chunk := map[string]any{
		"message_type":  "input_audio_chunk",
		"audio_base_64": base64.StdEncoding.EncodeToString(req.Audio),
		"commit":        true,
		"sample_rate":   intParamOrDefault(req.Params, "sample_rate", 16000),
	}
	if previous := stringParam(req.Params, "previous_text", ""); previous != "" {
		chunk["previous_text"] = previous
	}
	if err := conn.WriteJSON(chunk); err != nil {
		return media.SubtitleResponse{}, err
	}
	timing, transcript, providerRef, err := readElevenLabsRealtimeTranscript(ctx, conn, req.Language)
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: map[string]string{"xi-api-key": maskKey(a.APIKey)}, LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()})
		return media.SubtitleResponse{}, err
	}
	if strings.TrimSpace(transcript) == "" {
		return media.SubtitleResponse{}, fmt.Errorf("elevenlabs realtime STT returned empty transcript")
	}
	recordDebug(ctx, DebugCallResult{Success: true, ModelID: model, Endpoint: endpoint, Method: "WEBSOCKET", RequestHeaders: map[string]string{"xi-api-key": maskKey(a.APIKey)}, RequestBody: mustJSON(map[string]any{"audio_bytes": len(req.Audio), "sample_rate": chunk["sample_rate"]}), LatencyMs: time.Since(start).Milliseconds()})
	return media.SubtitleResponse{
		Timing:      timing,
		Format:      "json",
		Content:     []byte(transcript),
		MimeType:    "application/json",
		ProviderRef: providerRef,
	}, nil
}

func (a *ElevenLabsAdapter) Align(ctx context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	transcribeReq := media.TranscribeRequest{
		AudioResourceID: req.AudioResourceID,
		Audio:           req.Audio,
		MimeType:        req.MimeType,
		Language:        req.Language,
		Model:           req.Model,
		Params:          req.Params,
	}
	return a.Transcribe(ctx, transcribeReq)
}

func (a *ElevenLabsAdapter) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("elevenlabs api_key is required")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("prompt is required")
	}
	switch req.Kind {
	case media.AudioGenerationKindMusic:
		return a.generateMusic(ctx, req, prompt)
	case media.AudioGenerationKindSFX:
		return a.generateSoundEffect(ctx, req, prompt)
	default:
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported elevenlabs audio generation kind %q", req.Kind)
	}
}

func (a *ElevenLabsAdapter) CloneVoice(ctx context.Context, req media.VoiceCloneRequest) (media.VoiceProfileResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("elevenlabs api_key is required")
	}
	if len(req.Samples) == 0 {
		return media.VoiceProfileResponse{}, fmt.Errorf("at least one voice sample is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("voice name is required")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("name", name)
	if description := strings.TrimSpace(req.Description); description != "" {
		_ = writer.WriteField("description", description)
	}
	if labels := stringParam(req.Params, "labels", ""); labels != "" {
		_ = writer.WriteField("labels", labels)
	}
	if removeNoise, ok := boolParam(req.Params, "remove_background_noise"); ok {
		_ = writer.WriteField("remove_background_noise", fmt.Sprintf("%t", removeNoise))
	}
	for i, sample := range req.Samples {
		if len(sample.Audio) == 0 {
			continue
		}
		filename := fmt.Sprintf("sample_%d%s", i+1, extFromAudioMime(sample.MimeType))
		part, err := writer.CreateFormFile("files", filename)
		if err != nil {
			return media.VoiceProfileResponse{}, err
		}
		if _, err := part.Write(sample.Audio); err != nil {
			return media.VoiceProfileResponse{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return media.VoiceProfileResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/voices/add", &body)
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	data, requestID, err := a.doVoiceProfileRequest(httpReq, "elevenlabs voice clone")
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	resp := parseElevenLabsVoiceProfile(data)
	resp.Name = firstNonEmptyAI(resp.Name, name)
	resp.Description = firstNonEmptyAI(resp.Description, strings.TrimSpace(req.Description))
	resp.ProviderRef = firstNonEmptyAI(resp.ProviderRef, requestID, resp.VoiceID)
	return resp, nil
}

func (a *ElevenLabsAdapter) DesignVoice(ctx context.Context, req media.VoiceDesignRequest) (media.VoiceProfileResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("elevenlabs api_key is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("voice name is required")
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("voice description is required")
	}

	generatedVoiceID := stringParam(req.Params, "generated_voice_id", "")
	var previewURL string
	if generatedVoiceID == "" {
		designResp, err := a.designVoicePreview(ctx, req, description)
		if err != nil {
			return media.VoiceProfileResponse{}, err
		}
		generatedVoiceID = designResp.GeneratedVoiceID
		previewURL = designResp.PreviewURL
		if generatedVoiceID == "" {
			return media.VoiceProfileResponse{}, fmt.Errorf("elevenlabs voice design response did not include generated_voice_id")
		}
	}

	body := map[string]any{
		"voice_name":         name,
		"voice_description":  description,
		"generated_voice_id": generatedVoiceID,
	}
	if labels := stringParam(req.Params, "labels", ""); labels != "" {
		body["labels"] = labels
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/text-to-voice", bytes.NewReader(payload))
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	data, requestID, err := a.doVoiceProfileRequest(httpReq, "elevenlabs voice design save")
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	resp := parseElevenLabsVoiceProfile(data)
	resp.Name = firstNonEmptyAI(resp.Name, name)
	resp.Description = firstNonEmptyAI(resp.Description, description)
	resp.GeneratedVoiceID = firstNonEmptyAI(resp.GeneratedVoiceID, generatedVoiceID)
	resp.PreviewURL = firstNonEmptyAI(resp.PreviewURL, previewURL)
	resp.ProviderRef = firstNonEmptyAI(resp.ProviderRef, requestID, resp.VoiceID)
	return resp, nil
}

func (a *ElevenLabsAdapter) designVoicePreview(ctx context.Context, req media.VoiceDesignRequest, description string) (media.VoiceProfileResponse, error) {
	outputFormat := stringParam(req.Params, "output_format", "")
	endpoint := a.BaseURL + "/text-to-voice/design"
	if outputFormat != "" {
		endpoint += "?output_format=" + url.QueryEscape(outputFormat)
	}
	body := map[string]any{
		"voice_description": description,
		"model_id":          firstNonEmptyAI(req.Model, "eleven_multilingual_ttv_v2"),
	}
	if text := strings.TrimSpace(req.PreviewText); text != "" {
		body["text"] = text
	} else if auto, ok := boolParam(req.Params, "auto_generate_text"); ok {
		body["auto_generate_text"] = auto
	} else {
		body["auto_generate_text"] = true
	}
	if seed, ok := numberParam(req.Params, "seed"); ok {
		body["seed"] = int(seed)
	}
	if guidance, ok := numberParam(req.Params, "guidance_scale"); ok {
		body["guidance_scale"] = guidance
	}
	if loudness, ok := numberParam(req.Params, "loudness"); ok {
		body["loudness"] = loudness
	}
	if quality, ok := numberParam(req.Params, "quality"); ok {
		body["quality"] = quality
	}
	if enhance, ok := boolParam(req.Params, "should_enhance"); ok {
		body["should_enhance"] = enhance
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	data, requestID, err := a.doVoiceProfileRequest(httpReq, "elevenlabs voice design preview")
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	resp := parseElevenLabsVoiceDesignPreview(data)
	resp.ProviderRef = firstNonEmptyAI(resp.ProviderRef, requestID, resp.GeneratedVoiceID)
	return resp, nil
}

func (a *ElevenLabsAdapter) doVoiceProfileRequest(req *http.Request, label string) ([]byte, string, error) {
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("%s HTTP %d: %s", label, resp.StatusCode, string(data))
	}
	return data, resp.Header.Get("request-id"), nil
}

func (a *ElevenLabsAdapter) generateMusic(ctx context.Context, req media.AudioGenerationRequest, prompt string) (media.AudioGenerationResponse, error) {
	outputFormat := stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, "auto"))
	endpoint := a.BaseURL + "/music/stream"
	if outputFormat != "" {
		endpoint += "?output_format=" + url.QueryEscape(outputFormat)
	}
	body := map[string]any{
		"prompt":   prompt,
		"model_id": firstNonEmptyAI(req.Model, "music_v2"),
	}
	if req.DurationSec > 0 {
		body["music_length_ms"] = req.DurationSec * 1000
	}
	if seed, ok := numberParam(req.Params, "seed"); ok && seed >= 0 {
		body["seed"] = int(seed)
	}
	if forceInstrumental, ok := boolParam(req.Params, "force_instrumental"); ok {
		body["force_instrumental"] = forceInstrumental
	}
	if store, ok := boolParam(req.Params, "store_for_inpainting"); ok {
		body["store_for_inpainting"] = store
	}
	return a.postAudioJSON(ctx, endpoint, body, "elevenlabs music", outputFormat, req.DurationSec*1000)
}

func (a *ElevenLabsAdapter) generateSoundEffect(ctx context.Context, req media.AudioGenerationRequest, prompt string) (media.AudioGenerationResponse, error) {
	outputFormat := stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, "mp3_44100_128"))
	endpoint := a.BaseURL + "/sound-generation"
	if outputFormat != "" {
		endpoint += "?output_format=" + url.QueryEscape(outputFormat)
	}
	body := map[string]any{
		"text":     prompt,
		"model_id": firstNonEmptyAI(req.Model, "eleven_text_to_sound_v2"),
	}
	if req.DurationSec > 0 {
		body["duration_seconds"] = req.DurationSec
	}
	if loop, ok := boolParam(req.Params, "loop"); ok {
		body["loop"] = loop
	}
	if influence, ok := numberParam(req.Params, "prompt_influence"); ok {
		body["prompt_influence"] = influence
	}
	return a.postAudioJSON(ctx, endpoint, body, "elevenlabs sound generation", outputFormat, req.DurationSec*1000)
}

func (a *ElevenLabsAdapter) postAudioJSON(ctx context.Context, endpoint string, body map[string]any, label, outputFormat string, durationMs int) (media.AudioGenerationResponse, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	httpReq.Header.Set("xi-api-key", a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", audioAcceptForOutputFormat(outputFormat))

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	if resp.StatusCode >= 400 {
		return media.AudioGenerationResponse{}, fmt.Errorf("%s HTTP %d: %s", label, resp.StatusCode, string(data))
	}
	mimeType := resp.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = audioAcceptForOutputFormat(outputFormat)
	}
	providerRef := firstNonEmptyAI(resp.Header.Get("song-id"), resp.Header.Get("request-id"))
	return media.AudioGenerationResponse{
		Audio:       data,
		MimeType:    stripContentTypeParams(mimeType),
		DurationMs:  durationMs,
		ProviderRef: providerRef,
	}, nil
}

func elevenLabsVoiceSettings(params map[string]any) map[string]any {
	out := map[string]any{}
	if v, ok := numberParam(params, "stability"); ok {
		out["stability"] = v
	}
	if v, ok := numberParam(params, "similarity_boost"); ok {
		out["similarity_boost"] = v
	}
	if v, ok := numberParam(params, "style"); ok {
		out["style"] = v
	}
	if v, ok := boolParam(params, "use_speaker_boost"); ok {
		out["use_speaker_boost"] = v
	}
	if v, ok := numberParam(params, "speed"); ok {
		out["speed"] = v
	}
	return out
}

func parseElevenLabsTranscript(data []byte, language string) (media.TimingMetadata, string) {
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	text := stringField(raw, "text", "transcript")
	words := parseElevenLabsTimedUnits(raw["words"], "word")
	segments := parseElevenLabsTimedUnits(raw["segments"], "segment")
	if len(segments) == 0 && text != "" {
		segments = []media.TimedTextUnit{{ID: "segment_1", Text: text}}
	}
	return media.TimingMetadata{
		Source:   media.TimingSourceSTT,
		Provider: "elevenlabs",
		Language: strings.TrimSpace(language),
		Segments: segments,
		Words:    words,
	}, text
}

func elevenLabsRealtimeSTTURL(baseURL string, params map[string]any, model, language string) (string, error) {
	if raw := strings.TrimSpace(stringParam(params, "realtime_url", "")); raw != "" {
		u, err := url.Parse(raw)
		if err != nil {
			return "", err
		}
		q := u.Query()
		if q.Get("model_id") == "" {
			q.Set("model_id", model)
		}
		u.RawQuery = q.Encode()
		return u.String(), nil
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "https://api.elevenlabs.io/v1"
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
	if strings.HasSuffix(path, "/speech-to-text/realtime") {
		u.Path = path
	} else if path == "" || path == "/" {
		u.Path = "/v1/speech-to-text/realtime"
	} else {
		u.Path = path + "/speech-to-text/realtime"
	}
	q := u.Query()
	q.Set("model_id", model)
	q.Set("include_timestamps", boolStringParam(params, "include_timestamps", true))
	if language = strings.TrimSpace(language); language != "" {
		q.Set("language_code", language)
	} else if language = stringParam(params, "language_code", ""); language != "" {
		q.Set("language_code", language)
	}
	if format := stringParam(params, "audio_format", ""); format != "" {
		q.Set("audio_format", format)
	}
	if strategy := stringParam(params, "commit_strategy", "manual"); strategy != "" {
		q.Set("commit_strategy", strategy)
	}
	if noVerbatim, ok := boolParam(params, "no_verbatim"); ok {
		q.Set("no_verbatim", fmt.Sprintf("%t", noVerbatim))
	}
	for _, keyterm := range stringSliceParam(params, "keyterms") {
		q.Add("keyterms", keyterm)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func readElevenLabsRealtimeTranscript(ctx context.Context, conn *websocket.Conn, language string) (media.TimingMetadata, string, string, error) {
	providerRef := ""
	for {
		if deadline, ok := ctx.Deadline(); ok {
			_ = conn.SetReadDeadline(deadline)
		}
		var event map[string]any
		if err := conn.ReadJSON(&event); err != nil {
			return media.TimingMetadata{}, "", providerRef, err
		}
		switch stringField(event, "message_type") {
		case "session_started":
			providerRef = firstNonEmptyAI(providerRef, stringField(event, "session_id"))
		case "committed_transcript", "committed_transcript_with_timestamps":
			transcript := stringField(event, "text")
			timing := media.TimingMetadata{
				Source:   media.TimingSourceSTT,
				Provider: "elevenlabs",
				Language: firstNonEmptyAI(stringField(event, "language_code"), strings.TrimSpace(language)),
				Words:    parseElevenLabsTimedUnits(event["words"], "word"),
			}
			if transcript != "" {
				timing.Segments = []media.TimedTextUnit{{ID: "segment_1", Text: transcript}}
			}
			return timing, transcript, providerRef, nil
		case "scribe_error", "auth_error", "quota_exceeded", "throttled", "rate_limited", "input_error",
			"chunk_size_exceeded", "insufficient_audio_activity", "transcriber_error", "resource_exhausted":
			return media.TimingMetadata{}, "", providerRef, fmt.Errorf("elevenlabs realtime STT error: %s", firstNonEmptyAI(stringField(event, "message"), stringField(event, "error"), mustJSON(event)))
		}
	}
}

func stringSliceParam(params map[string]any, key string) []string {
	if len(params) == 0 {
		return nil
	}
	value, ok := params[key]
	if !ok {
		return nil
	}
	switch v := value.(type) {
	case []string:
		return append([]string(nil), v...)
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			if s := strings.TrimSpace(part); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		if s := strings.TrimSpace(fmt.Sprint(v)); s != "" {
			return []string{s}
		}
		return nil
	}
}

func parseElevenLabsVoiceProfile(data []byte) media.VoiceProfileResponse {
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	voiceID := firstNonEmptyAI(
		stringField(raw, "voice_id"),
		stringField(raw, "voiceId"),
		stringField(raw, "id"),
	)
	return media.VoiceProfileResponse{
		VoiceID:              voiceID,
		Name:                 stringField(raw, "name", "voice_name"),
		Description:          stringField(raw, "description", "voice_description"),
		PreviewURL:           stringField(raw, "preview_url", "previewUrl"),
		GeneratedVoiceID:     stringField(raw, "generated_voice_id", "generatedVoiceId"),
		RequiresVerification: boolField(raw, "requires_verification", "requiresVerification"),
		ProviderRef:          firstNonEmptyAI(stringField(raw, "request_id"), voiceID),
		Metadata:             raw,
	}
}

func parseElevenLabsVoiceDesignPreview(data []byte) media.VoiceProfileResponse {
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	if previews, ok := raw["previews"].([]any); ok && len(previews) > 0 {
		if preview, ok := previews[0].(map[string]any); ok {
			return media.VoiceProfileResponse{
				GeneratedVoiceID: firstNonEmptyAI(
					stringField(preview, "generated_voice_id"),
					stringField(preview, "generatedVoiceId"),
					stringField(preview, "voice_id"),
				),
				PreviewURL:  stringField(preview, "audio_base_64", "audio_url", "preview_url"),
				ProviderRef: stringField(preview, "generated_voice_id", "voice_id"),
				Metadata:    raw,
			}
		}
	}
	return media.VoiceProfileResponse{
		GeneratedVoiceID: firstNonEmptyAI(
			stringField(raw, "generated_voice_id"),
			stringField(raw, "generatedVoiceId"),
			stringField(raw, "voice_id"),
		),
		PreviewURL:  stringField(raw, "audio_base_64", "audio_url", "preview_url"),
		ProviderRef: stringField(raw, "generated_voice_id", "voice_id"),
		Metadata:    raw,
	}
}

func parseElevenLabsTimedUnits(value any, prefix string) []media.TimedTextUnit {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]media.TimedTextUnit, 0, len(items))
	for i, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		unit := media.TimedTextUnit{
			ID:      fmt.Sprintf("%s_%d", prefix, i+1),
			Text:    firstNonEmptyAI(stringField(m, "text"), stringField(m, "word")),
			StartMs: secondsToMs(floatField(m, "start", "start_time")),
			EndMs:   secondsToMs(floatField(m, "end", "end_time")),
			Speaker: stringField(m, "speaker", "speaker_id"),
		}
		if confidence, ok := numberParam(m, "confidence"); ok {
			unit.Confidence = &confidence
		}
		out = append(out, unit)
	}
	return out
}

func audioAcceptForOutputFormat(format string) string {
	switch {
	case strings.HasPrefix(format, "pcm_"):
		return "audio/wav"
	case strings.HasPrefix(format, "ulaw_"):
		return "audio/basic"
	default:
		return "audio/mpeg"
	}
}

func extFromAudioMime(mimeType string) string {
	mimeType = stripContentTypeParams(mimeType)
	switch mimeType {
	case "audio/wav", "audio/x-wav":
		return ".wav"
	case "audio/ogg":
		return ".ogg"
	case "audio/aac":
		return ".aac"
	case "audio/flac":
		return ".flac"
	case "audio/mp4", "audio/m4a":
		return ".m4a"
	default:
		return ".mp3"
	}
}

func stripContentTypeParams(value string) string {
	if idx := strings.IndexByte(value, ';'); idx >= 0 {
		return strings.TrimSpace(value[:idx])
	}
	return strings.TrimSpace(value)
}

func stringParam(params map[string]any, key, fallback string) string {
	if params != nil {
		if v, ok := params[key].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return strings.TrimSpace(fallback)
}

func boolStringParam(params map[string]any, key string, fallback bool) string {
	if v, ok := boolParam(params, key); ok {
		if v {
			return "true"
		}
		return "false"
	}
	if fallback {
		return "true"
	}
	return "false"
}

func boolParam(params map[string]any, key string) (bool, bool) {
	if params == nil {
		return false, false
	}
	switch v := params[key].(type) {
	case bool:
		return v, true
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "true", "1", "yes":
			return true, true
		case "false", "0", "no":
			return false, true
		}
	}
	return false, false
}

func boolField(params map[string]any, keys ...string) bool {
	for _, key := range keys {
		if value, ok := params[key]; ok {
			switch v := value.(type) {
			case bool:
				return v
			case string:
				return strings.EqualFold(strings.TrimSpace(v), "true")
			}
		}
	}
	return false
}

func numberParam(params map[string]any, key string) (float64, bool) {
	if params == nil {
		return 0, false
	}
	return numberValue(params[key])
}

func floatField(raw map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if v, ok := numberValue(raw[key]); ok {
			return v
		}
	}
	return 0
}

func secondsToMs(seconds float64) int {
	if seconds <= 0 {
		return 0
	}
	return int(seconds*1000 + 0.5)
}

func extensionForAudioResponse(mimeType, format string) string {
	if strings.HasPrefix(format, "pcm_") {
		return ".wav"
	}
	return extFromAudioMime(mimeType)
}

func safeAudioFilename(base, mimeType, format string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "voiceover"
	}
	ext := extensionForAudioResponse(mimeType, format)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	return base + ext
}
