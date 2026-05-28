package resource

import (
	"context"
	"errors"

	resourcebinding "github.com/movscript/movscript/internal/app/resource/binding"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error)
	CreateResource(ctx context.Context, r *domainresource.RawResource) error
	DeleteResourceRecord(ctx context.Context, r *domainresource.RawResource) error
	UpdateResourceRecord(ctx context.Context, r *domainresource.RawResource, spec domainresource.UpdateSpec) error
	ReloadResource(ctx context.Context, r *domainresource.RawResource) error
	AdoptOwnedPersonalResourceToOrg(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
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

func (r *gormRepository) UpdateResourceRecord(ctx context.Context, resource *domainresource.RawResource, spec domainresource.UpdateSpec) error {
	modelResource := resource.ToModel()
	updates := resourceUpdateColumns(spec)
	if len(updates) == 0 {
		return nil
	}
	if err := r.db.WithContext(ctx).Model(&modelResource).Updates(updates).Error; err != nil {
		return err
	}
	resource.ApplyUpdate(spec)
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

func (r *gormRepository) AdoptOwnedPersonalResourceToOrg(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	if orgID == nil {
		return domainresource.RawResource{}, ErrForbidden
	}
	resource, err := r.GetOwned(ctx, id, userID, nil)
	if err != nil {
		return resource, err
	}
	if resource.OrgID != nil {
		if *resource.OrgID == *orgID {
			return resource, nil
		}
		return resource, ErrForbidden
	}
	if err := r.UpdateResourceRecord(ctx, &resource, domainresource.UpdateSpec{OrgID: orgID}); err != nil {
		return resource, err
	}
	if err := r.ReloadResource(ctx, &resource); err != nil {
		return resource, err
	}
	return resource, nil
}

func (r *gormRepository) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	resource, err := r.getResource(ctx, id)
	if err != nil {
		return resource, err
	}
	includeLegacy := r.includeLegacyPersonal(ctx, orgID)
	if !resourceInOrgScope(resource.OrgID, orgID, resource.OwnerID, userID, includeLegacy) {
		if r.resourceBoundToVisibleProject(ctx, resource.ID, userID, orgID, includeLegacy) {
			return resource, nil
		}
		return resource, ErrForbidden
	}
	if resource.OwnerID == userID || resourceInCurrentTeam(resource.OrgID, orgID) {
		return resource, nil
	}
	if !r.resourceBoundToVisibleProject(ctx, resource.ID, userID, orgID, includeLegacy) {
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
	if folder.OwnerID != userID && !resourceInCurrentTeam(folder.OrgID, orgID) {
		return nil, ErrForbidden
	}
	fid := folder.ID
	return &fid, nil
}

func (r *gormRepository) listQuery(ctx context.Context, input ListInput) (*gorm.DB, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.RawResource{})
	switch input.Scope {
	case "personal":
		q = q.Where("owner_id = ? AND org_id IS NULL", input.UserID)
	case "team":
		if input.OrgID == nil {
			q = q.Where("1 = 0")
		} else {
			q = q.Where("org_id = ?", *input.OrgID)
		}
	default:
		if input.OrgID != nil {
			q = q.Where("(org_id = ? OR (org_id IS NULL AND owner_id = ?))", *input.OrgID, input.UserID)
		} else {
			q = q.Where("owner_id = ?", input.UserID)
			q = applyOrgScope(q, input.OrgID, input.UserID, r.includeLegacyPersonal(ctx, input.OrgID))
		}
	}
	switch input.FolderID {
	case "", "all":
	case "root", "0":
		q = q.Where("folder_id IS NULL")
	default:
		q = q.Where("folder_id = ?", input.FolderID)
	}
	return q, nil
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

func resourceInCurrentTeam(resourceOrgID, currentOrgID *uint) bool {
	return resourceOrgID != nil && currentOrgID != nil && *resourceOrgID == *currentOrgID
}

func (r *gormRepository) resourceBoundToVisibleProject(ctx context.Context, resourceID uint, userID uint, orgID *uint, includeLegacy bool) bool {
	query := r.db.WithContext(ctx).
		Table("resource_bindings AS rb").
		Joins("JOIN projects AS p ON p.id = rb.project_id").
		Where("rb.resource_id = ? AND rb.deleted_at IS NULL AND p.deleted_at IS NULL", resourceID)
	if orgID != nil {
		if includeLegacy {
			query = query.Where("(p.org_id = ? OR (p.org_id IS NULL AND p.owner_id = ?))", *orgID, userID)
		} else {
			query = query.Where("p.org_id = ?", *orgID)
		}
	} else {
		query = query.
			Joins("LEFT JOIN project_members AS pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.deleted_at IS NULL", userID).
			Where("p.org_id IS NULL AND (p.owner_id = ? OR pm.id IS NOT NULL)", userID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false
	}
	return count > 0
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

func resourceUpdateColumns(spec domainresource.UpdateSpec) map[string]any {
	updates := map[string]any{}
	if spec.FilePath != nil {
		updates["file_path"] = *spec.FilePath
	}
	if spec.StorageKey != nil {
		updates["storage_key"] = *spec.StorageKey
	}
	if spec.StorageBackend != nil {
		updates["storage_backend"] = *spec.StorageBackend
	}
	if spec.Type != nil {
		updates["type"] = *spec.Type
	}
	if spec.Name != nil {
		updates["name"] = *spec.Name
	}
	if spec.MimeType != nil {
		updates["mime_type"] = *spec.MimeType
	}
	if spec.Size != nil {
		updates["size"] = *spec.Size
	}
	if spec.OrgID != nil {
		updates["org_id"] = *spec.OrgID
	}
	if spec.ClearFolder {
		updates["folder_id"] = nil
	} else if spec.FolderID != nil {
		updates["folder_id"] = *spec.FolderID
	}
	if spec.VerificationStatus != nil {
		updates["verification_status"] = *spec.VerificationStatus
	}
	if spec.VerificationRef != nil {
		updates["verification_ref"] = *spec.VerificationRef
	}
	if spec.VerifiedAt != nil {
		updates["verified_at"] = *spec.VerifiedAt
	}
	if spec.VerificationProvider != nil {
		updates["verification_provider"] = *spec.VerificationProvider
	}
	if spec.VerificationError != nil {
		updates["verification_error"] = *spec.VerificationError
	}
	return updates
}
