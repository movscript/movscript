package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (w *Worker) runAudioTTSJob(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, params generationParams, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StateCallingProvider, "call audio provider")
	req := media.TTSRequest{
		Text:        job.Prompt,
		Voice:       params.String("voice"),
		Language:    params.String("language"),
		Model:       params.String("model"),
		AudioFormat: firstNonEmpty(params.String("audio_format"), params.String("response_format"), params.String("output_format")),
		Params:      params.values,
	}
	route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
	if err != nil {
		return err
	}
	resp, err := w.aiService.CallTTSWithRouteUsage(debugCtx, job.UserID, route, req, w.usageContext(job))
	if err != nil {
		w.saveDebugInfo(job, debugResult)
		return err
	}
	if len(resp.Audio) == 0 {
		return fmt.Errorf("no audio bytes returned by provider")
	}
	sm.succeed("provider returned audio bytes")

	mimeType := firstNonEmpty(resp.MimeType, "audio/mpeg")
	return w.completeProviderBytes(ctx, job, resp.Audio, mimeType, sm, debugResult)
}

func (w *Worker) runAudioGenerateJob(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, params generationParams, sm *jobStateMachine, debugResult *ai.DebugCallResult, capability string) error {
	sm.enter(StateCallingProvider, "call audio generation provider")
	kind := media.AudioGenerationKindMusic
	if capability == ai.CapabilityAudioSFX {
		kind = media.AudioGenerationKindSFX
	}
	req := media.AudioGenerationRequest{
		Kind:           kind,
		Prompt:         job.Prompt,
		NegativePrompt: params.String("negative_prompt"),
		Language:       params.String("language"),
		Model:          params.String("model"),
		AudioFormat:    firstNonEmpty(params.String("audio_format"), params.String("response_format"), params.String("output_format")),
		DurationSec:    firstPositive(params.Int("duration"), params.Int("duration_sec")),
		Params:         params.values,
	}
	route, err := w.resolveJobModelRoute(ctx, job, capability)
	if err != nil {
		return err
	}
	resp, err := w.aiService.CallAudioGenerateWithRouteUsage(debugCtx, job.UserID, route, capability, req, w.usageContext(job))
	if err != nil {
		w.saveDebugInfo(job, debugResult)
		return err
	}
	if len(resp.Audio) == 0 {
		return fmt.Errorf("no audio bytes returned by provider")
	}
	sm.succeed("provider returned audio bytes")

	mimeType := firstNonEmpty(resp.MimeType, "audio/mpeg")
	return w.completeProviderBytes(ctx, job, resp.Audio, mimeType, sm, debugResult)
}

func (w *Worker) runSubtitleJob(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, params generationParams, sm *jobStateMachine, debugResult *ai.DebugCallResult, capability string, audioData []ai.MediaData, textData []ai.MediaData) error {
	sm.enter(StateCallingProvider, "call subtitle provider")
	route, err := w.resolveJobModelRoute(ctx, job, capability)
	if err != nil {
		return err
	}

	var resp media.SubtitleResponse
	switch capability {
	case ai.CapabilityAudioSTT:
		if len(audioData) == 0 {
			return fmt.Errorf("audio_transcribe requires an audio input resource")
		}
		audio := audioData[0]
		resp, err = w.aiService.CallTranscribeWithRouteUsage(debugCtx, job.UserID, route, media.TranscribeRequest{
			AudioResourceID: audio.ResourceID,
			Audio:           audio.Bytes,
			MimeType:        audio.MimeType,
			Language:        firstNonEmpty(params.String("language"), params.String("source_language")),
			Model:           params.String("model"),
			Params:          params.values,
		}, w.usageContext(job))
	case ai.CapabilitySubAlign:
		if len(audioData) == 0 {
			return fmt.Errorf("subtitle_align requires an audio input resource")
		}
		audio := audioData[0]
		resp, err = w.aiService.CallAlignWithRouteUsage(debugCtx, job.UserID, route, media.AlignRequest{
			AudioResourceID: audio.ResourceID,
			Audio:           audio.Bytes,
			MimeType:        audio.MimeType,
			Script:          firstNonEmpty(params.String("script"), params.String("text"), job.Prompt),
			Language:        firstNonEmpty(params.String("language"), params.String("source_language")),
			Model:           params.String("model"),
			Params:          params.values,
		}, w.usageContext(job))
	case ai.CapabilitySubTranslate:
		source := []byte(strings.TrimSpace(job.Prompt))
		mimeType := "text/plain"
		var sourceResourceID uint
		if len(textData) > 0 {
			source = textData[0].Bytes
			mimeType = firstNonEmpty(textData[0].MimeType, mimeType)
			sourceResourceID = textData[0].ResourceID
		}
		if len(source) == 0 {
			return fmt.Errorf("subtitle_translate requires subtitle text or a text input resource")
		}
		resp, err = w.aiService.CallSubtitleTranslateWithRouteUsage(debugCtx, job.UserID, route, media.TranslateSubtitleRequest{
			SubtitleResourceID: sourceResourceID,
			Subtitle:           source,
			MimeType:           mimeType,
			SourceLanguage:     params.String("source_language"),
			TargetLanguage:     firstNonEmpty(params.String("target_language"), params.String("language")),
			Model:              params.String("model"),
			Params:             params.values,
		}, w.usageContext(job))
	default:
		return fmt.Errorf("unsupported subtitle capability %q", capability)
	}
	if err != nil {
		w.saveDebugInfo(job, debugResult)
		return err
	}
	data, mimeType, err := subtitleResponseBytes(resp, params)
	if err != nil {
		return err
	}
	sm.succeed("provider returned subtitle bytes")
	return w.completeProviderBytes(ctx, job, data, mimeType, sm, debugResult)
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func subtitleResponseBytes(resp media.SubtitleResponse, params generationParams) ([]byte, string, error) {
	if len(resp.Content) > 0 {
		return resp.Content, firstNonEmpty(resp.MimeType, subtitleMimeType(firstNonEmpty(resp.Format, params.String("subtitle_format"), params.String("format")))), nil
	}
	payload := map[string]any{
		"format": resp.Format,
		"timing": resp.Timing,
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, "", fmt.Errorf("encode subtitle timing: %w", err)
	}
	return data, "application/json", nil
}

func subtitleMimeType(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "srt":
		return "application/x-subrip"
	case "vtt", "webvtt":
		return "text/vtt"
	case "ass":
		return "text/x-ass"
	case "json":
		return "application/json"
	default:
		return "text/plain"
	}
}
