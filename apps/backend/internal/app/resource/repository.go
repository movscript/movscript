package resource

import (
	"context"
	"errors"

	resourcebinding "github.com/movscript/movscript/internal/app/resourcebinding"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error)
	CreateResource(ctx context.Context, r *domainresource.RawResource) error
	DeleteResourceRecord(ctx context.Context, r *domainresource.RawResource) error
	UpdateResourceRecord(ctx context.Context, r *domainresource.RawResource, updates map[string]any) error
	ReloadResource(ctx context.Context, r *domainresource.RawResource) error
	GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
	GetOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
	DeleteResourceAndBindings(ctx context.Context, r domainresource.RawResource) error
	UploadFolderID(ctx context.Context, userID uint, orgID *uint, folderIDValue string) (*uint, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error) {
	q, err := r.listQuery(ctx, input)
	if err != nil {
		return nil, nil, err
	}
	q = applyListFilters(q, input)
	if input.Page > 0 || input.PageSize > 0 {
		page := domainresource.NormalizePage(domainresource.PageInput{Page: input.Page, PageSize: input.PageSize})
		var total int64
		if err := q.Session(&gorm.Session{}).Model(&persistencemodel.RawResource{}).Count(&total).Error; err != nil {
			return nil, nil, err
		}
		resources := make([]persistencemodel.RawResource, 0)
		if err := q.Session(&gorm.Session{}).Model(&persistencemodel.RawResource{}).Order("created_at desc").Limit(page.PageSize).Offset(page.Offset).Find(&resources).Error; err != nil {
			return nil, nil, err
		}
		items := rawResourceSliceFromModels(resources)
		return items, &Page{Total: total, Items: items, Page: page.Page, PageSize: page.PageSize}, nil
	}
	resources := make([]persistencemodel.RawResource, 0)
	if err := q.Order("created_at desc").Find(&resources).Error; err != nil {
		return nil, nil, err
	}
	return rawResourceSliceFromModels(resources), nil, nil
}

func (r *gormRepository) CreateResource(ctx context.Context, resource *domainresource.RawResource) error {
	modelResource := resource.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelResource).Error; err != nil {
		return err
	}
	*resource = domainresource.RawResourceFromModel(modelResource)
	return nil
}

func (r *gormRepository) DeleteResourceRecord(ctx context.Context, resource *domainresource.RawResource) error {
	modelResource := resource.ToModel()
	return r.db.WithContext(ctx).Delete(&modelResource).Error
}

func (r *gormRepository) UpdateResourceRecord(ctx context.Context, resource *domainresource.RawResource, updates map[string]any) error {
	modelResource := resource.ToModel()
	if err := r.db.WithContext(ctx).Model(&modelResource).Updates(updates).Error; err != nil {
		return err
	}
	for key, value := range updates {
		applyResourceUpdate(resource, key, value)
	}
	return nil
}

func (r *gormRepository) ReloadResource(ctx context.Context, resource *domainresource.RawResource) error {
	modelResource := resource.ToModel()
	if err := r.db.WithContext(ctx).First(&modelResource, resource.ID).Error; err != nil {
		return err
	}
	*resource = domainresource.RawResourceFromModel(modelResource)
	return nil
}

func (r *gormRepository) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	resource, err := r.getResource(ctx, id)
	if err != nil {
		return resource, err
	}
	if !resourceInOrgScope(resource.OrgID, orgID, resource.OwnerID, userID, r.includeLegacyPersonal(ctx, orgID)) {
		return resource, ErrForbidden
	}
	if resource.OwnerID == userID {
		return resource, nil
	}
	allowed := resource.IsShared
	if !allowed && resource.FolderID != nil {
		var folder persistencemodel.ResourceFolder
		if r.db.WithContext(ctx).First(&folder, *resource.FolderID).Error == nil {
			allowed = folder.IsShared
		}
	}
	if !allowed {
		return resource, ErrForbidden
	}
	return resource, nil
}

func (r *gormRepository) GetOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	resource, err := r.getResource(ctx, id)
	if err != nil {
		return resource, err
	}
	if resource.OwnerID != userID || !resourceInOrgScope(resource.OrgID, orgID, resource.OwnerID, userID, r.includeLegacyPersonal(ctx, orgID)) {
		return resource, ErrForbidden
	}
	return resource, nil
}

func (r *gormRepository) DeleteResourceAndBindings(ctx context.Context, resource domainresource.RawResource) error {
	var bindings []persistencemodel.ResourceBinding
	if err := r.db.WithContext(ctx).Select("id").Where("resource_id = ?", resource.ID).Find(&bindings).Error; err != nil {
		return err
	}
	bindingSvc := resourcebinding.NewService(r.db)
	for i := range bindings {
		if err := bindingSvc.Delete(ctx, bindings[i].ID); err != nil {
			return err
		}
	}
	modelResource := resource.ToModel()
	return r.db.WithContext(ctx).Delete(&modelResource).Error
}

func (r *gormRepository) UploadFolderID(ctx context.Context, userID uint, orgID *uint, folderIDValue string) (*uint, error) {
	if folderIDValue == "" || folderIDValue == "0" {
		return nil, nil
	}
	var folder persistencemodel.ResourceFolder
	if err := r.db.WithContext(ctx).First(&folder, folderIDValue).Error; err != nil {
		return nil, nil
	}
	if !resourceInOrgScope(folder.OrgID, orgID, folder.OwnerID, userID, r.includeLegacyPersonal(ctx, orgID)) {
		return nil, ErrForbidden
	}
	if folder.OwnerID != userID {
		if !folder.IsShared {
			return nil, ErrForbidden
		}
		var perm persistencemodel.ResourceFolderPermission
		if r.db.WithContext(ctx).Where("folder_id = ? AND user_id = ? AND permission = ?", folder.ID, userID, "write").
			First(&perm).Error != nil {
			return nil, ErrForbidden
		}
	}
	fid := folder.ID
	return &fid, nil
}

func (r *gormRepository) listQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	if input.Shared {
		return r.sharedListQuery(ctx, input)
	}
	q := r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Where("owner_id = ?", input.UserID)
	q = applyOrgScope(q, input.OrgID, input.UserID, r.includeLegacyPersonal(ctx, input.OrgID))
	switch input.FolderID {
	case "", "all":
	case "root", "0":
		q = q.Where("folder_id IS NULL")
	default:
		q = q.Where("folder_id = ?", input.FolderID)
	}
	return q, nil
}

func (r *gormRepository) sharedListQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	if input.FolderID != "" {
		var folder persistencemodel.ResourceFolder
		if err := r.db.WithContext(ctx).First(&folder, input.FolderID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrFolderNotFound
			}
			return nil, err
		}
		if !resourceInOrgScope(folder.OrgID, input.OrgID, folder.OwnerID, input.UserID, r.includeLegacyPersonal(ctx, input.OrgID)) {
			return nil, ErrForbidden
		}
		if folder.OwnerID != input.UserID && !folder.IsShared {
			return nil, ErrForbidden
		}
		return r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Where("folder_id = ?", folder.ID).Preload("Owner"), nil
	}
	q := r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Where("owner_id != ? AND is_shared = true", input.UserID).Preload("Owner")
	return applyOrgScope(q, input.OrgID, input.UserID, r.includeLegacyPersonal(ctx, input.OrgID)), nil
}

func (r *gormRepository) getResource(ctx context.Context, id uint) (domainresource.RawResource, error) {
	var resource persistencemodel.RawResource
	if err := r.db.WithContext(ctx).First(&resource, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainresource.RawResource{}, ErrNotFound
		}
		return domainresource.RawResource{}, err
	}
	return domainresource.RawResourceFromModel(resource), nil
}

func (r *gormRepository) includeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org persistencemodel.Organization
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

func rawResourceSliceFromModels(items []persistencemodel.RawResource) []domainresource.RawResource {
	resources := make([]domainresource.RawResource, 0, len(items))
	for _, item := range items {
		resources = append(resources, domainresource.RawResourceFromModel(item))
	}
	return resources
}

func applyResourceUpdate(resource *domainresource.RawResource, key string, value any) {
	switch key {
	case "file_path":
		if v, ok := value.(string); ok {
			resource.FilePath = v
		}
	case "storage_key":
		if v, ok := value.(string); ok {
			resource.StorageKey = v
		}
	case "storage_backend":
		if v, ok := value.(string); ok {
			resource.StorageBackend = v
		}
	case "type":
		if v, ok := value.(string); ok {
			resource.Type = v
		}
	case "name":
		if v, ok := value.(string); ok {
			resource.Name = v
		}
	case "mime_type":
		if v, ok := value.(string); ok {
			resource.MimeType = v
		}
	case "size":
		switch v := value.(type) {
		case int64:
			resource.Size = v
		case int:
			resource.Size = int64(v)
		}
	case "is_shared":
		if v, ok := value.(bool); ok {
			resource.IsShared = v
		}
	case "folder_id":
		switch v := value.(type) {
		case uint:
			resource.FolderID = &v
		case *uint:
			resource.FolderID = v
		case nil:
			resource.FolderID = nil
		}
	}
}
