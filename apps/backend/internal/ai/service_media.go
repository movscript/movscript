package ai

import (
	"context"
	"fmt"

	"github.com/movscript/movscript/internal/model"
)

// CallImage calls an image generation model by AIModelConfig DB ID.
// It accepts models with either "image" or "image_edit" capability.
func (s *AIService) CallImage(ctx context.Context, userID, modelConfigID uint, req ImageRequest) (ImageResponse, error) {
	return s.CallImageWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallImageWithBilling(ctx context.Context, userID, modelConfigID uint, req ImageRequest, billing BillingContext) (ImageResponse, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, "image")
	if err != nil {
		var err2 error
		cfg, provider, def, err2 = s.loadConfig(modelConfigID, "image_edit")
		if err2 != nil {
			return ImageResponse{}, err
		}
		req.EditOnly = true
	}
	req.Model = resolveModelID(cfg, def)
	if def.ImageEditField != "" {
		req.ImageFieldName = def.ImageEditField
	}
	n := req.N
	if n <= 0 {
		n = 1
	}
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "image", 0, 0, 0, n)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return ImageResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.ImageGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return ImageResponse{}, err
	}
	estimate := estimateUsageCost(cfg, def, "image", 0, 0, 0, n)
	if err := s.settleUsage(ctx, userID, modelConfigID, estimate, billing); err != nil {
		return ImageResponse{}, err
	}
	return resp, nil
}

// CallVideo calls a video generation model by AIModelConfig DB ID.
// It accepts models with any video capability: "video", "video_i2v", or "video_v2v".
func (s *AIService) CallVideo(ctx context.Context, userID, modelConfigID uint, req VideoRequest) (VideoResponse, error) {
	return s.CallVideoWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallVideoWithBilling(ctx context.Context, userID, modelConfigID uint, req VideoRequest, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	prepareVideoRequest(&req, cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "video", 0, 0, positiveDuration(req.Duration, def), 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return VideoResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.VideoGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return VideoResponse{}, err
	}
	if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, req.Duration, resp.DurationSec, billing); err != nil {
		return VideoResponse{}, err
	}
	return resp, nil
}

// SupportsVideoTasks reports whether this model config can submit and poll
// provider-side async video tasks separately.
func (s *AIService) SupportsVideoTasks(modelConfigID uint) bool {
	_, provider, _, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return false
	}
	_, ok := provider.(VideoTaskProvider)
	return ok
}

// SupportsVideoTaskCancellation reports whether this model config can cancel
// provider-side async video tasks.
func (s *AIService) SupportsVideoTaskCancellation(modelConfigID uint) bool {
	_, provider, _, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return false
	}
	_, ok := provider.(VideoTaskCancelProvider)
	return ok
}

// CallVideoStart submits an async provider video task exactly once.
func (s *AIService) CallVideoStart(ctx context.Context, userID, modelConfigID uint, req VideoRequest) (VideoResponse, error) {
	return s.CallVideoStartWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallVideoStartWithBilling(ctx context.Context, userID, modelConfigID uint, req VideoRequest, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	taskProvider, ok := provider.(VideoTaskProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task polling", modelConfigID)
	}
	prepareVideoRequest(&req, cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "video", 0, 0, positiveDuration(req.Duration, def), 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return VideoResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := taskProvider.VideoStart(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return VideoResponse{}, err
	}
	if resp.URL != "" || len(resp.ContentBytes) > 0 {
		if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, req.Duration, resp.DurationSec, billing); err != nil {
			return VideoResponse{}, err
		}
	}
	return resp, nil
}

// CallVideoPoll queries an existing async provider video task without creating a
// new provider task. Usage is logged only when the poll returns a finished video.
func (s *AIService) CallVideoPoll(ctx context.Context, userID, modelConfigID uint, taskID, taskKind string, requestedDuration int) (VideoResponse, error) {
	return s.CallVideoPollWithBilling(ctx, userID, modelConfigID, taskID, taskKind, requestedDuration, BillingContext{})
}

func (s *AIService) CallVideoPollWithBilling(ctx context.Context, userID, modelConfigID uint, taskID, taskKind string, requestedDuration int, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	taskProvider, ok := provider.(VideoTaskProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task polling", modelConfigID)
	}
	req := VideoPollRequest{
		Model:    resolveModelID(cfg, def),
		TaskID:   taskID,
		TaskKind: taskKind,
	}
	resp, err := taskProvider.VideoPoll(ctx, req)
	if err != nil {
		return resp, err
	}
	if resp.Status == VideoStatusSucceeded && (resp.URL != "" || len(resp.ContentBytes) > 0) {
		if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, requestedDuration, resp.DurationSec, billing); err != nil {
			return resp, err
		}
	}
	return resp, nil
}

// CallVideoCancel requests provider-side cancellation for an async video task.
func (s *AIService) CallVideoCancel(ctx context.Context, modelConfigID uint, taskID, taskKind string) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	cancelProvider, ok := provider.(VideoTaskCancelProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task cancellation", modelConfigID)
	}
	req := VideoCancelRequest{
		Model:    resolveModelID(cfg, def),
		TaskID:   taskID,
		TaskKind: taskKind,
	}
	return cancelProvider.VideoCancel(ctx, req)
}

// GetFileUploader returns the provider-side Files API uploader configured for a model.
func (s *AIService) GetFileUploader(modelConfigID uint) FileUploader {
	var cfg model.AIModelConfig
	if err := s.db.First(&cfg, modelConfigID).Error; err != nil {
		return nil
	}
	return s.registry.GetFileUploader(cfg)
}

func (s *AIService) loadVideoConfig(modelConfigID uint) (model.AIModelConfig, Provider, *ModelDef, error) {
	videoCaps := []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V}
	var cfg model.AIModelConfig
	var provider Provider
	var def *ModelDef
	var lastErr error
	for _, cap := range videoCaps {
		var err error
		cfg, provider, def, err = s.loadConfig(modelConfigID, cap)
		if err == nil {
			return cfg, provider, def, nil
		}
		lastErr = err
	}
	return cfg, provider, def, lastErr
}

func prepareVideoRequest(req *VideoRequest, cfg model.AIModelConfig, def *ModelDef) {
	req.Model = resolveModelID(cfg, def)
	if req.Duration == 0 && def.DefaultDurSec > 0 {
		req.Duration = def.DefaultDurSec
	}
}

func (s *AIService) logVideoUsage(userID, modelConfigID uint, cfg model.AIModelConfig, def *ModelDef, requestedDuration, actualDuration int) {
	durSec := actualDuration
	if durSec <= 0 {
		durSec = requestedDuration
	}
	if durSec <= 0 && def.DefaultDurSec > 0 {
		durSec = def.DefaultDurSec
	}
	cost := calcCost(cfg, def, 0, 0, durSec, 1)
	_ = s.logUsage(context.Background(), userID, modelConfigID, UsageEstimate{OperationType: "video", DurationSec: durSec, ImageCount: 1, Cost: cost}, BillingContext{}, nil)
}

func (s *AIService) settleVideoUsage(ctx context.Context, userID, modelConfigID uint, cfg model.AIModelConfig, def *ModelDef, requestedDuration, actualDuration int, billing BillingContext) error {
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
	estimate := estimateUsageCost(cfg, def, "video", 0, 0, durSec, 1)
	return s.settleUsage(ctx, userID, modelConfigID, estimate, billing)
}
