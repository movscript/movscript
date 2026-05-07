package resource

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/cache"
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
	repo  repository
	store storage.Storage
	cache cache.Cache
}

const listCacheTTL = 60 * time.Second

func NewService(db *gorm.DB, store storage.Storage, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db}, store: store, cache: c}
}

type ListInput struct {
	UserID   uint
	OrgID    *uint
	FolderID string
	Shared   bool
	Type     string
	Query    string
	Page     int
	PageSize int
}

type Page struct {
	Total    int64                        `json:"total"`
	Items    []domainresource.RawResource `json:"items"`
	Page     int                          `json:"page"`
	PageSize int                          `json:"page_size"`
}

type UploadInput struct {
	UserID   uint
	OrgID    *uint
	FolderID string
	Filename string
	MimeType string
	Size     int64
	Data     []byte
}

type UpdateInput struct {
	UserID   uint
	OrgID    *uint
	ID       uint
	IsShared *bool
	FolderID *uint
	Name     string
}

func (s *Service) List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error) {
	version, _ := s.cache.GetVersion(ctx, resourceListNamespace(input.UserID, input.OrgID))
	cacheKey := resourceListCacheKey(input, version)
	var cached cachedListResult
	if ok, err := s.cache.GetJSON(ctx, cacheKey, &cached); err == nil && ok {
		if cached.Page != nil {
			cached.Page.Items = cached.Resources
		}
		return cached.Resources, cached.Page, nil
	}
	resources, page, err := s.repo.List(ctx, input)
	if err == nil {
		_ = s.cache.SetJSON(ctx, cacheKey, cachedListResult{Resources: resources, Page: page}, listCacheTTL)
	}
	return resources, page, err
}

func (s *Service) Upload(ctx context.Context, input UploadInput) (domainresource.RawResource, error) {
	folderID, err := s.repo.UploadFolderID(ctx, input.UserID, input.OrgID, input.FolderID)
	if err != nil {
		return domainresource.RawResource{}, err
	}
	mimeType := normalizeUploadMimeType(input.MimeType, input.Filename)
	r := domainresource.NewUploadedResource(domainresource.NewUploadedResourceSpec{
		OwnerID:        input.UserID,
		OrgID:          input.OrgID,
		FolderID:       folderID,
		Name:           input.Filename,
		MimeType:       mimeType,
		Size:           input.Size,
		StorageBackend: s.store.Backend(),
	})
	if err := s.repo.CreateResource(ctx, &r); err != nil {
		return domainresource.RawResource{}, err
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
		_ = s.repo.DeleteResourceRecord(ctx, &r)
		return domainresource.RawResource{}, err
	}
	if err := s.repo.UpdateResourceRecord(ctx, &r, map[string]any{
		"file_path":       key,
		"storage_key":     key,
		"storage_backend": s.store.Backend(),
		"type":            r.Type,
		"name":            r.Name,
		"mime_type":       r.MimeType,
		"size":            r.Size,
	}); err != nil {
		return domainresource.RawResource{}, err
	}
	r.StorageKey = key
	r.StorageBackend = s.store.Backend()
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func (s *Service) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	return s.repo.GetVisible(ctx, id, userID, orgID)
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint, orgID *uint) error {
	r, err := s.repo.GetOwned(ctx, id, userID, orgID)
	if err != nil {
		return err
	}
	if r.StorageKey != "" {
		_ = s.store.Delete(ctx, r.StorageKey)
	}
	if err := s.repo.DeleteResourceAndBindings(ctx, r); err != nil {
		return err
	}
	s.bumpListVersion(ctx, userID, orgID)
	return nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (domainresource.RawResource, error) {
	r, err := s.repo.GetOwned(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return r, err
	}
	updates := map[string]any{}
	if input.IsShared != nil {
		updates["is_shared"] = *input.IsShared
	}
	if input.FolderID != nil {
		if *input.FolderID == 0 {
			updates["folder_id"] = nil
		} else {
			folderID, err := s.repo.UploadFolderID(ctx, input.UserID, input.OrgID, strconv.FormatUint(uint64(*input.FolderID), 10))
			if err != nil {
				return r, err
			}
			if folderID == nil {
				return r, ErrFolderNotFound
			}
			updates["folder_id"] = *folderID
		}
	}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if len(updates) > 0 {
		if err := s.repo.UpdateResourceRecord(ctx, &r, updates); err != nil {
			return r, err
		}
	}
	if err := s.repo.ReloadResource(ctx, &r); err != nil {
		return r, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

type cachedListResult struct {
	Resources []domainresource.RawResource `json:"resources"`
	Page      *Page                        `json:"page,omitempty"`
}

func (s *Service) bumpListVersion(ctx context.Context, userID uint, orgID *uint) {
	_, _ = s.cache.BumpVersion(ctx, resourceListNamespace(userID, orgID))
}

func resourceListNamespace(userID uint, orgID *uint) string {
	return fmt.Sprintf("resources:user:%d:org:%s", userID, orgIDCachePart(orgID))
}

func resourceListCacheKey(input ListInput, version int64) string {
	values := url.Values{}
	values.Set("folder_id", strings.TrimSpace(input.FolderID))
	values.Set("shared", strconv.FormatBool(input.Shared))
	values.Set("type", strings.TrimSpace(input.Type))
	values.Set("q", strings.TrimSpace(input.Query))
	values.Set("page", strconv.Itoa(input.Page))
	values.Set("page_size", strconv.Itoa(input.PageSize))
	return fmt.Sprintf("%s:v%d:%s", resourceListNamespace(input.UserID, input.OrgID), version, values.Encode())
}

func orgIDCachePart(orgID *uint) string {
	if orgID == nil {
		return "none"
	}
	return strconv.FormatUint(uint64(*orgID), 10)
}

func MimeToType(mime, filename string) string {
	return domainresource.MimeToType(mime, filename)
}

func normalizeUploadMimeType(mimeType, filename string) string {
	base := strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if base != "" && base != "application/octet-stream" {
		return mimeType
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	default:
		return mimeType
	}
}

func GenerateStorageKey(resourceID uint, filename string) string {
	return domainresource.GenerateStorageKey(resourceID, filename)
}
