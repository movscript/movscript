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
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
)

const (
	stabilityDefaultBaseURL      = "https://api.stability.ai"
	stabilityDefaultPollTimeout  = 10 * time.Minute
	stabilityDefaultPollInterval = 10 * time.Second
	stabilityMinPollInterval     = time.Second
)

type StabilityAdapter struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

func NewStabilityAdapter(apiKey, baseURL string) *StabilityAdapter {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = stabilityDefaultBaseURL
	}
	return &StabilityAdapter{
		APIKey:  strings.TrimSpace(apiKey),
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client:  debugHTTPClient(apiKey, 0),
	}
}

func (a *StabilityAdapter) TextGenerate(_ context.Context, _ TextRequest) (TextResponse, error) {
	return TextResponse{}, fmt.Errorf("stability adapter supports Stable Audio generation only")
}

func (a *StabilityAdapter) ImageGenerate(_ context.Context, _ ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, fmt.Errorf("stability adapter supports Stable Audio generation only")
}

func (a *StabilityAdapter) VideoGenerate(_ context.Context, _ VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, fmt.Errorf("stability adapter supports Stable Audio generation only")
}

func (a *StabilityAdapter) Ping(ctx context.Context) error {
	if strings.TrimSpace(a.APIKey) == "" {
		return fmt.Errorf("stability api_key is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+"/v1/user/account", nil)
	if err != nil {
		return err
	}
	a.addAuth(req)
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("stability credential check HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (a *StabilityAdapter) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	if strings.TrimSpace(a.APIKey) == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("stability api_key is required")
	}
	if req.Kind != media.AudioGenerationKindMusic && req.Kind != media.AudioGenerationKindSFX {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported stability audio generation kind %q", req.Kind)
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("prompt is required")
	}
	if stabilityIsStableAudio3(req.Model) {
		return a.generateStableAudio3(ctx, req, prompt)
	}
	return a.generateStableAudio2(ctx, req, prompt)
}

func (a *StabilityAdapter) generateStableAudio2(ctx context.Context, req media.AudioGenerationRequest, prompt string) (media.AudioGenerationResponse, error) {
	body, contentType, err := stabilityAudioForm(req, prompt, true)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/v2beta/audio/stable-audio-2/text-to-audio", body)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	a.addAuth(httpReq)
	httpReq.Header.Set("Accept", "audio/*")
	httpReq.Header.Set("Content-Type", contentType)
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
		return media.AudioGenerationResponse{}, fmt.Errorf("stability stable audio 2 HTTP %d: %s", resp.StatusCode, string(data))
	}
	return media.AudioGenerationResponse{
		Audio:       data,
		MimeType:    stabilityResponseMime(resp.Header.Get("Content-Type"), stabilityOutputFormat(req)),
		DurationMs:  req.DurationSec * 1000,
		ProviderRef: resp.Header.Get("request-id"),
	}, nil
}

func (a *StabilityAdapter) generateStableAudio3(ctx context.Context, req media.AudioGenerationRequest, prompt string) (media.AudioGenerationResponse, error) {
	body, contentType, err := stabilityAudioForm(req, prompt, false)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/v2beta/audio/stable-audio/text-to-audio", body)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	a.addAuth(httpReq)
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", contentType)
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
		return media.AudioGenerationResponse{}, fmt.Errorf("stability stable audio 3 start HTTP %d: %s", resp.StatusCode, string(data))
	}
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return media.AudioGenerationResponse{}, fmt.Errorf("stability stable audio 3 start JSON: %w", err)
	}
	generationID := stringField(parsed, "id", "generation_id")
	if generationID == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("stability stable audio 3 start response missing id")
	}
	audio, mimeType, err := a.pollStableAudio3(ctx, generationID, stabilityOutputFormat(req), stabilityPollTimeout(req.Params), stabilityPollInterval(req.Params))
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	return media.AudioGenerationResponse{
		Audio:       audio,
		MimeType:    mimeType,
		DurationMs:  req.DurationSec * 1000,
		ProviderRef: generationID,
	}, nil
}

func (a *StabilityAdapter) pollStableAudio3(ctx context.Context, generationID, outputFormat string, timeout, interval time.Duration) ([]byte, string, error) {
	deadline := time.Now().Add(timeout)
	for {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, a.BaseURL+"/v2beta/audio/results/"+url.PathEscape(generationID), nil)
		if err != nil {
			return nil, "", err
		}
		a.addAuth(httpReq)
		httpReq.Header.Set("Accept", "audio/*")
		resp, err := a.client.Do(httpReq)
		if err != nil {
			return nil, "", err
		}
		data, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return nil, "", readErr
		}
		switch resp.StatusCode {
		case http.StatusOK:
			return data, stabilityResponseMime(resp.Header.Get("Content-Type"), outputFormat), nil
		case http.StatusAccepted:
			if time.Now().After(deadline) {
				return nil, "", fmt.Errorf("stability stable audio 3 task %s timed out", generationID)
			}
		default:
			return nil, "", fmt.Errorf("stability stable audio 3 result HTTP %d: %s", resp.StatusCode, string(data))
		}
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		case <-time.After(interval):
		}
	}
}

func stabilityAudioForm(req media.AudioGenerationRequest, prompt string, includeModel bool) (*bytes.Buffer, string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fields := map[string]string{
		"prompt":        prompt,
		"duration":      fmt.Sprintf("%d", stabilityDuration(req)),
		"steps":         fmt.Sprintf("%d", stabilitySteps(req)),
		"output_format": stabilityOutputFormat(req),
	}
	if seed, ok := stabilitySeed(req.Params); ok {
		fields["seed"] = fmt.Sprintf("%d", seed)
	}
	if includeModel {
		fields["model"] = stabilityStableAudio2Model(req.Model)
		if cfgScale, ok := numberParam(req.Params, "cfg_scale"); ok {
			fields["cfg_scale"] = fmt.Sprintf("%g", cfgScale)
		} else {
			fields["cfg_scale"] = "1"
		}
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return nil, "", err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return &body, writer.FormDataContentType(), nil
}

func (a *StabilityAdapter) addAuth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+a.APIKey)
}

func stabilityIsStableAudio3(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	return model == "" || model == "stable-audio-3" || model == "stable-audio" || strings.HasPrefix(model, "stable-audio-3")
}

func stabilityStableAudio2Model(model string) string {
	model = strings.TrimSpace(model)
	switch model {
	case "", "stable-audio-2-5":
		return "stable-audio-2.5"
	default:
		return model
	}
}

func stabilityDuration(req media.AudioGenerationRequest) int {
	if req.DurationSec > 0 {
		return req.DurationSec
	}
	if duration := intParamOrDefault(req.Params, "duration", 0); duration > 0 {
		return duration
	}
	return 30
}

func stabilitySteps(req media.AudioGenerationRequest) int {
	if steps := intParamOrDefault(req.Params, "steps", 8); steps > 0 {
		return steps
	}
	return 8
}

func stabilitySeed(params map[string]any) (int, bool) {
	if seed, ok := numberParam(params, "seed"); ok && seed >= 0 {
		return int(seed), true
	}
	return 0, true
}

func stabilityOutputFormat(req media.AudioGenerationRequest) string {
	format := strings.ToLower(stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, "mp3")))
	switch format {
	case "wav":
		return "wav"
	default:
		return "mp3"
	}
}

func stabilityResponseMime(contentType, outputFormat string) string {
	mimeType := stripContentTypeParams(contentType)
	if mimeType != "" && mimeType != "application/octet-stream" {
		return mimeType
	}
	switch outputFormat {
	case "wav":
		return "audio/wav"
	default:
		return "audio/mpeg"
	}
}

func stabilityPollTimeout(params map[string]any) time.Duration {
	ms := intParamOrDefault(params, "poll_timeout_ms", int(stabilityDefaultPollTimeout/time.Millisecond))
	if ms <= 0 {
		return stabilityDefaultPollTimeout
	}
	return time.Duration(ms) * time.Millisecond
}

func stabilityPollInterval(params map[string]any) time.Duration {
	ms := intParamOrDefault(params, "poll_interval_ms", int(stabilityDefaultPollInterval/time.Millisecond))
	interval := time.Duration(ms) * time.Millisecond
	if interval < stabilityMinPollInterval {
		return stabilityMinPollInterval
	}
	return interval
}
