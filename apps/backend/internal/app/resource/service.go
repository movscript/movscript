package resource

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	resourcebinding "github.com/movscript/movscript/internal/app/resourcebinding"
	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/domain/model"
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
	db    *gorm.DB
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
	return &Service{db: db, store: store, cache: c}
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
	Total    int64               `json:"total"`
	Items    []model.RawResource `json:"items"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
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

func (s *Service) List(ctx context.Context, input ListInput) ([]model.RawResource, *Page, error) {
	version, _ := s.cache.GetVersion(ctx, resourceListNamespace(input.UserID, input.OrgID))
	cacheKey := resourceListCacheKey(input, version)
	var cached cachedListResult
	if ok, err := s.cache.GetJSON(ctx, cacheKey, &cached); err == nil && ok {
		if cached.Page != nil {
			cached.Page.Items = cached.Resources
		}
		return cached.Resources, cached.Page, nil
	}
	q, err := s.listQuery(ctx, input)
	if err != nil {
		return nil, nil, err
	}
	q = applyListFilters(q, input)
	if input.Page > 0 || input.PageSize > 0 {
		page := domainresource.NormalizePage(domainresource.PageInput{Page: input.Page, PageSize: input.PageSize})
		var total int64
		if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Count(&total).Error; err != nil {
			return nil, nil, err
		}
		resources := make([]model.RawResource, 0)
		if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Order("created_at desc").Limit(page.PageSize).Offset(page.Offset).Find(&resources).Error; err != nil {
			return nil, nil, err
		}
		resultPage := &Page{Total: total, Items: resources, Page: page.Page, PageSize: page.PageSize}
		_ = s.cache.SetJSON(ctx, cacheKey, cachedListResult{Resources: resources, Page: resultPage}, listCacheTTL)
		return resources, resultPage, nil
	}
	resources := make([]model.RawResource, 0)
	err = q.Order("created_at desc").Find(&resources).Error
	if err == nil {
		_ = s.cache.SetJSON(ctx, cacheKey, cachedListResult{Resources: resources}, listCacheTTL)
	}
	return resources, nil, err
}

func (s *Service) Upload(ctx context.Context, input UploadInput) (model.RawResource, error) {
	folderID, err := s.uploadFolderID(ctx, input.UserID, input.OrgID, input.FolderID)
	if err != nil {
		return model.RawResource{}, err
	}
	mimeType := input.MimeType
	resType := MimeToType(mimeType, input.Filename)
	r := model.RawResource{
		OwnerID:        input.UserID,
		OrgID:          input.OrgID,
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
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func (s *Service) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (model.RawResource, error) {
	var r model.RawResource
	if err := s.db.WithContext(ctx).First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return r, ErrNotFound
		}
		return r, err
	}
	if !resourceInOrgScope(r.OrgID, orgID, r.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return r, ErrForbidden
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

func (s *Service) Delete(ctx context.Context, id uint, userID uint, orgID *uint) error {
	var r model.RawResource
	if err := s.db.WithContext(ctx).First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if r.OwnerID != userID || !resourceInOrgScope(r.OrgID, orgID, r.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return ErrForbidden
	}
	if r.StorageKey != "" {
		_ = s.store.Delete(ctx, r.StorageKey)
	}
	var bindings []model.ResourceBinding
	if err := s.db.WithContext(ctx).Select("id").Where("resource_id = ?", r.ID).Find(&bindings).Error; err != nil {
		return err
	}
	bindingSvc := resourcebinding.NewService(s.db)
	for i := range bindings {
		if err := bindingSvc.Delete(ctx, bindings[i].ID); err != nil {
			return err
		}
	}
	if err := s.db.WithContext(ctx).Delete(&r).Error; err != nil {
		return err
	}
	s.bumpListVersion(ctx, userID, orgID)
	return nil
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
	if !resourceInOrgScope(r.OrgID, input.OrgID, r.OwnerID, input.UserID, s.includeLegacyPersonal(ctx, input.OrgID)) {
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
			folderID, err := s.uploadFolderID(ctx, input.UserID, input.OrgID, strconv.FormatUint(uint64(*input.FolderID), 10))
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
		if err := s.db.WithContext(ctx).Model(&r).Updates(updates).Error; err != nil {
			return r, err
		}
	}
	if err := s.db.WithContext(ctx).First(&r, r.ID).Error; err != nil {
		return r, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func (s *Service) listQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	if input.Shared {
		return s.sharedListQuery(ctx, input)
	}
	q := s.db.WithContext(ctx).Model(&model.RawResource{}).Where("owner_id = ?", input.UserID)
	q = applyOrgScope(q, input.OrgID, input.UserID, s.includeLegacyPersonal(ctx, input.OrgID))
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
		if !resourceInOrgScope(folder.OrgID, input.OrgID, folder.OwnerID, input.UserID, s.includeLegacyPersonal(ctx, input.OrgID)) {
			return nil, ErrForbidden
		}
		if folder.OwnerID != input.UserID && !folder.IsShared {
			return nil, ErrForbidden
		}
		return s.db.WithContext(ctx).Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Preload("Owner"), nil
	}
	q := s.db.WithContext(ctx).Model(&model.RawResource{}).Where("owner_id != ? AND is_shared = true", input.UserID).Preload("Owner")
	return applyOrgScope(q, input.OrgID, input.UserID, s.includeLegacyPersonal(ctx, input.OrgID)), nil
}

func (s *Service) uploadFolderID(ctx context.Context, userID uint, orgID *uint, folderIDValue string) (*uint, error) {
	if folderIDValue == "" || folderIDValue == "0" {
		return nil, nil
	}
	var folder model.ResourceFolder
	if err := s.db.WithContext(ctx).First(&folder, folderIDValue).Error; err != nil {
		return nil, nil
	}
	if !resourceInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, s.includeLegacyPersonal(ctx, orgID)) {
		return nil, ErrForbidden
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

func resourceInOrgScope(resourceOrgID, currentOrgID *uint, ownerID uint, userID uint, includeLegacy bool) bool {
	return domainresource.InOrgScope(resourceOrgID, currentOrgID, ownerID, userID, includeLegacy)
}

func applyListFilters(q *gorm.DB, input ListInput) *gorm.DB {
	filters := domainresource.ParseListFilters(input.Type, input.Query)
	if len(filters.Types) == 1 {
		q = q.Where("type = ?", filters.Types[0])
	} else if len(filters.Types) > 1 {
		q = q.Where("type IN ?", filters.Types)
	}
	if filters.Keyword != "" {
		q = q.Where("LOWER(name) LIKE ?", "%"+filters.Keyword+"%")
	}
	return q
}

type cachedListResult struct {
	Resources []model.RawResource `json:"resources"`
	Page      *Page               `json:"page,omitempty"`
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

func GenerateStorageKey(resourceID uint, filename string) string {
	return domainresource.GenerateStorageKey(resourceID, filename)
}
