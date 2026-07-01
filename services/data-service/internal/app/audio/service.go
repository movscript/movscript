package audio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	appresource "github.com/movscript/movscript/internal/app/resource"
	"github.com/movscript/movscript/internal/domain/media"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

var (
	ErrInvalidRequest = errors.New("invalid audio request")
	ErrProvider       = errors.New("audio provider error")
)

type Service struct {
	aiService *ai.AIService
	resources *appresource.Service
	store     storage.Storage
}

type TTSInput struct {
	UserID      uint
	OrgID       *uint
	ModelID     string
	Text        string
	Voice       string
	Language    string
	Model       string
	AudioFormat string
	Filename    string
	Params      json.RawMessage
}

type TTSResult struct {
	Resource    domainresource.RawResource `json:"resource"`
	Voiceover   media.VoiceoverArtifact    `json:"voiceover"`
	ProviderRef string                     `json:"provider_ref,omitempty"`
}

type TranscribeInput struct {
	UserID          uint
	OrgID           *uint
	ModelID         string
	AudioResourceID uint
	Language        string
	Model           string
	Params          json.RawMessage
}

type AlignInput struct {
	UserID          uint
	OrgID           *uint
	ModelID         string
	AudioResourceID uint
	Script          string
	Language        string
	Model           string
	Params          json.RawMessage
}

type TranscribeResult struct {
	Timing      media.TimingMetadata `json:"timing"`
	Text        string               `json:"text"`
	ProviderRef string               `json:"provider_ref,omitempty"`
}

func NewService(db *gorm.DB, aiService *ai.AIService, store storage.Storage) *Service {
	return &Service{
		aiService: aiService,
		resources: appresource.NewService(db, store, nil),
		store:     store,
	}
}

func (s *Service) Synthesize(ctx context.Context, input TTSInput) (TTSResult, error) {
	if input.UserID == 0 {
		return TTSResult{}, fmt.Errorf("%w: user is required", ErrInvalidRequest)
	}
	route, err := s.resolveAudioRoute(ctx, input.UserID, input.ModelID, ai.CapabilityFamilyAudioGeneration)
	if err != nil {
		return TTSResult{}, err
	}
	text := strings.TrimSpace(input.Text)
	if text == "" {
		return TTSResult{}, fmt.Errorf("%w: text is required", ErrInvalidRequest)
	}
	voice := strings.TrimSpace(input.Voice)
	if voice == "" {
		return TTSResult{}, fmt.Errorf("%w: voice is required", ErrInvalidRequest)
	}
	params, err := parseParams(input.Params)
	if err != nil {
		return TTSResult{}, err
	}
	req := media.TTSRequest{
		Text:        text,
		Voice:       voice,
		Language:    strings.TrimSpace(input.Language),
		Model:       strings.TrimSpace(input.Model),
		AudioFormat: strings.TrimSpace(input.AudioFormat),
		Params:      params,
	}
	resp, err := s.aiService.CallTTSWithRouteUsage(ctx, input.UserID, route, req, ai.UsageContext{OrgID: input.OrgID})
	if err != nil {
		return TTSResult{}, fmt.Errorf("%w: %v", ErrProvider, err)
	}
	if len(resp.Audio) == 0 {
		return TTSResult{}, fmt.Errorf("%w: provider returned empty audio", ErrProvider)
	}

	filename := input.Filename
	if strings.TrimSpace(filename) == "" {
		filename = "voiceover"
	}
	outputFormat := firstString(stringFromAny(params["output_format"]), input.AudioFormat)
	filename = withAudioExtension(filename, resp.MimeType, outputFormat)
	resource, err := s.resources.Upload(ctx, appresource.UploadInput{
		UserID:   input.UserID,
		OrgID:    input.OrgID,
		Filename: filename,
		MimeType: resp.MimeType,
		Size:     int64(len(resp.Audio)),
		Data:     resp.Audio,
		Derivative: &appresource.UploadDerivativeInput{
			Operation: "text_to_speech",
			Tool:      "elevenlabs",
			Params:    rawParamsOrEmpty(input.Params),
		},
	})
	if err != nil {
		return TTSResult{}, err
	}
	return TTSResult{
		Resource: resource,
		Voiceover: media.VoiceoverArtifact{
			ResourceID:   resource.ID,
			Text:         text,
			Voice:        voice,
			Language:     strings.TrimSpace(input.Language),
			DurationMs:   resp.DurationMs,
			Provider:     "elevenlabs",
			Model:        firstNonEmpty(input.Model, "eleven_v3"),
			AudioFormat:  outputFormat,
			TimingSource: timingSource(resp.Timing),
		},
		ProviderRef: resp.ProviderRef,
	}, nil
}

func (s *Service) Transcribe(ctx context.Context, input TranscribeInput) (TranscribeResult, error) {
	if input.UserID == 0 {
		return TranscribeResult{}, fmt.Errorf("%w: user is required", ErrInvalidRequest)
	}
	route, err := s.resolveAudioRoute(ctx, input.UserID, input.ModelID, ai.CapabilityFamilyAudioGeneration)
	if err != nil {
		return TranscribeResult{}, err
	}
	if input.AudioResourceID == 0 {
		return TranscribeResult{}, fmt.Errorf("%w: audio_resource_id is required", ErrInvalidRequest)
	}
	params, err := parseParams(input.Params)
	if err != nil {
		return TranscribeResult{}, err
	}
	data, mimeType, err := s.loadAudioResource(ctx, input.AudioResourceID, input.UserID, input.OrgID)
	if err != nil {
		return TranscribeResult{}, err
	}
	resp, err := s.aiService.CallTranscribeWithRouteUsage(ctx, input.UserID, route, media.TranscribeRequest{
		AudioResourceID: input.AudioResourceID,
		Audio:           data,
		MimeType:        mimeType,
		Language:        strings.TrimSpace(input.Language),
		Model:           strings.TrimSpace(input.Model),
		Params:          params,
	}, ai.UsageContext{OrgID: input.OrgID})
	if err != nil {
		return TranscribeResult{}, fmt.Errorf("%w: %v", ErrProvider, err)
	}
	return TranscribeResult{
		Timing:      resp.Timing,
		Text:        strings.TrimSpace(string(resp.Content)),
		ProviderRef: resp.ProviderRef,
	}, nil
}

func (s *Service) Align(ctx context.Context, input AlignInput) (TranscribeResult, error) {
	if input.UserID == 0 {
		return TranscribeResult{}, fmt.Errorf("%w: user is required", ErrInvalidRequest)
	}
	route, err := s.resolveAudioRoute(ctx, input.UserID, input.ModelID, ai.CapabilityFamilyAudioGeneration, ai.CapabilityFamilyAudioGeneration)
	if err != nil {
		return TranscribeResult{}, err
	}
	if input.AudioResourceID == 0 {
		return TranscribeResult{}, fmt.Errorf("%w: audio_resource_id is required", ErrInvalidRequest)
	}
	script := strings.TrimSpace(input.Script)
	if script == "" {
		return TranscribeResult{}, fmt.Errorf("%w: script is required", ErrInvalidRequest)
	}
	params, err := parseParams(input.Params)
	if err != nil {
		return TranscribeResult{}, err
	}
	data, mimeType, err := s.loadAudioResource(ctx, input.AudioResourceID, input.UserID, input.OrgID)
	if err != nil {
		return TranscribeResult{}, err
	}
	resp, err := s.aiService.CallAlignWithRouteUsage(ctx, input.UserID, route, media.AlignRequest{
		AudioResourceID: input.AudioResourceID,
		Audio:           data,
		MimeType:        mimeType,
		Script:          script,
		Language:        strings.TrimSpace(input.Language),
		Model:           strings.TrimSpace(input.Model),
		Params:          params,
	}, ai.UsageContext{OrgID: input.OrgID})
	if err != nil {
		return TranscribeResult{}, fmt.Errorf("%w: %v", ErrProvider, err)
	}
	return TranscribeResult{
		Timing:      resp.Timing,
		Text:        strings.TrimSpace(string(resp.Content)),
		ProviderRef: resp.ProviderRef,
	}, nil
}

func (s *Service) resolveAudioRoute(ctx context.Context, userID uint, modelID string, capabilities ...string) (ai.ModelRoute, error) {
	if s.aiService == nil {
		return ai.ModelRoute{}, fmt.Errorf("%w: ai service is not configured", ErrInvalidRequest)
	}
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return ai.ModelRoute{}, fmt.Errorf("%w: model_id is required", ErrInvalidRequest)
	}
	var lastErr error
	for _, capability := range capabilities {
		route, err := s.aiService.ResolveModelRoute(ai.ModelRouteRequest{
			ModelID:    modelID,
			Capability: capability,
		})
		if err == nil {
			return route, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return ai.ModelRoute{}, fmt.Errorf("%w: %v", ErrProvider, lastErr)
	}
	return ai.ModelRoute{}, fmt.Errorf("%w: no audio capability requested", ErrInvalidRequest)
}

func (s *Service) loadAudioResource(ctx context.Context, resourceID uint, userID uint, orgID *uint) ([]byte, string, error) {
	resource, err := s.resources.GetVisible(ctx, resourceID, userID, orgID)
	if err != nil {
		return nil, "", err
	}
	if resource.StorageKey == "" {
		return nil, "", fmt.Errorf("%w: audio resource has no storage key", ErrInvalidRequest)
	}
	if resource.Type != "audio" && !strings.HasPrefix(resource.MimeType, "audio/") && !strings.HasPrefix(resource.MimeType, "video/") {
		return nil, "", fmt.Errorf("%w: resource must be audio or video", ErrInvalidRequest)
	}
	body, _, contentType, err := s.store.GetObject(ctx, resource.StorageKey, -1, -1)
	if err != nil {
		return nil, "", err
	}
	defer body.Close()
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, "", err
	}
	return data, firstNonEmpty(resource.MimeType, contentType), nil
}

func parseParams(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	if !json.Valid(raw) {
		return nil, fmt.Errorf("%w: params must be valid JSON", ErrInvalidRequest)
	}
	var params map[string]any
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, fmt.Errorf("%w: params must be an object", ErrInvalidRequest)
	}
	if params == nil {
		params = map[string]any{}
	}
	return params, nil
}

func rawParamsOrEmpty(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	return raw
}

func withAudioExtension(name, mimeType, format string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "voiceover"
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if base == "" {
		base = "voiceover"
	}
	return base + audioExtension(mimeType, format)
}

func audioExtension(mimeType, format string) string {
	if strings.HasPrefix(format, "pcm_") {
		return ".wav"
	}
	mimeType = strings.Split(strings.TrimSpace(mimeType), ";")[0]
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

func firstString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	return firstString(values...)
}

func stringFromAny(value any) string {
	if s, ok := value.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func timingSource(timing *media.TimingMetadata) media.TimingSource {
	if timing == nil {
		return ""
	}
	return timing.Source
}
