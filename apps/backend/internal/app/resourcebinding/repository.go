package resourcebinding

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, filter Filter) ([]model.ResourceBinding, error)
	ListByEntity(ctx context.Context, filter Filter) ([]model.ResourceBinding, error)
	FindBindingByUniqueKey(ctx context.Context, projectID uint, resourceID uint, ownerType string, ownerID uint, role string, slot string, version int) (model.ResourceBinding, bool, error)
	CreateBinding(ctx context.Context, binding *model.ResourceBinding) error
	GetBinding(ctx context.Context, id uint) (model.ResourceBinding, bool, error)
	ReloadBindingWithResource(ctx context.Context, binding *model.ResourceBinding) error
	UpdateBinding(ctx context.Context, binding *model.ResourceBinding, updates map[string]any) error
	DeleteBinding(ctx context.Context, binding *model.ResourceBinding) error
	EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error
	EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error
	ProjectIDForOwner(ctx context.Context, ownerType string, ownerID uint) (uint, error)
	BackfillAssetSlotResource(ctx context.Context, binding model.ResourceBinding) error
	ClearAssetSlotResourceIfDeleted(ctx context.Context, binding model.ResourceBinding) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, filter Filter) ([]model.ResourceBinding, error) {
	items := make([]model.ResourceBinding, 0)
	q := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	q = applyFilters(q, filter)
	err := q.Order("owner_type, owner_id, role, slot, sort_order, created_at").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListByEntity(ctx context.Context, filter Filter) ([]model.ResourceBinding, error) {
	items := make([]model.ResourceBinding, 0)
	q := r.db.WithContext(ctx).Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", filter.ProjectID, filter.OwnerType, filter.OwnerID)
	q = applyFilters(q, filter)
	err := q.Order("role, slot, sort_order, created_at").Find(&items).Error
	return items, err
}

func (r *gormRepository) FindBindingByUniqueKey(ctx context.Context, projectID uint, resourceID uint, ownerType string, ownerID uint, role string, slot string, version int) (model.ResourceBinding, bool, error) {
	var existing model.ResourceBinding
	err := r.db.WithContext(ctx).Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		projectID, resourceID, ownerType, ownerID, role, slot, version,
	).First(&existing).Error
	if err == nil {
		return existing, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return existing, false, nil
	}
	return existing, false, err
}

func (r *gormRepository) CreateBinding(ctx context.Context, binding *model.ResourceBinding) error {
	if binding == nil {
		return ErrInvalidInput
	}
	normalizeBinding(binding)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if binding.SortOrder == 0 {
			binding.SortOrder = r.nextSortOrderWithDB(tx, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot)
		}
		if err := tx.Create(binding).Error; err != nil {
			return err
		}
		if err := entityrelation.SyncCoreEntityRelations(tx, binding); err != nil {
			return err
		}
		if binding.IsPrimary {
			return r.clearOtherPrimaryBindingsWithDB(tx, *binding)
		}
		return nil
	})
}

func (r *gormRepository) GetBinding(ctx context.Context, id uint) (model.ResourceBinding, bool, error) {
	var binding model.ResourceBinding
	if err := r.db.WithContext(ctx).Preload("Resource").First(&binding, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, false, ErrBindingNotFound
		}
		return binding, false, err
	}
	return binding, false, nil
}

func (r *gormRepository) ReloadBindingWithResource(ctx context.Context, binding *model.ResourceBinding) error {
	return r.db.WithContext(ctx).Preload("Resource").First(binding, binding.ID).Error
}

func (r *gormRepository) UpdateBinding(ctx context.Context, binding *model.ResourceBinding, updates map[string]any) error {
	if binding == nil {
		return ErrInvalidInput
	}
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Model(binding).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(binding, binding.ID).Error; err != nil {
			return err
		}
		if binding.IsPrimary {
			if err := r.clearOtherPrimaryBindingsWithDB(tx, *binding); err != nil {
				return err
			}
		}
		return entityrelation.SyncCoreEntityRelations(tx, binding)
	})
}

func (r *gormRepository) DeleteBinding(ctx context.Context, binding *model.ResourceBinding) error {
	if binding == nil {
		return ErrInvalidInput
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Delete(binding).Error; err != nil {
			return err
		}
		return entityrelation.DeleteCoreEntityRelations(tx, binding)
	})
}

func (r *gormRepository) EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error {
	var resource model.RawResource
	if err := r.db.WithContext(ctx).First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	if resource.OwnerID == userID || resource.IsShared {
		return nil
	}
	if resource.FolderID != nil {
		var folder model.ResourceFolder
		if err := r.db.WithContext(ctx).First(&folder, *resource.FolderID).Error; err == nil && folder.IsShared {
			return nil
		}
	}
	return ErrResourceForbidden
}

func (r *gormRepository) EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error {
	ownerProjectID, err := r.ProjectIDForOwner(ctx, ownerType, ownerID)
	if err != nil {
		return err
	}
	if ownerProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) ProjectIDForOwner(ctx context.Context, ownerType string, ownerID uint) (uint, error) {
	switch NormalizeOwnerType(ownerType) {
	case "script":
		var item model.Script
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "script_version":
		var item model.ScriptVersion
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "segment":
		var item model.Segment
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "scene_moment":
		var item model.SceneMoment
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "content_unit":
		var item model.ContentUnit
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "keyframe":
		var item model.Keyframe
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "preview_timeline":
		var item model.PreviewTimeline
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference":
		var item model.CreativeReference
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference_state":
		var item model.CreativeReferenceState
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "asset_slot":
		var item model.AssetSlot
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "delivery_version":
		var item model.DeliveryVersion
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "canvas":
		var item model.Canvas
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		if item.ProjectID == nil {
			return 0, ErrOwnerWrongProject
		}
		return *item.ProjectID, nil
	default:
		return 0, ErrOwnerInvalidType
	}
}

func (r *gormRepository) BackfillAssetSlotResource(ctx context.Context, binding model.ResourceBinding) error {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	update := db.Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id IS NULL", binding.OwnerID).
		Update("resource_id", binding.ResourceID)
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 0 {
		return nil
	}
	slot := model.AssetSlot{}
	slot.ID = binding.OwnerID
	return entityrelation.SyncCoreEntityRelations(db, &slot)
}

func (r *gormRepository) ClearAssetSlotResourceIfDeleted(ctx context.Context, binding model.ResourceBinding) error {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	var replacement model.ResourceBinding
	err := db.
		Where("owner_type = ? AND owner_id = ? AND resource_id <> ?", "asset_slot", binding.OwnerID, binding.ResourceID).
		Order("is_primary desc, sort_order, created_at").
		First(&replacement).Error
	if err == nil {
		update := db.Model(&model.AssetSlot{}).
			Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
			Update("resource_id", replacement.ResourceID)
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected > 0 {
			slot := model.AssetSlot{}
			slot.ID = binding.OwnerID
			return entityrelation.SyncCoreEntityRelations(db, &slot)
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	update := db.Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
		Update("resource_id", nil)
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 0 {
		return nil
	}
	slot := model.AssetSlot{}
	slot.ID = binding.OwnerID
	return entityrelation.SyncCoreEntityRelations(db, &slot)
}

func (r *gormRepository) nextSortOrderWithDB(db *gorm.DB, projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	var maxOrder int
	db.Model(&model.ResourceBinding{}).
		Select("COALESCE(MAX(sort_order), 0)").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?", projectID, ownerType, ownerID, role, slot).
		Scan(&maxOrder)
	return maxOrder + 1
}

func (r *gormRepository) clearOtherPrimaryBindingsWithDB(db *gorm.DB, binding model.ResourceBinding) error {
	return db.Model(&model.ResourceBinding{}).
		Where("id <> ? AND project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?",
			binding.ID, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot).
		Update("is_primary", false).Error
}

func applyFilters(q *gorm.DB, filter Filter) *gorm.DB {
	if ownerType := NormalizeOwnerType(filter.OwnerType); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if filter.OwnerID > 0 {
		q = q.Where("owner_id = ?", filter.OwnerID)
	}
	if role := NormalizeRole(filter.Role); role != "" {
		q = q.Where("role = ?", role)
	}
	if status := NormalizeStatus(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if filter.ResourceID > 0 {
		q = q.Where("resource_id = ?", filter.ResourceID)
	}
	return q
}

func ownerLookupError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrOwnerNotFound
	}
	return err
}
