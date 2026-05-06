package resourcefolder

import (
	"context"
	"errors"
	"strconv"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("resource folder not found")
	ErrForbidden = errors.New("resource folder forbidden")
	ErrConflict  = errors.New("resource folder conflict")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type CreateInput struct {
	OrgID          *uint
	Name           string
	ParentID       *uint
	StorageBackend string
	IsShared       bool
}

type UpdateInput struct {
	Name           string
	StorageBackend string
	IsShared       *bool
}

type PermissionInput struct {
	UserID     uint
	Permission string
}

func (s *Service) List(ctx context.Context, userID uint, orgID *uint, shared bool) ([]model.ResourceFolder, error) {
	folders := make([]model.ResourceFolder, 0)
	q := s.db.WithContext(ctx)
	if shared {
		q = q.Preload("Owner").Where("is_shared = true AND owner_id != ?", userID)
	} else {
		q = q.Where("owner_id = ?", userID)
	}
	q = applyOrgScope(q, orgID, userID, s.includeLegacyPersonal(ctx, orgID)).Order("created_at asc")
	if err := q.Find(&folders).Error; err != nil {
		return nil, err
	}
	populateFolderCounts(s.db.WithContext(ctx), folders)
	return folders, nil
}

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (model.ResourceFolder, error) {
	if input.ParentID != nil {
		var parent model.ResourceFolder
		if err := s.db.WithContext(ctx).First(&parent, *input.ParentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return model.ResourceFolder{}, ErrNotFound
			}
			return model.ResourceFolder{}, err
		}
		if parent.OwnerID != ownerID || !folderInOrgScope(parent.OrgID, input.OrgID, parent.OwnerID, ownerID, s.includeLegacyPersonal(ctx, input.OrgID)) {
			return model.ResourceFolder{}, ErrForbidden
		}
	}
	folder := model.ResourceFolder{
		OwnerID:        ownerID,
		OrgID:          input.OrgID,
		Name:           input.Name,
		ParentID:       input.ParentID,
		StorageBackend: input.StorageBackend,
		IsShared:       input.IsShared,
	}
	if err := s.db.WithContext(ctx).Create(&folder).Error; err != nil {
		return folder, err
	}
	return folder, nil
}

func (s *Service) Update(ctx context.Context, userID uint, orgID *uint, id uint, input UpdateInput) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID || !folderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return folder, ErrForbidden
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
	if err := s.db.WithContext(ctx).Model(&folder).Updates(updates).Error; err != nil {
		return folder, err
	}
	if err := s.db.WithContext(ctx).First(&folder, folder.ID).Error; err != nil {
		return folder, err
	}
	return folder, nil
}

func (s *Service) Delete(ctx context.Context, userID uint, orgID *uint, id uint) error {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if folder.OwnerID != userID || !folderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return ErrForbidden
	}
	if err := s.db.WithContext(ctx).Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Update("folder_id", nil).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Where("folder_id = ?", folder.ID).Delete(&model.ResourceFolderPermission{}).Error; err != nil {
		return err
	}
	return s.db.WithContext(ctx).Delete(&folder).Error
}

func (s *Service) ListPermissions(ctx context.Context, userID uint, orgID *uint, id uint) ([]model.ResourceFolderPermission, error) {
	folder, err := s.requireOwner(ctx, userID, orgID, id)
	if err != nil {
		return nil, err
	}
	var perms []model.ResourceFolderPermission
	if err := s.db.WithContext(ctx).Preload("User").Where("folder_id = ?", folder.ID).Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}

func (s *Service) GrantPermission(ctx context.Context, userID uint, orgID *uint, id uint, input PermissionInput) (model.ResourceFolderPermission, error) {
	folder, err := s.requireOwner(ctx, userID, orgID, id)
	if err != nil {
		return model.ResourceFolderPermission{}, err
	}
	perm := input.Permission
	if perm == "" {
		perm = "read"
	}
	if perm != "read" && perm != "write" {
		return model.ResourceFolderPermission{}, ErrConflict
	}
	if input.UserID == userID {
		return model.ResourceFolderPermission{}, ErrForbidden
	}
	var existing model.ResourceFolderPermission
	if s.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, input.UserID).First(&existing).Error != nil {
		existing = model.ResourceFolderPermission{FolderID: folder.ID, UserID: input.UserID, Permission: perm}
		if err := s.db.WithContext(ctx).Create(&existing).Error; err != nil {
			return existing, err
		}
	} else {
		if err := s.db.WithContext(ctx).Model(&existing).Update("permission", perm).Error; err != nil {
			return existing, err
		}
	}
	if err := s.db.WithContext(ctx).Preload("User").First(&existing, existing.ID).Error; err != nil {
		return existing, err
	}
	return existing, nil
}

func (s *Service) RevokePermission(ctx context.Context, userID uint, orgID *uint, id uint, targetUserID uint) error {
	folder, err := s.requireOwner(ctx, userID, orgID, id)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, targetUserID).
		Delete(&model.ResourceFolderPermission{}).Error
}

func (s *Service) requireOwner(ctx context.Context, userID uint, orgID *uint, id uint) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID || !folderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return folder, ErrForbidden
	}
	return folder, nil
}

func populateFolderCounts(db *gorm.DB, folders []model.ResourceFolder) {
	for i := range folders {
		var count int64
		db.Model(&model.RawResource{}).
			Where("folder_id = ? AND deleted_at IS NULL", folders[i].ID).
			Count(&count)
		folders[i].ResourceCount = int(count)
	}
}

func (s *Service) includeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
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

func folderInOrgScope(folderOrgID, currentOrgID *uint, ownerID uint, userID uint, includeLegacy bool) bool {
	if sameOrg(folderOrgID, currentOrgID) {
		return true
	}
	return includeLegacy && folderOrgID == nil && ownerID == userID
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func ParsePermissionID(raw string) (uint, error) {
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(n), nil
}
