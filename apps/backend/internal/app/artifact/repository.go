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
	LoadResourcesByIDs(ctx context.Context, projectID uint, ids []uint) ([]domainresource.RawResource, error)
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
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&slots).Error; err != nil {
		return nil, err
	}
	resourceIDs := make([]uint, 0, len(slots))
	for _, slot := range slots {
		if slot.ResourceID != nil {
			resourceIDs = append(resourceIDs, *slot.ResourceID)
		}
	}
	resources, err := r.LoadResourcesByIDs(ctx, projectID, resourceIDs)
	if err != nil {
		return nil, err
	}
	return assetSlotsFromModels(slots, resources), nil
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
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&keyframes).Error; err != nil {
		return nil, err
	}
	resourceIDs := make([]uint, 0, len(keyframes))
	for _, keyframe := range keyframes {
		if keyframe.ResourceID != nil {
			resourceIDs = append(resourceIDs, *keyframe.ResourceID)
		}
	}
	resources, err := r.LoadResourcesByIDs(ctx, projectID, resourceIDs)
	if err != nil {
		return nil, err
	}
	return keyframesFromModels(keyframes, resources), nil
}

func (r *gormRepository) ListDeliveryVersions(ctx context.Context, projectID uint) ([]deliveryVersionProjection, error) {
	versions := make([]persistencemodel.DeliveryVersion, 0)
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return deliveryVersionsFromModels(versions), nil
}

func (r *gormRepository) LoadResourcesByIDs(ctx context.Context, projectID uint, ids []uint) ([]domainresource.RawResource, error) {
	if len(ids) == 0 {
		return []domainresource.RawResource{}, nil
	}
	items := make([]persistencemodel.RawResource, 0, len(ids))
	if err := r.db.WithContext(ctx).Where("project_id = ? AND id IN ?", projectID, ids).Find(&items).Error; err != nil {
		return nil, err
	}
	resources := make([]domainresource.RawResource, 0, len(items))
	for _, item := range items {
		resources = append(resources, domainresource.RawResourceFromModel(item))
	}
	return resources, nil
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

func assetSlotsFromModels(items []persistencemodel.AssetSlot, resources []domainresource.RawResource) []assetSlotProjection {
	resourcesByID := rawResourcesByID(resources)
	out := make([]assetSlotProjection, 0, len(items))
	for _, item := range items {
		var resource *domainresource.RawResource
		if item.ResourceID != nil {
			resource = resourcesByID[*item.ResourceID]
		}
		out = append(out, assetSlotProjection{
			ID:        item.ID,
			Name:      item.Name,
			Kind:      item.Kind,
			Status:    item.Status,
			Resource:  resource,
			CreatedAt: item.CreatedAt,
			UpdatedAt: item.UpdatedAt,
		})
	}
	return out
}

func rawResourcesByID(items []domainresource.RawResource) map[uint]*domainresource.RawResource {
	out := make(map[uint]*domainresource.RawResource, len(items))
	for i := range items {
		item := items[i]
		out[item.ID] = &item
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

func keyframesFromModels(items []persistencemodel.Keyframe, resources []domainresource.RawResource) []keyframeProjection {
	resourcesByID := rawResourcesByID(resources)
	out := make([]keyframeProjection, 0, len(items))
	for _, item := range items {
		var resource *domainresource.RawResource
		if item.ResourceID != nil {
			resource = resourcesByID[*item.ResourceID]
		}
		out = append(out, keyframeProjection{
			ID:            item.ID,
			ContentUnitID: item.ContentUnitID,
			Order:         item.Order,
			Title:         item.Title,
			Description:   item.Description,
			Status:        item.Status,
			Resource:      resource,
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
