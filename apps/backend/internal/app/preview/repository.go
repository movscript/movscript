package preview

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	GetSegment(ctx context.Context, projectID uint, segmentID uint) (model.Segment, error)
	GetSceneMoment(ctx context.Context, projectID uint, momentID uint) (model.SceneMoment, error)
	GetSceneMomentByID(ctx context.Context, momentID uint) (model.SceneMoment, error)
	GetContentUnit(ctx context.Context, projectID uint, unitID uint) (model.ContentUnit, error)
	GetSegmentByID(ctx context.Context, segmentID uint) (model.Segment, error)
	ListContentUnits(ctx context.Context, projectID uint, field string, id uint) ([]model.ContentUnit, error)
	ListKeyframesForUnits(ctx context.Context, projectID uint, ids []uint) ([]model.Keyframe, error)
	ListMissingAssets(ctx context.Context, projectID uint, ownerType string, ownerID uint) ([]model.AssetSlot, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetSegment(ctx context.Context, projectID uint, segmentID uint) (model.Segment, error) {
	var seg model.Segment
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, segmentID).First(&seg).Error; err != nil {
		return seg, normalizeNotFound(err)
	}
	return seg, nil
}

func (r *gormRepository) GetSceneMoment(ctx context.Context, projectID uint, momentID uint) (model.SceneMoment, error) {
	var moment model.SceneMoment
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, momentID).First(&moment).Error; err != nil {
		return moment, normalizeNotFound(err)
	}
	return moment, nil
}

func (r *gormRepository) GetSceneMomentByID(ctx context.Context, momentID uint) (model.SceneMoment, error) {
	var moment model.SceneMoment
	if err := r.db.WithContext(ctx).Where("id = ?", momentID).First(&moment).Error; err != nil {
		return moment, normalizeNotFound(err)
	}
	return moment, nil
}

func (r *gormRepository) GetContentUnit(ctx context.Context, projectID uint, unitID uint) (model.ContentUnit, error) {
	var unit model.ContentUnit
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, unitID).First(&unit).Error; err != nil {
		return unit, normalizeNotFound(err)
	}
	return unit, nil
}

func (r *gormRepository) GetSegmentByID(ctx context.Context, segmentID uint) (model.Segment, error) {
	var seg model.Segment
	if err := r.db.WithContext(ctx).Where("id = ?", segmentID).First(&seg).Error; err != nil {
		return seg, normalizeNotFound(err)
	}
	return seg, nil
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}

func (r *gormRepository) ListContentUnits(ctx context.Context, projectID uint, field string, id uint) ([]model.ContentUnit, error) {
	units := make([]model.ContentUnit, 0)
	err := r.db.WithContext(ctx).Where("project_id = ? AND "+field+" = ?", projectID, id).
		Order(`"order" asc, id asc`).Find(&units).Error
	return units, err
}

func (r *gormRepository) ListKeyframesForUnits(ctx context.Context, projectID uint, ids []uint) ([]model.Keyframe, error) {
	keyframes := make([]model.Keyframe, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ? AND content_unit_id IN ?", projectID, ids).Order(`"order" asc, id asc`).Find(&keyframes).Error; err != nil {
		return nil, err
	}
	return keyframes, nil
}

func (r *gormRepository) ListMissingAssets(ctx context.Context, projectID uint, ownerType string, ownerID uint) ([]model.AssetSlot, error) {
	slots := make([]model.AssetSlot, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ? AND owner_type = ? AND owner_id = ? AND status IN ?",
		projectID, ownerType, ownerID, []string{"missing", "candidate"}).
		Order("priority desc, id asc").Find(&slots).Error; err != nil {
		return nil, err
	}
	return slots, nil
}
