package ai

import (
	"context"
	"fmt"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (s *AIService) CallImageWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req ImageRequest, usage UsageContext) (ImageResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range []string{CapabilityImage, CapabilityImageEdit} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return ImageResponse{}, err
		}
		if handled {
			return s.callCatalogImageRuntime(ctx, userID, route, runtime, capability, req, usage)
		}
	}
	return ImageResponse{}, fmt.Errorf("catalog route is required for image generation")
}

func (s *AIService) callCatalogImageRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, capability string, req ImageRequest, usage UsageContext) (ImageResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	if capability == CapabilityImageEdit {
		attemptReq.EditOnly = true
	}
	attemptReq.Model = route.ProviderModelID
	if runtime.def.ImageEditField != "" {
		attemptReq.ImageFieldName = runtime.def.ImageEditField
	}
	n := attemptReq.N
	if n <= 0 {
		n = 1
	}
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, "image", 0, 0, 0, n)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return ImageResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := runtime.provider.ImageGenerate(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return ImageResponse{}, err
	}
	estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, "image", 0, 0, 0, n)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return ImageResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallVideoWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req VideoRequest, usage UsageContext) (VideoResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return VideoResponse{}, err
		}
		if handled {
			return s.callCatalogVideoRuntime(ctx, userID, route, runtime, req, usage)
		}
	}
	return VideoResponse{}, fmt.Errorf("catalog route is required for video generation")
}

func (s *AIService) callCatalogVideoRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, req VideoRequest, usage UsageContext) (VideoResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	prepareVideoRequestForModel(&attemptReq, route.ProviderModelID, runtime.def)
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, "video", 0, 0, positiveDuration(attemptReq.Duration, runtime.def), 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return VideoResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := runtime.provider.VideoGenerate(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return VideoResponse{}, err
	}
	if err := s.settleVideoUsage(ctx, userID, route.RuntimeModelID, runtime.model.usageProfile(), runtime.def, attemptReq.Duration, resp.DurationSec, usage); err != nil {
		return VideoResponse{}, err
	}
	return resp, nil
}

func (s *AIService) SupportsVideoTasksRoute(ctx context.Context, userID uint, route ModelRoute) bool {
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return false
		}
		if handled {
			_, ok := runtime.provider.(VideoTaskProvider)
			return ok
		}
	}
	return false
}

func (s *AIService) SupportsVideoTaskCancellationRoute(ctx context.Context, userID uint, route ModelRoute) bool {
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return false
		}
		if handled {
			_, ok := runtime.provider.(VideoTaskCancelProvider)
			return ok
		}
	}
	return false
}

func (s *AIService) CallVideoStartWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req VideoRequest, usage UsageContext) (VideoResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return VideoResponse{}, err
		}
		if handled {
			taskProvider, ok := runtime.provider.(VideoTaskProvider)
			if !ok {
				return VideoResponse{}, fmt.Errorf("catalog entry id=%d does not support async video task polling", route.CatalogEntryID)
			}
			ctx = withProviderSubject(ctx, userID, usage.OrgID)
			attemptReq := req
			prepareVideoRequestForModel(&attemptReq, route.ProviderModelID, runtime.def)
			if usage.ReservationID == nil {
				estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, "video", 0, 0, positiveDuration(attemptReq.Duration, runtime.def), 1)
				reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
				if err != nil {
					return VideoResponse{}, err
				}
				usage.ReservationID = &reservation.ID
			}
			finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
			resp, err := taskProvider.VideoStart(ctx, attemptReq)
			finishAttempt(err)
			if err != nil {
				_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
				return VideoResponse{}, err
			}
			if resp.URL != "" || len(resp.ContentBytes) > 0 {
				if err := s.settleVideoUsage(ctx, userID, route.RuntimeModelID, runtime.model.usageProfile(), runtime.def, attemptReq.Duration, resp.DurationSec, usage); err != nil {
					return VideoResponse{}, err
				}
			}
			return resp, nil
		}
	}
	return VideoResponse{}, fmt.Errorf("catalog route is required for video task start")
}

func (s *AIService) CallVideoPollWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, taskID, taskKind string, requestedDuration int, usage UsageContext) (VideoResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return VideoResponse{}, err
		}
		if handled {
			ctx = withProviderSubject(ctx, userID, usage.OrgID)
			taskProvider, ok := runtime.provider.(VideoTaskProvider)
			if !ok {
				return VideoResponse{}, fmt.Errorf("catalog entry id=%d does not support async video task polling", route.CatalogEntryID)
			}
			resp, err := taskProvider.VideoPoll(ctx, VideoPollRequest{
				Model:    route.ProviderModelID,
				TaskID:   taskID,
				TaskKind: taskKind,
			})
			if err != nil {
				return resp, err
			}
			if resp.Status == VideoStatusSucceeded && (resp.URL != "" || len(resp.ContentBytes) > 0) {
				if err := s.settleVideoUsage(ctx, userID, route.RuntimeModelID, runtime.model.usageProfile(), runtime.def, requestedDuration, resp.DurationSec, usage); err != nil {
					return resp, err
				}
			}
			return resp, nil
		}
	}
	return VideoResponse{}, fmt.Errorf("catalog route is required for video task polling")
}

func (s *AIService) CallVideoCancelRoute(ctx context.Context, userID uint, route ModelRoute, taskID, taskKind string) (VideoResponse, error) {
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return VideoResponse{}, err
		}
		if handled {
			ctx = withProviderUserID(ctx, userID)
			cancelProvider, ok := runtime.provider.(VideoTaskCancelProvider)
			if !ok {
				return VideoResponse{}, fmt.Errorf("catalog entry id=%d does not support async video task cancellation", route.CatalogEntryID)
			}
			return cancelProvider.VideoCancel(ctx, VideoCancelRequest{
				Model:    route.ProviderModelID,
				TaskID:   taskID,
				TaskKind: taskKind,
			})
		}
	}
	return VideoResponse{}, fmt.Errorf("catalog route is required for video task cancellation")
}

func (s *AIService) GetFileUploaderForRoute(ctx context.Context, userID uint, route ModelRoute) FileUploader {
	if route.CatalogEntryID != 0 {
		if strings.TrimSpace(route.SourceType) != persistencemodel.ModelRouteSourceLocalProvider {
			return nil
		}
		cred, err := s.localProviderCredentialForRoute(ctx, route)
		if err != nil {
			return nil
		}
		return s.registry.GetFileUploaderForCredential(ctx, userID, cred)
	}
	return nil
}

func prepareVideoRequestForModel(req *VideoRequest, modelID string, def *ModelDef) {
	req.Model = modelID
	if req.Duration == 0 && def.DefaultDurSec > 0 {
		req.Duration = def.DefaultDurSec
	}
}

func (s *AIService) settleVideoUsage(ctx context.Context, userID, runtimeModelID uint, profile modelUsageProfile, def *ModelDef, requestedDuration, actualDuration int, usage UsageContext) error {
	durSec := actualDuration
	if durSec <= 0 {
		durSec = requestedDuration
	}
	if durSec <= 0 && def.DefaultDurSec > 0 {
		durSec = def.DefaultDurSec
	}
	if durSec <= 0 {
		durSec = 1
	}
	estimate := estimateUsage(profile, def, "video", 0, 0, durSec, 1)
	return s.settleUsage(ctx, userID, runtimeModelID, estimate, usage)
}
