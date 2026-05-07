package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListProductions(ctx context.Context, filter ProductionFilter) ([]domainsemantic.Production, error) {
	return s.repo.ListProductions(ctx, filter)
}

func (s *Service) CreateProduction(ctx context.Context, projectID uint, input ProductionInput) (domainsemantic.Production, error) {
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return domainsemantic.Production{}, err
	}
	item := domainsemantic.NewProduction(domainsemantic.ProductionSpec{
		ProjectID:         projectID,
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		SourceType:        input.SourceType,
		OwnerLabel:        input.OwnerLabel,
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	})
	return s.repo.CreateProduction(ctx, item)
}

func (s *Service) PatchProduction(ctx context.Context, projectID uint, id string, input ProductionInput) (domainsemantic.Production, error) {
	item, err := s.repo.LoadProduction(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"script_version_id":   input.ScriptVersionID,
		"preview_timeline_id": input.PreviewTimelineID,
		"name":                input.Name,
		"description":         input.Description,
		"status":              input.Status,
		"source_type":         input.SourceType,
		"owner_label":         input.OwnerLabel,
		"progress":            input.Progress,
		"metadata_json":       input.MetadataJSON,
	})
	return s.repo.PatchProduction(ctx, item, updates)
}

func (s *Service) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error) {
	return s.repo.ListContentUnits(ctx, filter)
}

func (s *Service) CreateContentUnit(ctx context.Context, projectID uint, input ContentUnitInput) (domainsemantic.ContentUnit, error) {
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	item := contentUnitFromInput(projectID, input)
	return s.repo.CreateContentUnit(ctx, item)
}

func (s *Service) PatchContentUnit(ctx context.Context, projectID uint, id string, input ContentUnitInput) (domainsemantic.ContentUnit, error) {
	item, err := s.repo.LoadContentUnit(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return item, err
	}
	return s.repo.PatchContentUnit(ctx, item, contentUnitUpdates(input))
}

func (s *Service) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]domainsemantic.Keyframe, error) {
	return s.repo.ListKeyframes(ctx, filter)
}

func (s *Service) CreateKeyframe(ctx context.Context, projectID uint, input KeyframeInput) (domainsemantic.Keyframe, error) {
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return domainsemantic.Keyframe{}, err
	}
	item := domainsemantic.NewKeyframe(domainsemantic.KeyframeSpec{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		ResourceID:    input.ResourceID,
		CanvasID:      input.CanvasID,
		Title:         input.Title,
		Description:   input.Description,
		Prompt:        input.Prompt,
		Order:         input.Order,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	})
	return s.repo.CreateKeyframe(ctx, item)
}

func (s *Service) PatchKeyframe(ctx context.Context, projectID uint, id string, input KeyframeInput) (domainsemantic.Keyframe, error) {
	item, err := s.repo.LoadKeyframe(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"production_id":   input.ProductionID,
		"scene_moment_id": input.SceneMomentID,
		"content_unit_id": input.ContentUnitID,
		"resource_id":     input.ResourceID,
		"canvas_id":       input.CanvasID,
		"title":           input.Title,
		"description":     input.Description,
		"prompt":          input.Prompt,
		"order":           input.Order,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
	return s.repo.PatchKeyframe(ctx, item, updates)
}

func (s *Service) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]domainsemantic.PreviewTimeline, error) {
	return s.repo.ListPreviewTimelines(ctx, filter)
}

func (s *Service) CreatePreviewTimeline(ctx context.Context, projectID uint, input PreviewTimelineInput) (domainsemantic.PreviewTimeline, error) {
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return domainsemantic.PreviewTimeline{}, err
	}
	item := domainsemantic.NewPreviewTimeline(domainsemantic.PreviewTimelineSpec{
		ProjectID:       projectID,
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Status:          input.Status,
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	})
	return s.repo.CreatePreviewTimeline(ctx, item)
}

func (s *Service) PatchPreviewTimeline(ctx context.Context, projectID uint, id string, input PreviewTimelineInput) (domainsemantic.PreviewTimeline, error) {
	item, err := s.repo.LoadPreviewTimeline(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"production_id":     input.ProductionID,
		"script_version_id": input.ScriptVersionID,
		"name":              input.Name,
		"status":            input.Status,
		"duration_sec":      input.DurationSec,
		"is_primary":        &input.IsPrimary,
		"metadata_json":     input.MetadataJSON,
	})
	return s.repo.PatchPreviewTimeline(ctx, item, updates)
}

func (s *Service) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]domainsemantic.PreviewTimelineItem, error) {
	return s.repo.ListPreviewTimelineItems(ctx, filter)
}

func (s *Service) CreatePreviewTimelineItem(ctx context.Context, projectID uint, timelineID uint, input PreviewTimelineItemInput) (domainsemantic.PreviewTimelineItem, error) {
	if timelineID == 0 {
		timelineID = input.PreviewTimelineID
	}
	if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
		return domainsemantic.PreviewTimelineItem{}, err
	}
	item := previewTimelineItemFromInput(projectID, timelineID, input)
	return s.repo.CreatePreviewTimelineItem(ctx, item)
}

func (s *Service) PatchPreviewTimelineItem(ctx context.Context, projectID uint, id string, timelineID uint, input PreviewTimelineItemInput) (domainsemantic.PreviewTimelineItem, error) {
	item, err := s.repo.LoadPreviewTimelineItem(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if timelineID > 0 {
		if item.PreviewTimelineID != timelineID {
			return item, ErrNotFound
		}
	} else {
		timelineID = input.PreviewTimelineID
		if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
			return item, err
		}
	}
	updates := previewTimelineItemUpdates(input)
	if timelineID > 0 && input.PreviewTimelineID > 0 {
		updates["preview_timeline_id"] = timelineID
	}
	return s.repo.PatchPreviewTimelineItem(ctx, item, updates)
}

func contentUnitFromInput(projectID uint, input ContentUnitInput) domainsemantic.ContentUnit {
	return domainsemantic.NewContentUnit(domainsemantic.ContentUnitSpec{
		ProjectID:        projectID,
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		Kind:             input.Kind,
		Order:            input.Order,
		Title:            input.Title,
		Description:      input.Description,
		Prompt:           input.Prompt,
		DurationSec:      input.DurationSec,
		ShotSize:         input.ShotSize,
		CameraAngle:      input.CameraAngle,
		CameraHeight:     input.CameraHeight,
		CameraMotion:     input.CameraMotion,
		MotionIntensity:  input.MotionIntensity,
		CameraSpeed:      input.CameraSpeed,
		Lens:             input.Lens,
		FocalLength:      input.FocalLength,
		FocusSubject:     input.FocusSubject,
		CompositionStart: input.CompositionStart,
		CompositionEnd:   input.CompositionEnd,
		Stabilization:    input.Stabilization,
		CameraParamsJSON: input.CameraParamsJSON,
		CameraNotes:      input.CameraNotes,
		Status:           input.Status,
		MetadataJSON:     input.MetadataJSON,
	})
}

func contentUnitUpdates(input ContentUnitInput) map[string]any {
	return compactUpdates(map[string]any{
		"production_id":      input.ProductionID,
		"segment_id":         input.SegmentID,
		"scene_moment_id":    input.SceneMomentID,
		"kind":               input.Kind,
		"order":              input.Order,
		"title":              input.Title,
		"description":        input.Description,
		"prompt":             input.Prompt,
		"duration_sec":       input.DurationSec,
		"shot_size":          input.ShotSize,
		"camera_angle":       input.CameraAngle,
		"camera_height":      input.CameraHeight,
		"camera_motion":      input.CameraMotion,
		"motion_intensity":   input.MotionIntensity,
		"camera_speed":       input.CameraSpeed,
		"lens":               input.Lens,
		"focal_length":       input.FocalLength,
		"focus_subject":      input.FocusSubject,
		"composition_start":  input.CompositionStart,
		"composition_end":    input.CompositionEnd,
		"stabilization":      input.Stabilization,
		"camera_params_json": input.CameraParamsJSON,
		"camera_notes":       input.CameraNotes,
		"status":             input.Status,
		"metadata_json":      input.MetadataJSON,
	})
}

func previewTimelineItemFromInput(projectID uint, timelineID uint, input PreviewTimelineItemInput) domainsemantic.PreviewTimelineItem {
	return domainsemantic.NewPreviewTimelineItem(domainsemantic.PreviewTimelineItemSpec{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
		SegmentID:         input.SegmentID,
		SceneMomentID:     input.SceneMomentID,
		ContentUnitID:     input.ContentUnitID,
		KeyframeID:        input.KeyframeID,
		Kind:              input.Kind,
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            input.Status,
		MetadataJSON:      input.MetadataJSON,
	})
}

func previewTimelineItemUpdates(input PreviewTimelineItemInput) map[string]any {
	return compactUpdates(map[string]any{
		"segment_id":      input.SegmentID,
		"scene_moment_id": input.SceneMomentID,
		"content_unit_id": input.ContentUnitID,
		"keyframe_id":     input.KeyframeID,
		"kind":            input.Kind,
		"order":           input.Order,
		"start_sec":       input.StartSec,
		"duration_sec":    input.DurationSec,
		"label":           input.Label,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
}
