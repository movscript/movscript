package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
)

func (s *AIService) CallTTSWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TTSRequest, usage UsageContext) (media.TTSResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityAudioTTS)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if !handled {
		return media.TTSResponse{}, fmt.Errorf("catalog route is required for text-to-speech")
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
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityAudioTTS, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return media.TTSResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := ttsProvider.Synthesize(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.TTSResponse{}, err
	}
	estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityAudioTTS, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return media.TTSResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallAudioGenerateWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, capability string, req media.AudioGenerationRequest, usage UsageContext) (media.AudioGenerationResponse, error) {
	if !isAudioGenerationCapability(capability) {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported audio generation capability %q", capability)
	}
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
	if err != nil {
		return media.AudioGenerationResponse{}, err
	}
	if !handled {
		return media.AudioGenerationResponse{}, fmt.Errorf("catalog route is required for audio generation")
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
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, runtime.def), 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return media.AudioGenerationResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := audioProvider.GenerateAudio(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.AudioGenerationResponse{}, err
	}
	estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, capability, 0, 0, positiveAudioDuration(attemptReq.DurationSec, runtime.def), 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return media.AudioGenerationResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallTranscribeWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TranscribeRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityAudioSTT)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if !handled {
		return media.SubtitleResponse{}, fmt.Errorf("catalog route is required for audio transcription")
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
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityAudioSTT, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return media.SubtitleResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := subtitleProvider.Transcribe(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.SubtitleResponse{}, err
	}
	estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityAudioSTT, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return media.SubtitleResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallAlignWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.AlignRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range []string{CapabilitySubAlign, CapabilityAudioSTT} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			if catalogRouteCapabilityMismatch(err, capability) {
				continue
			}
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
			estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, capability, 0, 0, 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
			if err != nil {
				return media.SubtitleResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
		resp, err := subtitleProvider.Align(ctx, attemptReq)
		finishAttempt(err)
		if err != nil {
			_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
			return media.SubtitleResponse{}, err
		}
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, capability, 0, 0, 0, 1)
		if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
			return media.SubtitleResponse{}, err
		}
		return resp, nil
	}
	return media.SubtitleResponse{}, fmt.Errorf("catalog route is required for subtitle alignment")
}

func catalogRouteCapabilityMismatch(err error, capability string) bool {
	return err != nil && strings.Contains(err.Error(), " does not support "+capability)
}

func (s *AIService) CallSubtitleTranslateWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req media.TranslateSubtitleRequest, usage UsageContext) (media.SubtitleResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilitySubTranslate)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	if !handled {
		return media.SubtitleResponse{}, fmt.Errorf("catalog route is required for subtitle translation")
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
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilitySubTranslate, 0, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return media.SubtitleResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := translateProvider.TranslateSubtitle(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return media.SubtitleResponse{}, err
	}
	estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilitySubTranslate, 0, 0, 0, 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return media.SubtitleResponse{}, err
	}
	return resp, nil
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
