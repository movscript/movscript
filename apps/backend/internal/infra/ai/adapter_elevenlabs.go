package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

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
