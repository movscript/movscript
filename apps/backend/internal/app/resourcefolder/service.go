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

func (s *Service) List(ctx context.Context, userID uint, shared bool) ([]model.ResourceFolder, error) {
	folders := make([]model.ResourceFolder, 0)
	q := s.db.WithContext(ctx)
	if shared {
		q = q.Preload("Owner").Where("is_shared = true AND owner_id != ?", userID).Order("created_at asc")
	} else {
		q = q.Where("owner_id = ?", userID).Order("created_at asc")
	}
	if err := q.Find(&folders).Error; err != nil {
		return nil, err
	}
	populateFolderCounts(s.db.WithContext(ctx), folders)
	return folders, nil
}

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (model.ResourceFolder, error) {
	folder := model.ResourceFolder{
		OwnerID:        ownerID,
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

func (s *Service) Update(ctx context.Context, userID uint, id uint, input UpdateInput) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID {
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

func (s *Service) Delete(ctx context.Context, userID uint, id uint) error {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if folder.OwnerID != userID {
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

func (s *Service) ListPermissions(ctx context.Context, userID uint, id uint) ([]model.ResourceFolderPermission, error) {
	folder, err := s.requireOwner(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	var perms []model.ResourceFolderPermission
	if err := s.db.WithContext(ctx).Preload("User").Where("folder_id = ?", folder.ID).Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}

func (s *Service) GrantPermission(ctx context.Context, userID uint, id uint, input PermissionInput) (model.ResourceFolderPermission, error) {
	folder, err := s.requireOwner(ctx, userID, id)
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

func (s *Service) RevokePermission(ctx context.Context, userID uint, id uint, targetUserID uint) error {
	folder, err := s.requireOwner(ctx, userID, id)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Where("folder_id = ? AND user_id = ?", folder.ID, targetUserID).
		Delete(&model.ResourceFolderPermission{}).Error
}

func (s *Service) requireOwner(ctx context.Context, userID uint, id uint) (model.ResourceFolder, error) {
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return folder, ErrNotFound
		}
		return folder, err
	}
	if folder.OwnerID != userID {
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

func ParsePermissionID(raw string) (uint, error) {
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(n), nil
}
