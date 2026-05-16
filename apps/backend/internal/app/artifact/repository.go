package artifact

import (
	"context"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListScriptVersions(ctx context.Context, projectID uint) ([]scriptVersionProjection, error)
	ListAssetSlots(ctx context.Context, projectID uint) ([]assetSlotProjection, error)
	ListContentUnits(ctx context.Context, projectID uint) ([]contentUnitProjection, error)
	ListKeyframes(ctx context.Context, projectID uint) ([]keyframeProjection, error)
	ListDeliveryVersions(ctx context.Context, projectID uint) ([]deliveryVersionProjection, error)
	FirstBoundResource(ctx context.Context, projectID uint, ownerType string, ownerID uint, roles ...string) (*domainresource.RawResource, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListScriptVersions(ctx context.Context, projectID uint) ([]scriptVersionProjection, error) {
	versions := make([]persistencemodel.ScriptVersion, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return scriptVersionsFromModels(versions), nil
}

func (r *gormRepository) ListAssetSlots(ctx context.Context, projectID uint) ([]assetSlotProjection, error) {
	slots := make([]persistencemodel.AssetSlot, 0)
	if err := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&slots).Error; err != nil {
		return nil, err
	}
	return assetSlotsFromModels(slots), nil
}

func (r *gormRepository) ListContentUnits(ctx context.Context, projectID uint) ([]contentUnitProjection, error) {
	units := make([]persistencemodel.ContentUnit, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&units).Error; err != nil {
		return nil, err
	}
	return contentUnitsFromModels(units), nil
}

func (r *gormRepository) ListKeyframes(ctx context.Context, projectID uint) ([]keyframeProjection, error) {
	keyframes := make([]persistencemodel.Keyframe, 0)
	if err := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&keyframes).Error; err != nil {
		return nil, err
	}
	return keyframesFromModels(keyframes), nil
}

func (r *gormRepository) ListDeliveryVersions(ctx context.Context, projectID uint) ([]deliveryVersionProjection, error) {
	versions := make([]persistencemodel.DeliveryVersion, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return deliveryVersionsFromModels(versions), nil
}

func (r *gormRepository) FirstBoundResource(ctx context.Context, projectID uint, ownerType string, ownerID uint, roles ...string) (*domainresource.RawResource, error) {
	var binding persistencemodel.ResourceBinding
	q := r.db.WithContext(ctx).Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", projectID, ownerType, ownerID).
		Order("is_primary desc, sort_order, created_at")
	if len(roles) > 0 {
		q = q.Where("role IN ?", roles)
	}
	if err := q.First(&binding).Error; err != nil || binding.Resource == nil {
		return nil, nil
	}
	resource := domainresource.RawResourceFromModel(*binding.Resource)
	return &resource, nil
}

func scriptVersionsFromModels(items []persistencemodel.ScriptVersion) []scriptVersionProjection {
	out := make([]scriptVersionProjection, 0, len(items))
	for _, item := range items {
		out = append(out, scriptVersionProjection{
			ID:         item.ID,
			Title:      item.Title,
			SourceType: item.SourceType,
			Status:     item.Status,
			CreatedAt:  item.CreatedAt,
			UpdatedAt:  item.UpdatedAt,
		})
	}
	return out
}

func assetSlotsFromModels(items []persistencemodel.AssetSlot) []assetSlotProjection {
	out := make([]assetSlotProjection, 0, len(items))
	for _, item := range items {
		out = append(out, assetSlotProjection{
			ID:        item.ID,
			Name:      item.Name,
			Kind:      item.Kind,
			Status:    item.Status,
			Resource:  rawResourceFromModelPointer(item.Resource),
			CreatedAt: item.CreatedAt,
			UpdatedAt: item.UpdatedAt,
		})
	}
	return out
}

func contentUnitsFromModels(items []persistencemodel.ContentUnit) []contentUnitProjection {
	out := make([]contentUnitProjection, 0, len(items))
	for _, item := range items {
		out = append(out, contentUnitProjection{
			ID:          item.ID,
			Order:       item.Order,
			Title:       item.Title,
			Description: item.Description,
			Status:      item.Status,
			CreatedAt:   item.CreatedAt,
			UpdatedAt:   item.UpdatedAt,
		})
	}
	return out
}

func keyframesFromModels(items []persistencemodel.Keyframe) []keyframeProjection {
	out := make([]keyframeProjection, 0, len(items))
	for _, item := range items {
		out = append(out, keyframeProjection{
			ID:            item.ID,
			ContentUnitID: item.ContentUnitID,
			Order:         item.Order,
			Title:         item.Title,
			Description:   item.Description,
			Status:        item.Status,
			Resource:      rawResourceFromModelPointer(item.Resource),
			CreatedAt:     item.CreatedAt,
			UpdatedAt:     item.UpdatedAt,
		})
	}
	return out
}

func deliveryVersionsFromModels(items []persistencemodel.DeliveryVersion) []deliveryVersionProjection {
	out := make([]deliveryVersionProjection, 0, len(items))
	for _, item := range items {
		out = append(out, deliveryVersionProjection{
			ID:          item.ID,
			Name:        item.Name,
			Description: item.Description,
			Status:      item.Status,
			CreatedAt:   item.CreatedAt,
			UpdatedAt:   item.UpdatedAt,
		})
	}
	return out
}

func rawResourceFromModelPointer(resource *persistencemodel.RawResource) *domainresource.RawResource {
	if resource == nil {
		return nil
	}
	item := domainresource.RawResourceFromModel(*resource)
	return &item
}
