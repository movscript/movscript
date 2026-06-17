package ai

import (
	"context"
	"fmt"

	"github.com/movscript/movscript/internal/domain/media"
)

func (s *AIService) CallTTS(ctx context.Context, userID, modelConfigID uint, req media.TTSRequest, usage UsageContext) (media.TTSResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
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

func (s *AIService) CallTTSWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TTSRequest, usage UsageContext) (media.TTSResponse, error) {
	usage = usageWithCatalogEntry(usage, route.CatalogEntryID)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityAudioTTS)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if !handled {
		return s.CallTTS(ctx, userID, route.ModelConfigID, req, usage)
	}
	ttsProvider, ok := runtime.provider.(media.TTSProvider)
	if !ok {
		return media.TTSResponse{}, fmt.Errorf("catalog entry id=%d does not support text-to-speech", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	if attemptReq.Model == "" {
		attemptReq.Model = route.ProviderModelID
	}
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(runtime.config, runtime.def, CapabilityAudioTTS, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.ModelConfigID, estimate, usage)
		if err != nil {
			return media.TTSResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.ModelConfigID)
	resp, err := ttsProvider.Synthesize(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.TTSResponse{}, err
	}
	estimate := estimateUsageCost(runtime.config, runtime.def, CapabilityAudioTTS, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.ModelConfigID, estimate, usage); err != nil {
		return media.TTSResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallAudioGenerate(ctx context.Context, userID, modelConfigID uint, capability string, req media.AudioGenerationRequest, usage UsageContext) (media.AudioGenerationResponse, error) {
	if !isAudioGenerationCapability(capability) {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported audio generation capability %q", capability)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	candidates, err := s.runtimeModelCandidates(modelConfigID, capability)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	if len(candidates) == 0 {
		return media.AudioGenerationResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, capability)
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, capability), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, capability)
		if err != nil {
			lastErr = err
			continue
		}
		audioProvider, ok := provider.(media.AudioGenerationProvider)
		if !ok {
			lastErr = fmt.Errorf("model config id=%d does not support audio generation", attempt.cfg.ID)
			continue
		}
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = resolveModelID(cfg, def)
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, def), 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return media.AudioGenerationResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		resp, err := audioProvider.GenerateAudio(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			lastErr = err
			continue
		}
		estimate := estimateUsageCost(cfg, def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, def), 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return media.AudioGenerationResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return media.AudioGenerationResponse{}, lastErr
	}
	return media.AudioGenerationResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, capability)
}

func (s *AIService) CallAudioGenerateWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, capability string, req media.AudioGenerationRequest, usage UsageContext) (media.AudioGenerationResponse, error) {
	if !isAudioGenerationCapability(capability) {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported audio generation capability %q", capability)
	}
	usage = usageWithCatalogEntry(usage, route.CatalogEntryID)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	if !handled {
		return s.CallAudioGenerate(ctx, userID, route.ModelConfigID, capability, req, usage)
	}
	audioProvider, ok := runtime.provider.(media.AudioGenerationProvider)
	if !ok {
		return media.AudioGenerationResponse{}, fmt.Errorf("catalog entry id=%d does not support audio generation", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	if attemptReq.Model == "" {
		attemptReq.Model = route.ProviderModelID
	}
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(runtime.config, runtime.def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, runtime.def), 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.ModelConfigID, estimate, usage)
		if err != nil {
			return media.AudioGenerationResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.ModelConfigID)
	resp, err := audioProvider.GenerateAudio(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.AudioGenerationResponse{}, err
	}
	estimate := estimateUsageCost(runtime.config, runtime.def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, runtime.def), 1)
	if err := s.settleUsage(ctx, userID, route.ModelConfigID, estimate, usage); err != nil {
		return media.AudioGenerationResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallTranscribe(ctx context.Context, userID, modelConfigID uint, req media.TranscribeRequest, usage UsageContext) (media.SubtitleResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
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

func (s *AIService) CallTranscribeWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TranscribeRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithCatalogEntry(usage, route.CatalogEntryID)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityAudioSTT)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if !handled {
		return s.CallTranscribe(ctx, userID, route.ModelConfigID, req, usage)
	}
	subtitleProvider, ok := runtime.provider.(media.SubtitleProvider)
	if !ok {
		return media.SubtitleResponse{}, fmt.Errorf("catalog entry id=%d does not support audio transcription", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	if attemptReq.Model == "" {
		attemptReq.Model = route.ProviderModelID
	}
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(runtime.config, runtime.def, CapabilityAudioSTT, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.ModelConfigID, estimate, usage)
		if err != nil {
			return media.SubtitleResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.ModelConfigID)
	resp, err := subtitleProvider.Transcribe(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.SubtitleResponse{}, err
	}
	estimate := estimateUsageCost(runtime.config, runtime.def, CapabilityAudioSTT, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.ModelConfigID, estimate, usage); err != nil {
		return media.SubtitleResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallAlign(ctx context.Context, userID, modelConfigID uint, req media.AlignRequest, usage UsageContext) (media.SubtitleResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	candidates, capability, err := s.runtimeAlignModelAttemptCandidates(modelConfigID)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if len(candidates) == 0 {
		return media.SubtitleResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilitySubAlign)
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, capability), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, capability)
		if err != nil {
			lastErr = err
			continue
		}
		subtitleProvider, ok := provider.(media.SubtitleProvider)
		if !ok {
			lastErr = fmt.Errorf("model config id=%d does not support subtitle alignment", attempt.cfg.ID)
			continue
		}
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = resolveModelID(cfg, def)
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, capability, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return media.SubtitleResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		resp, err := subtitleProvider.Align(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			lastErr = err
			continue
		}
		estimate := estimateUsageCost(cfg, def, capability, 0, 0, 0, 1)
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

func (s *AIService) CallAlignWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.AlignRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithCatalogEntry(usage, route.CatalogEntryID)
	for _, capability := range []string{CapabilitySubAlign, CapabilityAudioSTT} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return media.SubtitleResponse{}, err
		}
		if !handled {
			continue
		}
		subtitleProvider, ok := runtime.provider.(media.SubtitleProvider)
		if !ok {
			return media.SubtitleResponse{}, fmt.Errorf("catalog entry id=%d does not support subtitle alignment", route.CatalogEntryID)
		}
		ctx = withProviderSubject(ctx, userID, usage.OrgID)
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = route.ProviderModelID
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(runtime.config, runtime.def, capability, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, route.ModelConfigID, estimate, usage)
			if err != nil {
				return media.SubtitleResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(route.ModelConfigID)
		resp, err := subtitleProvider.Align(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
			return media.SubtitleResponse{}, err
		}
		estimate := estimateUsageCost(runtime.config, runtime.def, capability, 0, 0, 0, 1)
		if err := s.settleUsage(ctx, userID, route.ModelConfigID, estimate, usage); err != nil {
			return media.SubtitleResponse{}, err
		}
		return resp, nil
	}
	return s.CallAlign(ctx, userID, route.ModelConfigID, req, usage)
}

func (s *AIService) CallSubtitleTranslate(ctx context.Context, userID, modelConfigID uint, req media.TranslateSubtitleRequest, usage UsageContext) (media.SubtitleResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilitySubTranslate)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if len(candidates) == 0 {
		return media.SubtitleResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilitySubTranslate)
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilitySubTranslate), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilitySubTranslate)
		if err != nil {
			lastErr = err
			continue
		}
		translateProvider, ok := provider.(media.SubtitleTranslateProvider)
		if !ok {
			lastErr = fmt.Errorf("model config id=%d does not support subtitle translation", attempt.cfg.ID)
			continue
		}
		attemptReq := req
		if attemptReq.Model == "" {
			attemptReq.Model = resolveModelID(cfg, def)
		}
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, CapabilitySubTranslate, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return media.SubtitleResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		resp, err := translateProvider.TranslateSubtitle(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			lastErr = err
			continue
		}
		estimate := estimateUsageCost(cfg, def, CapabilitySubTranslate, 0, 0, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return media.SubtitleResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return media.SubtitleResponse{}, lastErr
	}
	return media.SubtitleResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilitySubTranslate)
}

func (s *AIService) CallSubtitleTranslateWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TranslateSubtitleRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithCatalogEntry(usage, route.CatalogEntryID)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilitySubTranslate)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if !handled {
		return s.CallSubtitleTranslate(ctx, userID, route.ModelConfigID, req, usage)
	}
	translateProvider, ok := runtime.provider.(media.SubtitleTranslateProvider)
	if !ok {
		return media.SubtitleResponse{}, fmt.Errorf("catalog entry id=%d does not support subtitle translation", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	if attemptReq.Model == "" {
		attemptReq.Model = route.ProviderModelID
	}
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(runtime.config, runtime.def, CapabilitySubTranslate, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.ModelConfigID, estimate, usage)
		if err != nil {
			return media.SubtitleResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.ModelConfigID)
	resp, err := translateProvider.TranslateSubtitle(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.SubtitleResponse{}, err
	}
	estimate := estimateUsageCost(runtime.config, runtime.def, CapabilitySubTranslate, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.ModelConfigID, estimate, usage); err != nil {
		return media.SubtitleResponse{}, err
	}
	return resp, nil
}

func (s *AIService) runtimeAlignModelAttemptCandidates(modelConfigID uint) ([]runtimeModelCandidate, string, error) {
	alignCandidates, alignErr := s.runtimeModelCandidates(modelConfigID, CapabilitySubAlign)
	if alignErr == nil && len(alignCandidates) > 0 {
		return alignCandidates, CapabilitySubAlign, nil
	}
	sttCandidates, sttErr := s.runtimeModelCandidates(modelConfigID, CapabilityAudioSTT)
	if sttErr == nil && len(sttCandidates) > 0 {
		return sttCandidates, CapabilityAudioSTT, nil
	}
	if alignErr != nil {
		return nil, "", alignErr
	}
	return nil, "", sttErr
}

func isAudioGenerationCapability(capability string) bool {
	return capability == CapabilityAudioMusic || capability == CapabilityAudioSFX
}

func positiveAudioDuration(durationSec int, def *ModelDef) int {
	if durationSec > 0 {
		return durationSec
	}
	if def != nil && def.DefaultDurSec > 0 {
		return def.DefaultDurSec
	}
	return 1
}
