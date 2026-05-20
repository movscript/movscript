package preview

import (
	"context"
	"encoding/json"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetSegment(ctx context.Context, projectID uint, segmentID uint) (segmentProjection, error)
	GetSceneMoment(ctx context.Context, projectID uint, momentID uint) (sceneMomentProjection, error)
	GetSceneMomentByID(ctx context.Context, momentID uint) (sceneMomentProjection, error)
	GetContentUnit(ctx context.Context, projectID uint, unitID uint) (contentUnitProjection, error)
	GetSegmentByID(ctx context.Context, segmentID uint) (segmentProjection, error)
	ListContentUnitsByIDs(ctx context.Context, projectID uint, ids []uint) ([]contentUnitProjection, error)
	ListKeyframesByIDs(ctx context.Context, projectID uint, ids []uint) ([]keyframeProjection, error)
	ListMissingAssetsByIDs(ctx context.Context, projectID uint, ids []uint) ([]assetSlotProjection, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetSegment(ctx context.Context, projectID uint, segmentID uint) (segmentProjection, error) {
	var seg persistencemodel.Segment
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, segmentID).First(&seg).Error; err != nil {
		return segmentProjection{}, normalizeNotFound(err)
	}
	return segmentFromModel(seg), nil
}

func (r *gormRepository) GetSceneMoment(ctx context.Context, projectID uint, momentID uint) (sceneMomentProjection, error) {
	var moment persistencemodel.SceneMoment
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, momentID).First(&moment).Error; err != nil {
		return sceneMomentProjection{}, normalizeNotFound(err)
	}
	return sceneMomentFromModel(moment), nil
}

func (r *gormRepository) GetSceneMomentByID(ctx context.Context, momentID uint) (sceneMomentProjection, error) {
	var moment persistencemodel.SceneMoment
	if err := r.db.WithContext(ctx).Where("id = ?", momentID).First(&moment).Error; err != nil {
		return sceneMomentProjection{}, normalizeNotFound(err)
	}
	return sceneMomentFromModel(moment), nil
}

func (r *gormRepository) GetContentUnit(ctx context.Context, projectID uint, unitID uint) (contentUnitProjection, error) {
	var unit persistencemodel.ContentUnit
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, unitID).First(&unit).Error; err != nil {
		return contentUnitProjection{}, normalizeNotFound(err)
	}
	return contentUnitFromModel(unit), nil
}

func (r *gormRepository) GetSegmentByID(ctx context.Context, segmentID uint) (segmentProjection, error) {
	var seg persistencemodel.Segment
	if err := r.db.WithContext(ctx).Where("id = ?", segmentID).First(&seg).Error; err != nil {
		return segmentProjection{}, normalizeNotFound(err)
	}
	return segmentFromModel(seg), nil
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}

func (r *gormRepository) ListContentUnitsByIDs(ctx context.Context, projectID uint, ids []uint) ([]contentUnitProjection, error) {
	if len(ids) == 0 {
		return []contentUnitProjection{}, nil
	}
	units := make([]persistencemodel.ContentUnit, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id IN ?", projectID, ids).
		Order(`"order" asc, id asc`).Find(&units).Error; err != nil {
		return nil, err
	}
	return contentUnitsFromModels(units), nil
}

func (r *gormRepository) ListKeyframesByIDs(ctx context.Context, projectID uint, ids []uint) ([]keyframeProjection, error) {
	if len(ids) == 0 {
		return []keyframeProjection{}, nil
	}
	keyframes := make([]persistencemodel.Keyframe, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id IN ?", projectID, ids).Order(`"order" asc, id asc`).Find(&keyframes).Error; err != nil {
		return nil, err
	}
	return keyframesFromModels(keyframes), nil
}

func (r *gormRepository) ListMissingAssetsByIDs(ctx context.Context, projectID uint, ids []uint) ([]assetSlotProjection, error) {
	if len(ids) == 0 {
		return []assetSlotProjection{}, nil
	}
	slots := make([]persistencemodel.AssetSlot, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id IN ? AND status IN ?", projectID, ids, []string{"missing", "candidate"}).
		Order("priority desc, id asc").Find(&slots).Error; err != nil {
		return nil, err
	}
	return assetSlotsFromModels(slots), nil
}

func segmentFromModel(segment persistencemodel.Segment) segmentProjection {
	return segmentProjection{ID: segment.ID, Title: segment.Title, Summary: segment.Summary}
}

func sceneMomentFromModel(moment persistencemodel.SceneMoment) sceneMomentProjection {
	return sceneMomentProjection{ID: moment.ID, SegmentID: moment.SegmentID, SceneCode: moment.SceneCode, Title: moment.Title, Description: moment.Description}
}

func contentUnitFromModel(unit persistencemodel.ContentUnit) contentUnitProjection {
	return contentUnitProjection{
		ID:            unit.ID,
		SegmentID:     unit.SegmentID,
		SceneMomentID: unit.SceneMomentID,
		UnitCode:      unit.UnitCode,
		Order:         unit.Order,
		Title:         unit.Title,
		Kind:          unit.Kind,
		Description:   unit.Description,
		DurationSec:   unit.DurationSec,
	}
}

func contentUnitsFromModels(units []persistencemodel.ContentUnit) []contentUnitProjection {
	out := make([]contentUnitProjection, 0, len(units))
	for _, unit := range units {
		out = append(out, contentUnitFromModel(unit))
	}
	return out
}

func keyframesFromModels(keyframes []persistencemodel.Keyframe) []keyframeProjection {
	out := make([]keyframeProjection, 0, len(keyframes))
	for _, keyframe := range keyframes {
		if isGeneratedKeyframeCandidateMetadata(keyframe.MetadataJSON) {
			continue
		}
		out = append(out, keyframeProjection{
			ID:            keyframe.ID,
			ContentUnitID: keyframe.ContentUnitID,
			Order:         keyframe.Order,
			Title:         keyframe.Title,
			Description:   keyframe.Description,
			Prompt:        keyframe.Prompt,
			ResourceID:    keyframe.ResourceID,
		})
	}
	return out
}

func isGeneratedKeyframeCandidateMetadata(raw string) bool {
	if raw == "" {
		return false
	}
	var metadata struct {
		Source           string `json:"source"`
		TargetKeyframeID uint   `json:"target_keyframe_id"`
	}
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return false
	}
	return metadata.Source == "ai_generated_keyframe_candidate" || metadata.TargetKeyframeID > 0
}

func assetSlotsFromModels(slots []persistencemodel.AssetSlot) []assetSlotProjection {
	out := make([]assetSlotProjection, 0, len(slots))
	for _, slot := range slots {
		out = append(out, assetSlotProjection{
			ID:          slot.ID,
			Name:        slot.Name,
			Description: slot.Description,
			Kind:        slot.Kind,
			Priority:    slot.Priority,
		})
	}
	return out
}
