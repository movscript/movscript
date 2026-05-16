package semantic

import (
	"context"
	"errors"
	"strconv"
	"strings"

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
	if err := s.ensureProductionSourceCanChange(ctx, projectID, item, input); err != nil {
		return item, err
	}
	patch := domainsemantic.ProductionPatch{
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		SourceType:        input.SourceType,
		OwnerLabel:        input.OwnerLabel,
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	}
	return s.repo.PatchProduction(ctx, item, patch)
}

func (s *Service) ensureProductionSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.Production, input ProductionInput) error {
	if productionSourcePreserved(item, input) {
		return nil
	}
	textBlocks, err := s.repo.ListProductionTextBlocks(ctx, ProductionTextBlockFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return err
	}
	if len(textBlocks) > 0 {
		return ErrInvalidInput{Err: errors.New("production source cannot be changed after production text blocks are created")}
	}
	segments, err := s.repo.ListSegments(ctx, SegmentFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return err
	}
	if len(segments) > 0 {
		return ErrInvalidInput{Err: errors.New("production source cannot be changed after segments are created")}
	}
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return err
	}
	if len(units) > 0 {
		return ErrInvalidInput{Err: errors.New("production source cannot be changed after content units are created")}
	}
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return err
	}
	if len(keyframes) > 0 {
		return ErrInvalidInput{Err: errors.New("production source cannot be changed after keyframes are created")}
	}
	return nil
}

func productionSourcePreserved(item domainsemantic.Production, input ProductionInput) bool {
	return optionalUintPatchPreserves(item.ScriptVersionID, input.ScriptVersionID) &&
		optionalUintPatchPreserves(item.PreviewTimelineID, input.PreviewTimelineID) &&
		stringPatchPreserves(item.SourceType, input.SourceType)
}

func stringPatchPreserves(existing string, patch string) bool {
	patch = strings.TrimSpace(patch)
	if patch == "" {
		return true
	}
	return strings.TrimSpace(existing) == patch
}

func (s *Service) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error) {
	return s.repo.ListContentUnits(ctx, filter)
}

func (s *Service) CreateContentUnit(ctx context.Context, projectID uint, input ContentUnitInput) (domainsemantic.ContentUnit, error) {
	resolvedScriptBlockID, err := s.resolveContentUnitScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	if err := s.validateContentUnitScriptSource(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
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
	resolvedScriptBlockID, err := s.resolveContentUnitScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return item, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return item, err
	}
	if err := s.validateContentUnitScriptSource(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return item, err
	}
	patch := contentUnitPatch(input)
	if err := s.ensureContentUnitSourceCanChange(ctx, projectID, item, patch); err != nil {
		return item, err
	}
	return s.repo.PatchContentUnit(ctx, item, patch)
}

func (s *Service) ensureContentUnitSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) error {
	if contentUnitSourcePreserved(item, patch) {
		return nil
	}
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ContentUnitID: item.ID})
	if err != nil {
		return err
	}
	if len(keyframes) > 0 {
		return ErrInvalidInput{Err: errors.New("content unit source cannot be changed after keyframes are created")}
	}
	slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "content_unit", OwnerID: item.ID, IncludeInternal: "true"})
	if err != nil {
		return err
	}
	if len(slots) > 0 {
		return ErrInvalidInput{Err: errors.New("content unit source cannot be changed after asset slots are created")}
	}
	return nil
}

func contentUnitSourcePreserved(item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) bool {
	return optionalUintPatchPreserves(item.ProductionID, patch.ProductionID) &&
		optionalUintPatchPreserves(item.SegmentID, patch.SegmentID) &&
		optionalUintPatchPreserves(item.SceneMomentID, patch.SceneMomentID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, patch.ScriptBlockID)
}

func ensureOptionalIDMatches(inputID *uint, ownerID *uint, message string) error {
	if inputID == nil || ownerID == nil {
		return nil
	}
	if *inputID != *ownerID {
		return ErrInvalidInput{Err: errors.New(message)}
	}
	return nil
}

func (s *Service) resolveContentUnitScriptBlock(ctx context.Context, projectID uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) (*uint, error) {
	if scriptBlockID != nil {
		return scriptBlockID, nil
	}
	if sceneMomentID != nil {
		sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(*sceneMomentID), 10))
		if err != nil {
			return nil, err
		}
		if sceneMoment.ScriptBlockID != nil {
			return sceneMoment.ScriptBlockID, nil
		}
		if sceneMoment.SegmentID != nil {
			segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*sceneMoment.SegmentID), 10))
			if err != nil {
				return nil, err
			}
			return segment.ScriptBlockID, nil
		}
	}
	if segmentID != nil {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
		if err != nil {
			return nil, err
		}
		if segment.ScriptBlockID != nil {
			return segment.ScriptBlockID, nil
		}
	}
	return nil, nil
}

func (s *Service) validateContentUnitScriptSource(ctx context.Context, projectID uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) error {
	var segmentScriptBlockID *uint
	if segmentID != nil {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
		if err != nil {
			return err
		}
		segmentScriptBlockID = segment.ScriptBlockID
	}
	if sceneMomentID == nil {
		return s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, scriptBlockID, segmentScriptBlockID)
	}
	sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(*sceneMomentID), 10))
	if err != nil {
		return err
	}
	if segmentID != nil {
		if sceneMoment.SegmentID == nil || *sceneMoment.SegmentID != *segmentID {
			return ErrInvalidInput{Err: errors.New("scene_moment_id must belong to segment_id")}
		}
	}
	if err := s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, sceneMoment.ScriptBlockID, segmentScriptBlockID); err != nil {
		return err
	}
	return s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, scriptBlockID, sceneMoment.ScriptBlockID)
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
	patch := domainsemantic.KeyframePatch{
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
	}
	return s.repo.PatchKeyframe(ctx, item, patch)
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
	patch := domainsemantic.PreviewTimelinePatch{
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Status:          input.Status,
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	return s.repo.PatchPreviewTimeline(ctx, item, patch)
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
	patch := previewTimelineItemPatch(input)
	if timelineID > 0 && input.PreviewTimelineID > 0 {
		patch.PreviewTimelineID = timelineID
	}
	return s.repo.PatchPreviewTimelineItem(ctx, item, patch)
}

func contentUnitFromInput(projectID uint, input ContentUnitInput) domainsemantic.ContentUnit {
	return domainsemantic.NewContentUnit(domainsemantic.ContentUnitSpec{
		ProjectID:        projectID,
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		ScriptBlockID:    input.ScriptBlockID,
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

func contentUnitPatch(input ContentUnitInput) domainsemantic.ContentUnitPatch {
	return domainsemantic.ContentUnitPatch{
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		ScriptBlockID:    input.ScriptBlockID,
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
	}
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

func previewTimelineItemPatch(input PreviewTimelineItemInput) domainsemantic.PreviewTimelineItemPatch {
	return domainsemantic.PreviewTimelineItemPatch{
		SegmentID:     input.SegmentID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		KeyframeID:    input.KeyframeID,
		Kind:          input.Kind,
		Order:         input.Order,
		StartSec:      input.StartSec,
		DurationSec:   input.DurationSec,
		Label:         input.Label,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
}
