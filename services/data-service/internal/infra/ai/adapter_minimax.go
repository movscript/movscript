package ai

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
)

// MiniMaxAdapter handles MiniMax official APIs that are not OpenAI-compatible.
type MiniMaxAdapter struct {
	BaseURL string
	APIKey  string
	client  *http.Client
}

func NewMiniMaxAdapter(apiKey, baseURL string) *MiniMaxAdapter {
	if baseURL == "" {
		baseURL = "https://api.minimax.io/v1"
	}
	return &MiniMaxAdapter{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		client:  &http.Client{},
	}
}

func (a *MiniMaxAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("minimax adapter currently supports text-to-speech only")
}

func (a *MiniMaxAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("minimax adapter currently supports text-to-speech only")
}

func (a *MiniMaxAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("minimax adapter currently supports text-to-speech only")
}

func (a *MiniMaxAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("minimax api_key is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+"/models", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.APIKey)
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("minimax credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (a *MiniMaxAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.TTSResponse{}, fmt.Errorf("minimax api_key is required")
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return media.TTSResponse{}, fmt.Errorf("text is required")
	}
	model := firstNonEmptyAI(req.Model, "speech-2.8-hd")
	audioFormat := miniMaxAudioFormat(req)
	outputFormat := stringParam(req.Params, "output_format", "hex")
	body := map[string]any{
		"model":         model,
		"text":          text,
		"stream":        false,
		"output_format": outputFormat,
		"voice_setting": map[string]any{
			"voice_id": firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "voice_id", "Chinese_Mandarin_Calm_Female")),
			"speed":    numberParamOrDefault(req.Params, "speed", 1),
			"vol":      numberParamOrDefault(req.Params, "vol", 1),
			"pitch":    numberParamOrDefault(req.Params, "pitch", 0),
		},
		"audio_setting": map[string]any{
			"sample_rate": intParamOrDefault(req.Params, "sample_rate", 32000),
			"bitrate":     intParamOrDefault(req.Params, "bitrate", 128000),
			"format":      audioFormat,
			"channel":     intParamOrDefault(req.Params, "channel", 1),
		},
	}
	if language := strings.TrimSpace(req.Language); language != "" {
		body["language_boost"] = miniMaxLanguageBoost(language)
	} else if languageBoost := stringParam(req.Params, "language_boost", "auto"); languageBoost != "" {
		body["language_boost"] = languageBoost
	}
	if subtitleEnable, ok := boolParam(req.Params, "subtitle_enable"); ok {
		body["subtitle_enable"] = subtitleEnable
	}
	if subtitleType := stringParam(req.Params, "subtitle_type", ""); subtitleType != "" {
		body["subtitle_type"] = subtitleType
	}
	if pronunciationDict, ok := req.Params["pronunciation_dict"]; ok {
		body["pronunciation_dict"] = pronunciationDict
	}
	if voiceModify, ok := req.Params["voice_modify"]; ok {
		body["voice_modify"] = voiceModify
	}

	rawBody, _ := json.Marshal(body)
	endpoint := a.BaseURL + "/t2a_v2"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	reqHeaders := map[string]string{
		"Authorization": "Bearer " + maskKey(a.APIKey),
		"Content-Type":  "application/json",
	}
	start := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: model, Endpoint: endpoint, Method: "POST",
			RequestHeaders: reqHeaders, RequestBody: mustJSON(redactMiniMaxTTSBody(body)), LatencyMs: latency, Error: err.Error(),
		})
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	data, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.TTSResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: model, Endpoint: endpoint, Method: "POST",
		RequestHeaders: reqHeaders, RequestBody: mustJSON(redactMiniMaxTTSBody(body)), ResponseStatus: resp.StatusCode, ResponseBody: string(data), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("minimax TTS HTTP %d: %s", resp.StatusCode, string(data))
	}

	var parsed miniMaxTTSResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode minimax TTS response: %w", err)
	}
	if parsed.BaseResp.StatusCode != 0 {
		return media.TTSResponse{}, fmt.Errorf("minimax TTS error %d: %s", parsed.BaseResp.StatusCode, parsed.BaseResp.StatusMsg)
	}
	audio, err := a.miniMaxAudioBytes(ctx, parsed.Data.Audio, outputFormat)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if len(audio) == 0 {
		return media.TTSResponse{}, fmt.Errorf("minimax TTS returned empty audio")
	}
	return media.TTSResponse{
		Audio:       audio,
		MimeType:    mimeTypeForMiniMaxAudioFormat(audioFormat),
		DurationMs:  parsed.ExtraInfo.AudioLength,
		ProviderRef: parsed.TraceID,
	}, nil
}

func (a *MiniMaxAdapter) miniMaxAudioBytes(ctx context.Context, value, outputFormat string) ([]byte, error) {
	audio := strings.TrimSpace(value)
	if audio == "" {
		return nil, nil
	}
	if strings.EqualFold(outputFormat, "url") || strings.HasPrefix(audio, "http://") || strings.HasPrefix(audio, "https://") {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, audio, nil)
		if err != nil {
			return nil, err
		}
		resp, err := a.client.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("download minimax TTS audio: %w", err)
		}
		defer resp.Body.Close()
		data, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("download minimax TTS audio HTTP %d: %s", resp.StatusCode, string(data))
		}
		return data, nil
	}
	decoded, err := hex.DecodeString(audio)
	if err != nil {
		return nil, fmt.Errorf("decode minimax TTS hex audio: %w", err)
	}
	return decoded, nil
}

type miniMaxTTSResponse struct {
	Data struct {
		Audio  string `json:"audio"`
		Status int    `json:"status"`
	} `json:"data"`
	ExtraInfo struct {
		AudioLength int    `json:"audio_length"`
		AudioFormat string `json:"audio_format"`
	} `json:"extra_info"`
	TraceID  string `json:"trace_id"`
	BaseResp struct {
		StatusCode int    `json:"status_code"`
		StatusMsg  string `json:"status_msg"`
	} `json:"base_resp"`
}

func miniMaxAudioFormat(req media.TTSRequest) string {
	value := strings.TrimSpace(req.AudioFormat)
	if value == "" {
		value = stringParam(req.Params, "audio_format", "mp3")
	}
	switch strings.ToLower(value) {
	case "wav", "flac":
		return strings.ToLower(value)
	default:
		return "mp3"
	}
}

func mimeTypeForMiniMaxAudioFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav":
		return "audio/wav"
	case "flac":
		return "audio/flac"
	default:
		return "audio/mpeg"
	}
}

func miniMaxLanguageBoost(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "zh", "zh-cn", "cmn", "mandarin", "chinese":
		return "Chinese"
	case "yue", "zh-yue", "cantonese":
		return "Chinese,Yue"
	case "en", "en-us", "en-gb", "english":
		return "English"
	case "ja", "jp", "japanese":
		return "Japanese"
	case "ko", "korean":
		return "Korean"
	default:
		return strings.TrimSpace(language)
	}
}

func numberParamOrDefault(params map[string]any, key string, fallback float64) float64 {
	if value, ok := numberParam(params, key); ok {
		return value
	}
	return fallback
}

func intParamOrDefault(params map[string]any, key string, fallback int) int {
	if value, ok := numberParam(params, key); ok {
		return int(value)
	}
	if text := stringParam(params, key, ""); text != "" {
		var parsed int
		if _, err := fmt.Sscanf(text, "%d", &parsed); err == nil {
			return parsed
		}
	}
	return fallback
}

func redactMiniMaxTTSBody(body map[string]any) map[string]any {
	out := make(map[string]any, len(body))
	for key, value := range body {
		if key == "text" {
			if text, ok := value.(string); ok {
				out[key] = truncateDebugString(text, 240)
			} else {
				out[key] = value
			}
			continue
		}
		out[key] = value
	}
	return out
}
