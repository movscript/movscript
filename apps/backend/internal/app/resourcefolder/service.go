package resourcefolder

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/movscript/movscript/internal/domain/model"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resourcefolder"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("resource folder not found")
	ErrForbidden = errors.New("resource folder forbidden")
	ErrConflict  = errors.New("resource folder conflict")
)

type Service struct {
	db    *gorm.DB
	cache cache.Cache
}

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{db: db, cache: c}
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
		if parent.OwnerID != ownerID || !domainresourcefolder.FolderInOrgScope(parent.OrgID, input.OrgID, parent.OwnerID, ownerID, s.includeLegacyPersonal(ctx, input.OrgID)) {
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
	s.bumpResourceListVersion(ctx, ownerID, input.OrgID)
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
	if folder.OwnerID != userID || !domainresourcefolder.FolderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
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
	s.bumpResourceListVersion(ctx, userID, orgID)
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
	if folder.OwnerID != userID || !domainresourcefolder.FolderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return ErrForbidden
	}
	if err := s.db.WithContext(ctx).Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Update("folder_id", nil).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Where("folder_id = ?", folder.ID).Delete(&model.ResourceFolderPermission{}).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Delete(&folder).Error; err != nil {
		return err
	}
	s.bumpResourceListVersion(ctx, userID, orgID)
	return nil
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
	s.bumpResourceListVersion(ctx, userID, orgID)
	s.bumpResourceListVersion(ctx, input.UserID, orgID)
	return existing, nil
}

func (s *Service) RevokePermission(ctx context.Context, userID uint, orgID *uint, id uint, targetUserID uint) error {
	folder, err := s.requireOwner(ctx, userID, orgID, id)
	if err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, targetUserID).
		Delete(&model.ResourceFolderPermission{}).Error; err != nil {
		return err
	}
	s.bumpResourceListVersion(ctx, userID, orgID)
	s.bumpResourceListVersion(ctx, targetUserID, orgID)
	return nil
}

func (s *Service) requireOwner(ctx context.Context, userID uint, orgID *uint, id uint) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID || !domainresourcefolder.FolderInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
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

func (s *Service) bumpResourceListVersion(ctx context.Context, userID uint, orgID *uint) {
	_, _ = s.cache.BumpVersion(ctx, resourceListNamespace(userID, orgID))
}

func resourceListNamespace(userID uint, orgID *uint) string {
	return fmt.Sprintf("resources:user:%d:org:%s", userID, orgIDCachePart(orgID))
}

func orgIDCachePart(orgID *uint) string {
	if orgID == nil {
		return "none"
	}
	return strconv.FormatUint(uint64(*orgID), 10)
}

func ParsePermissionID(raw string) (uint, error) {
	return domainresourcefolder.ParsePermissionID(raw)
}
