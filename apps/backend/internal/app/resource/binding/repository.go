package binding

import (
	"context"
	"errors"

	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/relation"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, filter Filter) ([]domainbinding.Binding, error)
	ListByEntity(ctx context.Context, filter Filter) ([]domainbinding.Binding, error)
	FindBindingByUniqueKey(ctx context.Context, projectID uint, resourceID uint, ownerType string, ownerID uint, role string, slot string, version int) (domainbinding.Binding, bool, error)
	CreateBinding(ctx context.Context, binding domainbinding.Binding) (domainbinding.Binding, error)
	GetBinding(ctx context.Context, id uint) (domainbinding.Binding, bool, error)
	UpdateBinding(ctx context.Context, binding domainbinding.Binding, spec domainbinding.UpdateSpec) (domainbinding.Binding, error)
	DeleteBinding(ctx context.Context, binding domainbinding.Binding) error
	EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error
	EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error
	ProjectIDForOwner(ctx context.Context, ownerType string, ownerID uint) (uint, error)
	BackfillAssetSlotResource(ctx context.Context, binding domainbinding.Binding) error
	ClearAssetSlotResourceIfDeleted(ctx context.Context, binding domainbinding.Binding) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, filter Filter) ([]domainbinding.Binding, error) {
	items := make([]persistencemodel.ResourceBinding, 0)
	q := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	q = applyFilters(q, filter)
	if err := q.Order("owner_type, owner_id, role, slot, sort_order, created_at").Find(&items).Error; err != nil {
		return nil, err
	}
	return bindingsFromModels(items), nil
}

func (r *gormRepository) ListByEntity(ctx context.Context, filter Filter) ([]domainbinding.Binding, error) {
	items := make([]persistencemodel.ResourceBinding, 0)
	q := r.db.WithContext(ctx).Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", filter.ProjectID, filter.OwnerType, filter.OwnerID)
	q = applyFilters(q, filter)
	if err := q.Order("role, slot, sort_order, created_at").Find(&items).Error; err != nil {
		return nil, err
	}
	return bindingsFromModels(items), nil
}

func (r *gormRepository) FindBindingByUniqueKey(ctx context.Context, projectID uint, resourceID uint, ownerType string, ownerID uint, role string, slot string, version int) (domainbinding.Binding, bool, error) {
	var existing persistencemodel.ResourceBinding
	err := r.db.WithContext(ctx).Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		projectID, resourceID, ownerType, ownerID, role, slot, version,
	).First(&existing).Error
	if err == nil {
		return domainbinding.BindingFromModel(existing), true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domainbinding.Binding{}, false, nil
	}
	return domainbinding.Binding{}, false, err
}

func (r *gormRepository) CreateBinding(ctx context.Context, binding domainbinding.Binding) (domainbinding.Binding, error) {
	row := binding.ToModel()
	if row.ProjectID == 0 {
		return domainbinding.Binding{}, ErrInvalidInput
	}
	domainbinding.NormalizeBinding(&row)
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if row.SortOrder == 0 {
			row.SortOrder = r.nextSortOrderWithDB(tx, row.ProjectID, row.OwnerType, row.OwnerID, row.Role, row.Slot)
		}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if err := relation.SyncCoreEntityRelations(tx, &row); err != nil {
			return err
		}
		if row.IsPrimary {
			return r.clearOtherPrimaryBindingsWithDB(tx, row)
		}
		return nil
	}); err != nil {
		return domainbinding.BindingFromModel(row), err
	}
	return domainbinding.BindingFromModel(row), nil
}

func (r *gormRepository) GetBinding(ctx context.Context, id uint) (domainbinding.Binding, bool, error) {
	var binding persistencemodel.ResourceBinding
	if err := r.db.WithContext(ctx).Preload("Resource").First(&binding, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainbinding.Binding{}, false, ErrBindingNotFound
		}
		return domainbinding.Binding{}, false, err
	}
	return domainbinding.BindingFromModel(binding), true, nil
}

func (r *gormRepository) UpdateBinding(ctx context.Context, binding domainbinding.Binding, spec domainbinding.UpdateSpec) (domainbinding.Binding, error) {
	row := binding.ToModel()
	updates := bindingUpdateColumns(spec)
	if len(updates) == 0 {
		return binding, nil
	}
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Model(&row).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(&row, row.ID).Error; err != nil {
			return err
		}
		if row.IsPrimary {
			if err := r.clearOtherPrimaryBindingsWithDB(tx, row); err != nil {
				return err
			}
		}
		return relation.SyncCoreEntityRelations(tx, &row)
	}); err != nil {
		return domainbinding.BindingFromModel(row), err
	}
	if err := r.db.WithContext(ctx).Preload("Resource").First(&row, row.ID).Error; err != nil {
		return domainbinding.BindingFromModel(row), err
	}
	return domainbinding.BindingFromModel(row), nil
}

func bindingUpdateColumns(spec domainbinding.UpdateSpec) map[string]any {
	updates := map[string]any{}
	if spec.Role != nil {
		updates["role"] = *spec.Role
	}
	if spec.Slot != nil {
		updates["slot"] = *spec.Slot
	}
	if spec.SortOrder != nil {
		updates["sort_order"] = *spec.SortOrder
	}
	if spec.Version != nil {
		updates["version"] = *spec.Version
	}
	if spec.IsPrimary != nil {
		updates["is_primary"] = *spec.IsPrimary
	}
	if spec.Status != nil {
		updates["status"] = *spec.Status
	}
	if spec.SourceType != nil {
		updates["source_type"] = *spec.SourceType
	}
	if spec.SourceID != nil {
		updates["source_id"] = *spec.SourceID
	}
	if spec.MetadataJSON != nil {
		updates["metadata_json"] = *spec.MetadataJSON
	}
	return updates
}

func (r *gormRepository) DeleteBinding(ctx context.Context, binding domainbinding.Binding) error {
	row := binding.ToModel()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Delete(&row).Error; err != nil {
			return err
		}
		return relation.DeleteCoreEntityRelations(tx, &row)
	})
}

func (r *gormRepository) EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error {
	var resource persistencemodel.RawResource
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
		var folder persistencemodel.ResourceFolder
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
		var item persistencemodel.Script
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "script_version":
		var item persistencemodel.ScriptVersion
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "segment":
		var item persistencemodel.Segment
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "scene_moment":
		var item persistencemodel.SceneMoment
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "content_unit":
		var item persistencemodel.ContentUnit
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "keyframe":
		var item persistencemodel.Keyframe
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "preview_timeline":
		var item persistencemodel.PreviewTimeline
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference":
		var item persistencemodel.CreativeReference
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference_state":
		var item persistencemodel.CreativeReferenceState
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "asset_slot":
		var item persistencemodel.AssetSlot
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "delivery_version":
		var item persistencemodel.DeliveryVersion
		if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "canvas":
		var item persistencemodel.Canvas
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

func (r *gormRepository) BackfillAssetSlotResource(ctx context.Context, binding domainbinding.Binding) error {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	update := db.Model(&persistencemodel.AssetSlot{}).
		Where("id = ? AND resource_id IS NULL", binding.OwnerID).
		Update("resource_id", binding.ResourceID)
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 0 {
		return nil
	}
	slot := persistencemodel.AssetSlot{}
	slot.ID = binding.OwnerID
	return relation.SyncCoreEntityRelations(db, &slot)
}

func (r *gormRepository) ClearAssetSlotResourceIfDeleted(ctx context.Context, binding domainbinding.Binding) error {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	var replacement persistencemodel.ResourceBinding
	err := db.
		Where("owner_type = ? AND owner_id = ? AND resource_id <> ?", "asset_slot", binding.OwnerID, binding.ResourceID).
		Order("is_primary desc, sort_order, created_at").
		First(&replacement).Error
	if err == nil {
		update := db.Model(&persistencemodel.AssetSlot{}).
			Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
			Update("resource_id", replacement.ResourceID)
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected > 0 {
			slot := persistencemodel.AssetSlot{}
			slot.ID = binding.OwnerID
			return relation.SyncCoreEntityRelations(db, &slot)
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	update := db.Model(&persistencemodel.AssetSlot{}).
		Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
		Update("resource_id", nil)
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 0 {
		return nil
	}
	slot := persistencemodel.AssetSlot{}
	slot.ID = binding.OwnerID
	return relation.SyncCoreEntityRelations(db, &slot)
}

func (r *gormRepository) nextSortOrderWithDB(db *gorm.DB, projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	var maxOrder int
	db.Model(&persistencemodel.ResourceBinding{}).
		Select("COALESCE(MAX(sort_order), 0)").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?", projectID, ownerType, ownerID, role, slot).
		Scan(&maxOrder)
	return maxOrder + 1
}

func (r *gormRepository) clearOtherPrimaryBindingsWithDB(db *gorm.DB, binding persistencemodel.ResourceBinding) error {
	return db.Model(&persistencemodel.ResourceBinding{}).
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

func bindingsFromModels(items []persistencemodel.ResourceBinding) []domainbinding.Binding {
	out := make([]domainbinding.Binding, 0, len(items))
	for _, item := range items {
		out = append(out, domainbinding.BindingFromModel(item))
	}
	return out
}
