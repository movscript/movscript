package semantic

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

func (s *Service) ListProductions(ctx context.Context, filter ProductionFilter) ([]model.Production, error) {
	items := make([]model.Production, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	err := q.Order("updated_at desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateProduction(ctx context.Context, projectID uint, input ProductionInput) (model.Production, error) {
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return model.Production{}, err
	}
	item := model.Production{
		ProjectID:         projectID,
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            fallbackString(input.Status, "planning"),
		SourceType:        fallbackString(input.SourceType, "direct"),
		OwnerLabel:        fallbackString(input.OwnerLabel, "导演组"),
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	}
	if item.Name == "" {
		item.Name = "未命名制作"
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchProduction(ctx context.Context, projectID uint, id string, input ProductionInput) (model.Production, error) {
	var item model.Production
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]model.ContentUnit, error) {
	items := make([]model.ContentUnit, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	err := q.Order(`segment_id, scene_moment_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateContentUnit(ctx context.Context, projectID uint, input ContentUnitInput) (model.ContentUnit, error) {
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return model.ContentUnit{}, err
	}
	item := contentUnitFromInput(projectID, input)
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchContentUnit(ctx context.Context, projectID uint, id string, input ContentUnitInput) (model.ContentUnit, error) {
	var item model.ContentUnit
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, contentUnitUpdates(input)); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]model.Keyframe, error) {
	items := make([]model.Keyframe, 0)
	q := s.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	if filter.ContentUnitID > 0 {
		q = q.Where("content_unit_id = ?", filter.ContentUnitID)
	}
	err := q.Order(`content_unit_id, scene_moment_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateKeyframe(ctx context.Context, projectID uint, input KeyframeInput) (model.Keyframe, error) {
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return model.Keyframe{}, err
	}
	item := model.Keyframe{
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
		Status:        fallbackString(input.Status, "generated"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchKeyframe(ctx context.Context, projectID uint, id string, input KeyframeInput) (model.Keyframe, error) {
	var item model.Keyframe
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]model.PreviewTimeline, error) {
	items := make([]model.PreviewTimeline, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	err := q.Order("is_primary desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreatePreviewTimeline(ctx context.Context, projectID uint, input PreviewTimelineInput) (model.PreviewTimeline, error) {
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return model.PreviewTimeline{}, err
	}
	item := model.PreviewTimeline{
		ProjectID:       projectID,
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            fallbackString(input.Name, "Preview"),
		Status:          fallbackString(input.Status, "draft"),
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchPreviewTimeline(ctx context.Context, projectID uint, id string, input PreviewTimelineInput) (model.PreviewTimeline, error) {
	var item model.PreviewTimeline
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]model.PreviewTimelineItem, error) {
	items := make([]model.PreviewTimelineItem, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.PreviewTimelineID > 0 {
		q = q.Where("preview_timeline_id = ?", filter.PreviewTimelineID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	order := `preview_timeline_id, "order", id`
	if filter.PreviewTimelineID > 0 {
		order = `"order", id`
	}
	err := q.Order(order).Find(&items).Error
	return items, err
}

func (s *Service) CreatePreviewTimelineItem(ctx context.Context, projectID uint, timelineID uint, input PreviewTimelineItemInput) (model.PreviewTimelineItem, error) {
	if timelineID == 0 {
		timelineID = input.PreviewTimelineID
	}
	if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
		return model.PreviewTimelineItem{}, err
	}
	item := previewTimelineItemFromInput(projectID, timelineID, input)
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchPreviewTimelineItem(ctx context.Context, projectID uint, id string, timelineID uint, input PreviewTimelineItemInput) (model.PreviewTimelineItem, error) {
	var item model.PreviewTimelineItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func contentUnitFromInput(projectID uint, input ContentUnitInput) model.ContentUnit {
	return model.ContentUnit{
		ProjectID:        projectID,
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		Kind:             fallbackString(input.Kind, "shot"),
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
		Status:           fallbackString(input.Status, "draft"),
		MetadataJSON:     input.MetadataJSON,
	}
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

func previewTimelineItemFromInput(projectID uint, timelineID uint, input PreviewTimelineItemInput) model.PreviewTimelineItem {
	return model.PreviewTimelineItem{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
		SegmentID:         input.SegmentID,
		SceneMomentID:     input.SceneMomentID,
		ContentUnitID:     input.ContentUnitID,
		KeyframeID:        input.KeyframeID,
		Kind:              fallbackString(input.Kind, "keyframe"),
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            fallbackString(input.Status, "draft"),
		MetadataJSON:      input.MetadataJSON,
	}
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
