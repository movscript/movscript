package ai

import (
	"context"
	"fmt"

	"github.com/movscript/movscript/internal/domain/media"
)

func (s *AIService) CallTTS(ctx context.Context, userID, modelConfigID uint, req media.TTSRequest, usage UsageContext) (media.TTSResponse, error) {
	ctx = withProviderUserID(ctx, userID)
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilityAudioTTS)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if len(candidates) == 0 {
		return media.TTSResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityAudioTTS)
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilityAudioTTS), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilityAudioTTS)
		if err != nil {
			lastErr = err
			continue
		}
		ttsProvider, ok := provider.(media.TTSProvider)
		if !ok {
			lastErr = fmt.Errorf("model config id=%d does not support text-to-speech", attempt.cfg.ID)
			continue
		}
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = resolveModelID(cfg, def)
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, CapabilityAudioTTS, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return media.TTSResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		resp, err := ttsProvider.Synthesize(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			lastErr = err
			continue
		}
		estimate := estimateUsageCost(cfg, def, CapabilityAudioTTS, 0, 0, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return media.TTSResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return media.TTSResponse{}, lastErr
	}
	return media.TTSResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityAudioTTS)
}

func (s *AIService) CallTranscribe(ctx context.Context, userID, modelConfigID uint, req media.TranscribeRequest, usage UsageContext) (media.SubtitleResponse, error) {
	ctx = withProviderUserID(ctx, userID)
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilityAudioSTT)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if len(candidates) == 0 {
		return media.SubtitleResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityAudioSTT)
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilityAudioSTT), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilityAudioSTT)
		if err != nil {
			lastErr = err
			continue
		}
		subtitleProvider, ok := provider.(media.SubtitleProvider)
		if !ok {
			lastErr = fmt.Errorf("model config id=%d does not support audio transcription", attempt.cfg.ID)
			continue
		}
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = resolveModelID(cfg, def)
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, CapabilityAudioSTT, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return media.SubtitleResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		resp, err := subtitleProvider.Transcribe(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			lastErr = err
			continue
		}
		estimate := estimateUsageCost(cfg, def, CapabilityAudioSTT, 0, 0, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return media.SubtitleResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return media.SubtitleResponse{}, lastErr
	}
	return media.SubtitleResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityAudioSTT)
}
