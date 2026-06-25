package folder

import (
	"context"
	"errors"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resource/folder"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	IncludeLegacyPersonal(ctx context.Context, orgID *uint) bool
	ListFolders(ctx context.Context, userID uint, orgID *uint, includeLegacy bool) ([]domainresourcefolder.Folder, error)
	CreateFolder(ctx context.Context, ownerID uint, input CreateInput, includeLegacy bool) (domainresourcefolder.Folder, error)
	UpdateFolder(ctx context.Context, userID uint, orgID *uint, id uint, spec domainresourcefolder.FolderUpdateSpec, includeLegacy bool) (domainresourcefolder.Folder, error)
	DeleteFolder(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) error
}

type gormRepository struct {
	db       *gorm.DB
	identity orgReader
}

type orgReader interface {
	ListOrgs(ctx context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error)
}

func (r *gormRepository) ListFolders(ctx context.Context, userID uint, orgID *uint, includeLegacy bool) ([]domainresourcefolder.Folder, error) {
	folders := make([]persistencemodel.ResourceFolder, 0)
	q := r.db.WithContext(ctx)
	if orgID != nil {
		if includeLegacy {
			q = q.Where("(org_id = ? OR (org_id IS NULL AND owner_id = ?))", *orgID, userID)
		} else {
			q = q.Where("org_id = ?", *orgID)
		}
	} else {
		q = q.Where("owner_id = ?", userID)
		q = applyOrgScope(q, orgID, userID, includeLegacy)
	}
	q = q.Order("created_at asc")
	if err := q.Find(&folders).Error; err != nil {
		return nil, err
	}
	r.populateFolderCounts(ctx, folders)
	return folderSliceFromModels(folders), nil
}

func (r *gormRepository) CreateFolder(ctx context.Context, ownerID uint, input CreateInput, includeLegacy bool) (domainresourcefolder.Folder, error) {
	if input.ParentID != nil {
		var parent persistencemodel.ResourceFolder
		if err := r.db.WithContext(ctx).First(&parent, *input.ParentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domainresourcefolder.Folder{}, ErrNotFound
			}
			return domainresourcefolder.Folder{}, err
		}
		if !domainresourcefolder.FolderInOrgScope(parent.OrgID, input.OrgID, parent.OwnerID, ownerID, includeLegacy) {
			return domainresourcefolder.Folder{}, ErrForbidden
		}
		if parent.OwnerID != ownerID && !folderInCurrentTeam(parent.OrgID, input.OrgID) {
			return domainresourcefolder.Folder{}, ErrForbidden
		}
	}
	folder := domainresourcefolder.NewFolder(domainresourcefolder.NewFolderSpec{
		OwnerID:        ownerID,
		OrgID:          input.OrgID,
		Name:           input.Name,
		ParentID:       input.ParentID,
		StorageBackend: input.StorageBackend,
	}).ToModel()
	if err := r.db.WithContext(ctx).Create(&folder).Error; err != nil {
		return domainresourcefolder.Folder{}, err
	}
	return domainresourcefolder.FolderFromModel(folder), nil
}

func (r *gormRepository) UpdateFolder(ctx context.Context, userID uint, orgID *uint, id uint, spec domainresourcefolder.FolderUpdateSpec, includeLegacy bool) (domainresourcefolder.Folder, error) {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return domainresourcefolder.Folder{}, err
	}
	updates := folderUpdateColumns(spec)
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&folder).Updates(updates).Error; err != nil {
			return domainresourcefolder.Folder{}, err
		}
	}
	if err := r.db.WithContext(ctx).First(&folder, folder.ID).Error; err != nil {
		return domainresourcefolder.Folder{}, err
	}
	return domainresourcefolder.FolderFromModel(folder), nil
}

func folderUpdateColumns(spec domainresourcefolder.FolderUpdateSpec) map[string]any {
	updates := map[string]any{}
	if spec.Name != nil {
		updates["name"] = *spec.Name
	}
	if spec.StorageBackend != nil {
		updates["storage_backend"] = *spec.StorageBackend
	}
	return updates
}

func (r *gormRepository) DeleteFolder(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) error {
	folder, err := r.requireOwner(ctx, userID, orgID, id, includeLegacy)
	if err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Where("folder_id = ?", folder.ID).Update("folder_id", nil).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Delete(&folder).Error
}

func (r *gormRepository) requireOwner(ctx context.Context, userID uint, orgID *uint, id uint, includeLegacy bool) (persistencemodel.ResourceFolder, error) {
	var folder persistencemodel.ResourceFolder
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

func folderInCurrentTeam(folderOrgID, currentOrgID *uint) bool {
	return folderOrgID != nil && currentOrgID != nil && *folderOrgID == *currentOrgID
}

func (r *gormRepository) populateFolderCounts(ctx context.Context, folders []persistencemodel.ResourceFolder) {
	for i := range folders {
		var count int64
		r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).
			Where("folder_id = ? AND deleted_at IS NULL", folders[i].ID).
			Count(&count)
		folders[i].ResourceCount = int(count)
	}
}

func (r *gormRepository) IncludeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	if r.identity == nil {
		return false
	}
	page, err := r.identity.ListOrgs(ctx, authidentity.ListOrgsFilter{OrgID: orgID, Page: 1, PageSize: 1})
	if err != nil || len(page.Items) == 0 {
		return false
	}
	return page.Items[0].IsPersonal
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

func folderSliceFromModels(items []persistencemodel.ResourceFolder) []domainresourcefolder.Folder {
	folders := make([]domainresourcefolder.Folder, 0, len(items))
	for _, item := range items {
		folders = append(folders, domainresourcefolder.FolderFromModel(item))
	}
	return folders
}
