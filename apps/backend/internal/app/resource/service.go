package resource

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("resource not found")
	ErrFolderNotFound = errors.New("resource folder not found")
	ErrForbidden      = errors.New("resource access denied")
	ErrNoStorageKey   = errors.New("resource has no storage key")
)

type Service struct {
	db    *gorm.DB
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{db: db, store: store}
}

type ListInput struct {
	UserID   uint
	FolderID string
	Shared   bool
	Type     string
	Query    string
	Page     int
	PageSize int
}

type Page struct {
	Total    int64               `json:"total"`
	Items    []model.RawResource `json:"items"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

type UploadInput struct {
	UserID   uint
	FolderID string
	Filename string
	MimeType string
	Size     int64
	Data     []byte
}

type UpdateInput struct {
	UserID   uint
	ID       uint
	IsShared *bool
	FolderID *uint
	Name     string
}

func (s *Service) List(ctx context.Context, input ListInput) ([]model.RawResource, *Page, error) {
	q, err := s.listQuery(ctx, input)
	if err != nil {
		return nil, nil, err
	}
	q = applyListFilters(q, input)
	if input.Page > 0 || input.PageSize > 0 {
		page := max(1, input.Page)
		pageSize := max(1, input.PageSize)
		if pageSize > 100 {
			pageSize = 100
		}
		offset := (page - 1) * pageSize
		var total int64
		if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Count(&total).Error; err != nil {
			return nil, nil, err
		}
		resources := make([]model.RawResource, 0)
		if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Order("created_at desc").Limit(pageSize).Offset(offset).Find(&resources).Error; err != nil {
			return nil, nil, err
		}
		return resources, &Page{Total: total, Items: resources, Page: page, PageSize: pageSize}, nil
	}
	resources := make([]model.RawResource, 0)
	err = q.Order("created_at desc").Find(&resources).Error
	return resources, nil, err
}

func (s *Service) Upload(ctx context.Context, input UploadInput) (model.RawResource, error) {
	folderID, err := s.uploadFolderID(ctx, input.UserID, input.FolderID)
	if err != nil {
		return model.RawResource{}, err
	}
	mimeType := input.MimeType
	resType := MimeToType(mimeType, input.Filename)
	r := model.RawResource{
		OwnerID:        input.UserID,
		FolderID:       folderID,
		Type:           resType,
		Name:           input.Filename,
		MimeType:       mimeType,
		Size:           input.Size,
		FilePath:       "",
		StorageBackend: s.store.Backend(),
	}
	if err := s.db.WithContext(ctx).Create(&r).Error; err != nil {
		return model.RawResource{}, err
	}

	key := GenerateStorageKey(r.ID, input.Filename)
	data := input.Data
	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(ctx, data, mimeType); err != nil {
		fmt.Printf("[resource] video normalization skipped for %q: %v\n", input.Filename, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
		r.Type = MimeToType(mimeType, input.Filename)
		r.MimeType = mimeType
		r.Name = media.MP4Name(r.Name)
		r.Size = int64(len(data))
	}

	if err := s.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		s.db.WithContext(ctx).Delete(&r)
		return model.RawResource{}, err
	}
	if err := s.db.WithContext(ctx).Model(&r).Updates(map[string]any{
		"file_path":       key,
		"storage_key":     key,
		"storage_backend": s.store.Backend(),
		"type":            r.Type,
		"name":            r.Name,
		"mime_type":       r.MimeType,
		"size":            r.Size,
	}).Error; err != nil {
		return model.RawResource{}, err
	}
	r.StorageKey = key
	r.StorageBackend = s.store.Backend()
	return r, nil
}

func (s *Service) GetVisible(ctx context.Context, id uint, userID uint) (model.RawResource, error) {
	var r model.RawResource
	if err := s.db.WithContext(ctx).First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return r, ErrNotFound
		}
		return r, err
	}
	if r.OwnerID == userID {
		return r, nil
	}
	allowed := r.IsShared
	if !allowed && r.FolderID != nil {
		var folder model.ResourceFolder
		if s.db.WithContext(ctx).First(&folder, *r.FolderID).Error == nil {
			allowed = folder.IsShared
		}
	}
	if !allowed {
		return r, ErrForbidden
	}
	return r, nil
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint) error {
	var r model.RawResource
	if err := s.db.WithContext(ctx).First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if r.OwnerID != userID {
		return ErrForbidden
	}
	if r.StorageKey != "" {
		_ = s.store.Delete(ctx, r.StorageKey)
	}
	if err := s.db.WithContext(ctx).Where("resource_id = ?", r.ID).Delete(&model.ResourceBinding{}).Error; err != nil {
		return err
	}
	return s.db.WithContext(ctx).Delete(&r).Error
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (model.RawResource, error) {
	var r model.RawResource
	if err := s.db.WithContext(ctx).First(&r, input.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return r, ErrNotFound
		}
		return r, err
	}
	if r.OwnerID != input.UserID {
		return r, ErrForbidden
	}
	updates := map[string]any{}
	if input.IsShared != nil {
		updates["is_shared"] = *input.IsShared
	}
	if input.FolderID != nil {
		if *input.FolderID == 0 {
			updates["folder_id"] = nil
		} else {
			updates["folder_id"] = *input.FolderID
		}
	}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&r).Updates(updates).Error; err != nil {
			return r, err
		}
	}
	if err := s.db.WithContext(ctx).First(&r, r.ID).Error; err != nil {
		return r, err
	}
	return r, nil
}

func (s *Service) listQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	if input.Shared {
		return s.sharedListQuery(ctx, input)
	}
	q := s.db.WithContext(ctx).Model(&model.RawResource{}).Where("owner_id = ?", input.UserID)
	switch input.FolderID {
	case "", "all":
	case "root", "0":
		q = q.Where("folder_id IS NULL")
	default:
		q = q.Where("folder_id = ?", input.FolderID)
	}
	return q, nil
}

func (s *Service) sharedListQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	if input.FolderID != "" {
		var folder model.ResourceFolder
		if err := s.db.WithContext(ctx).First(&folder, input.FolderID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrFolderNotFound
			}
			return nil, err
		}
		if folder.OwnerID != input.UserID && !folder.IsShared {
			return nil, ErrForbidden
		}
		return s.db.WithContext(ctx).Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Preload("Owner"), nil
	}
	return s.db.WithContext(ctx).Model(&model.RawResource{}).Where("owner_id != ? AND is_shared = true", input.UserID).Preload("Owner"), nil
}

func (s *Service) uploadFolderID(ctx context.Context, userID uint, folderIDValue string) (*uint, error) {
	if folderIDValue == "" || folderIDValue == "0" {
		return nil, nil
	}
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, folderIDValue).Error; err != nil {
		return nil, nil
	}
	if folder.OwnerID != userID {
		if !folder.IsShared {
			return nil, ErrForbidden
		}
		var perm model.ResourceFolderPermission
		if s.db.WithContext(ctx).Where("folder_id = ? AND user_id = ? AND permission = ?", folder.ID, userID, "write").
			First(&perm).Error != nil {
			return nil, ErrForbidden
		}
	}
	fid := folder.ID
	return &fid, nil
}

func applyListFilters(q *gorm.DB, input ListInput) *gorm.DB {
	if typ := strings.TrimSpace(input.Type); typ != "" && typ != "all" {
		parts := strings.Split(typ, ",")
		types := make([]string, 0, len(parts))
		for _, p := range parts {
			if v := strings.TrimSpace(p); v != "" {
				types = append(types, v)
			}
		}
		if len(types) == 1 {
			q = q.Where("type = ?", types[0])
		} else if len(types) > 1 {
			q = q.Where("type IN ?", types)
		}
	}
	if keyword := strings.TrimSpace(input.Query); keyword != "" {
		q = q.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(keyword)+"%")
	}
	return q
}

func MimeToType(mime, filename string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	case strings.HasPrefix(mime, "text/"):
		return "text"
	case mime == "application/json", mime == "application/xml", mime == "application/yaml", mime == "application/x-yaml":
		return "text"
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif":
		return "image"
	case ".mp4", ".mov", ".avi", ".webm":
		return "video"
	case ".mp3", ".wav", ".ogg", ".aac", ".flac":
		return "audio"
	case ".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log":
		return "text"
	}
	return "file"
}

func GenerateStorageKey(resourceID uint, filename string) string {
	ext := filepath.Ext(filename)
	base := sanitizeName(strings.TrimSuffix(filename, ext))
	return fmt.Sprintf("%d_%s%s", resourceID, base, ext)
}

func sanitizeName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}
