package resourcefolder

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resourcefolder"
	"gorm.io/gorm"
)

type repository interface {
	IncludeLegacyPersonal(ctx context.Context, orgID *uint) bool
	ListFolders(ctx context.Context, userID uint, orgID *uint, shared bool, includeLegacy bool) ([]model.ResourceFolder, error)
	CreateFolder(ctx context.Context, ownerID uint, input CreateInput, includeLegacy bool) (model.ResourceFolder, error)
	UpdateFolder(ctx context.Context, userID uint, orgID *uint, id uint, input UpdateInput, includeLegacy bool) (model.ResourceFolder, error)
	DeleteFolder(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) error
	ListPermissions(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) ([]model.ResourceFolderPermission, error)
	GrantPermission(ctx context.Context, userID uint, orgID *uint, id uint, input PermissionInput, includeLegacy bool) (model.ResourceFolderPermission, error)
	RevokePermission(ctx context.Context, userID uint, orgID *uint, id uint, targetUserID uint, includeLegacy bool) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListFolders(ctx context.Context, userID uint, orgID *uint, shared bool, includeLegacy bool) ([]model.ResourceFolder, error) {
	folders := make([]model.ResourceFolder, 0)
	q := r.db.WithContext(ctx)
	if shared {
		q = q.Preload("Owner").Where("is_shared = true AND owner_id != ?", userID)
	} else {
		q = q.Where("owner_id = ?", userID)
	}
	q = applyOrgScope(q, orgID, userID, includeLegacy).Order("created_at asc")
	if err := q.Find(&folders).Error; err != nil {
		return nil, err
	}
	r.populateFolderCounts(ctx, folders)
	return folders, nil
}

func (r *gormRepository) CreateFolder(ctx context.Context, ownerID uint, input CreateInput, includeLegacy bool) (model.ResourceFolder, error) {
	if input.ParentID != nil {
		var parent model.ResourceFolder
		if err := r.db.WithContext(ctx).First(&parent, *input.ParentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return model.ResourceFolder{}, ErrNotFound
			}
			return model.ResourceFolder{}, err
		}
		if parent.OwnerID != ownerID || !domainresourcefolder.FolderInOrgScope(parent.OrgID, input.OrgID, parent.OwnerID, ownerID, includeLegacy) {
			return model.ResourceFolder{}, ErrForbidden
		}
	}
	folder := domainresourcefolder.NewFolder(domainresourcefolder.NewFolderSpec{
		OwnerID:        ownerID,
		OrgID:          input.OrgID,
		Name:           input.Name,
		ParentID:       input.ParentID,
		StorageBackend: input.StorageBackend,
		IsShared:       input.IsShared,
	}).ToModel()
	if err := r.db.WithContext(ctx).Create(&folder).Error; err != nil {
		return folder, err
	}
	return folder, nil
}

func (r *gormRepository) UpdateFolder(ctx context.Context, userID uint, orgID *uint, id uint, input UpdateInput, includeLegacy bool) (model.ResourceFolder, error) {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return folder, err
	}
	updates := map[string]any{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.StorageBackend != "" {
		updates["storage_backend"] = input.StorageBackend
	}
	if input.IsShared != nil {
		updates["is_shared"] = *input.IsShared
	}
	if err := r.db.WithContext(ctx).Model(&folder).Updates(updates).Error; err != nil {
		return folder, err
	}
	if err := r.db.WithContext(ctx).First(&folder, folder.ID).Error; err != nil {
		return folder, err
	}
	return folder, nil
}

func (r *gormRepository) DeleteFolder(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) error {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Update("folder_id", nil).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Where("folder_id = ?", folder.ID).Delete(&model.ResourceFolderPermission{}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Delete(&folder).Error
}

func (r *gormRepository) ListPermissions(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) ([]model.ResourceFolderPermission, error) {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return nil, err
	}
	var perms []model.ResourceFolderPermission
	if err := r.db.WithContext(ctx).Preload("User").Where("folder_id = ?", folder.ID).Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}

func (r *gormRepository) GrantPermission(ctx context.Context, userID uint, orgID *uint, id uint, input PermissionInput, includeLegacy bool) (model.ResourceFolderPermission, error) {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return model.ResourceFolderPermission{}, err
	}
	perm := domainresourcefolder.NormalizePermission(input.Permission)
	if !domainresourcefolder.ValidPermission(perm) {
		return model.ResourceFolderPermission{}, ErrConflict
	}
	if input.UserID == userID {
		return model.ResourceFolderPermission{}, ErrForbidden
	}
	var existing model.ResourceFolderPermission
	if r.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, input.UserID).First(&existing).Error != nil {
		existing = domainresourcefolder.NewPermission(folder.ID, input.UserID, perm).ToModel()
		if err := r.db.WithContext(ctx).Create(&existing).Error; err != nil {
			return existing, err
		}
	} else {
		if err := r.db.WithContext(ctx).Model(&existing).Update("permission", perm).Error; err != nil {
			return existing, err
		}
	}
	if err := r.db.WithContext(ctx).Preload("User").First(&existing, existing.ID).Error; err != nil {
		return existing, err
	}
	return existing, nil
}

func (r *gormRepository) RevokePermission(ctx context.Context, userID uint, orgID *uint, id uint, targetUserID uint, includeLegacy bool) error {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return err
	}
	return r.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, targetUserID).
		Delete(&model.ResourceFolderPermission{}).Error
}

func (r *gormRepository) requireOwner(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := r.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID || !domainresourcefolder.FolderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, includeLegacy) {
		return folder, ErrForbidden
	}
	return folder, nil
}

func (r *gormRepository) populateFolderCounts(ctx context.Context, folders []model.ResourceFolder) {
	for i := range folders {
		var count int64
		r.db.WithContext(ctx).Model(&model.RawResource{}).
			Where("folder_id = ? AND deleted_at IS NULL", folders[i].ID).
			Count(&count)
		folders[i].ResourceCount = int(count)
	}
}

func (r *gormRepository) IncludeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org model.Organization
	if err := r.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

func applyOrgScope(q *gorm.DB, orgID *uint, userID uint, includeLegacy bool) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if includeLegacy {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_id = ?)", *orgID, userID)
	}
	return q.Where("org_id = ?", *orgID)
}
