package artifactref

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListScriptVersions(ctx context.Context, projectID uint) ([]model.ScriptVersion, error)
	ListAssetSlots(ctx context.Context, projectID uint) ([]model.AssetSlot, error)
	ListContentUnits(ctx context.Context, projectID uint) ([]model.ContentUnit, error)
	ListKeyframes(ctx context.Context, projectID uint) ([]model.Keyframe, error)
	ListDeliveryVersions(ctx context.Context, projectID uint) ([]model.DeliveryVersion, error)
	FirstBoundResource(ctx context.Context, projectID uint, ownerType string, ownerID uint, roles ...string) (*model.RawResource, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListScriptVersions(ctx context.Context, projectID uint) ([]model.ScriptVersion, error) {
	versions := make([]model.ScriptVersion, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func (r *gormRepository) ListAssetSlots(ctx context.Context, projectID uint) ([]model.AssetSlot, error) {
	slots := make([]model.AssetSlot, 0)
	if err := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&slots).Error; err != nil {
		return nil, err
	}
	return slots, nil
}

func (r *gormRepository) ListContentUnits(ctx context.Context, projectID uint) ([]model.ContentUnit, error) {
	units := make([]model.ContentUnit, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&units).Error; err != nil {
		return nil, err
	}
	return units, nil
}

func (r *gormRepository) ListKeyframes(ctx context.Context, projectID uint) ([]model.Keyframe, error) {
	keyframes := make([]model.Keyframe, 0)
	if err := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&keyframes).Error; err != nil {
		return nil, err
	}
	return keyframes, nil
}

func (r *gormRepository) ListDeliveryVersions(ctx context.Context, projectID uint) ([]model.DeliveryVersion, error) {
	versions := make([]model.DeliveryVersion, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func (r *gormRepository) FirstBoundResource(ctx context.Context, projectID uint, ownerType string, ownerID uint, roles ...string) (*model.RawResource, error) {
	var binding model.ResourceBinding
	q := r.db.WithContext(ctx).Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", projectID, ownerType, ownerID).
		Order("is_primary desc, sort_order, created_at")
	if len(roles) > 0 {
		q = q.Where("role IN ?", roles)
	}
	if err := q.First(&binding).Error; err != nil || binding.Resource == nil {
		return nil, nil
	}
	return binding.Resource, nil
}
