package resource

import (
	"context"
	"errors"
	"fmt"
	"strings"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Transaction(ctx context.Context, fn func(repository) error) error
	List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error)
	CreateResource(ctx context.Context, r *domainresource.RawResource) error
	FindBlobByHash(ctx context.Context, hash string) (resourceBlob, bool, error)
	CreateBlob(ctx context.Context, blob *resourceBlob) error
	IncrementBlobRef(ctx context.Context, blobID uint) error
	DecrementBlobRef(ctx context.Context, blobID uint) error
	DeleteResourceRecord(ctx context.Context, r *domainresource.RawResource) error
	UpdateResourceRecord(ctx context.Context, r *domainresource.RawResource, spec domainresource.UpdateSpec) error
	ReloadResource(ctx context.Context, r *domainresource.RawResource) error
	ResourceNameExists(ctx context.Context, scope resourceNameScope) (bool, error)
	ResourceReferenceCount(ctx context.Context, resourceID uint) (int64, error)
	AdoptOwnedPersonalResourceToOrg(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
	GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
	GetOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error)
	UploadFolderID(ctx context.Context, userID uint, orgID *uint, folderIDValue string) (*uint, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Transaction(ctx context.Context, fn func(repository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&gormRepository{db: tx})
	})
}

type resourceNameScope struct {
	UserID    uint
	OrgID     *uint
	Name      string
	ExcludeID uint
}

type resourceBlob struct {
	ID             uint
	Hash           string
	StorageBackend string
	StorageKey     string
	Size           int64
	MimeType       string
	RefCount       int
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

func (r *gormRepository) FindBlobByHash(ctx context.Context, hash string) (resourceBlob, bool, error) {
	var blob persistencemodel.ResourceBlob
	if err := r.db.WithContext(ctx).Where("hash = ?", strings.TrimSpace(hash)).First(&blob).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return resourceBlob{}, false, nil
		}
		return resourceBlob{}, false, err
	}
	return resourceBlobFromModel(blob), true, nil
}

func (r *gormRepository) CreateBlob(ctx context.Context, blob *resourceBlob) error {
	modelBlob := persistencemodel.ResourceBlob{
		Hash:           blob.Hash,
		StorageBackend: blob.StorageBackend,
		StorageKey:     blob.StorageKey,
		Size:           blob.Size,
		MimeType:       blob.MimeType,
		RefCount:       blob.RefCount,
	}
	if err := r.db.WithContext(ctx).Create(&modelBlob).Error; err != nil {
		return err
	}
	*blob = resourceBlobFromModel(modelBlob)
	return nil
}

func (r *gormRepository) IncrementBlobRef(ctx context.Context, blobID uint) error {
	if blobID == 0 {
		return nil
	}
	return r.db.WithContext(ctx).
		Model(&persistencemodel.ResourceBlob{}).
		Where("id = ?", blobID).
		UpdateColumn("ref_count", gorm.Expr("ref_count + ?", 1)).Error
}

func (r *gormRepository) DecrementBlobRef(ctx context.Context, blobID uint) error {
	if blobID == 0 {
		return nil
	}
	return r.db.WithContext(ctx).
		Model(&persistencemodel.ResourceBlob{}).
		Where("id = ? AND ref_count > 0", blobID).
		UpdateColumn("ref_count", gorm.Expr("ref_count - ?", 1)).Error
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

func (r *gormRepository) ResourceNameExists(ctx context.Context, scope resourceNameScope) (bool, error) {
	name := strings.TrimSpace(scope.Name)
	if name == "" {
		return false, nil
	}
	q := r.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Where("LOWER(name) = LOWER(?)", name)
	if scope.OrgID == nil {
		q = q.Where("owner_id = ? AND org_id IS NULL", scope.UserID)
	} else {
		q = q.Where("org_id = ?", *scope.OrgID)
	}
	if scope.ExcludeID != 0 {
		q = q.Where("id <> ?", scope.ExcludeID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ResourceReferenceCount(ctx context.Context, resourceID uint) (int64, error) {
	checks := []struct {
		model any
		where string
		args  []any
	}{
		{model: &persistencemodel.ShotReference{}, where: "resource_id = ?", args: []any{resourceID}},
		{model: &persistencemodel.ShotReferenceGroup{}, where: "source_resource_id = ?", args: []any{resourceID}},
		{model: &persistencemodel.CanvasTask{}, where: "resource_id = ?", args: []any{resourceID}},
		{model: &persistencemodel.CanvasOutput{}, where: "resource_id = ?", args: []any{resourceID}},
		{model: &persistencemodel.Job{}, where: "input_resource_id = ? OR output_resource_id = ? OR input_resource_ids = ? OR input_resource_ids LIKE ? OR input_resource_ids LIKE ? OR input_resource_ids LIKE ?", args: jobResourceReferenceArgs(resourceID)},
	}
	var total int64
	for _, check := range checks {
		if !r.db.Migrator().HasTable(check.model) {
			continue
		}
		var count int64
		if err := r.db.WithContext(ctx).Model(check.model).Where(check.where, check.args...).Count(&count).Error; err != nil {
			return 0, err
		}
		total += count
	}
	return total, nil
}

func jobResourceReferenceArgs(resourceID uint) []any {
	id := fmt.Sprint(resourceID)
	return []any{
		resourceID,
		resourceID,
		"[" + id + "]",
		"[" + id + ",%",
		"%," + id + ",%",
		"%," + id + "]",
	}
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
	exists, err := r.ResourceNameExists(ctx, resourceNameScope{UserID: userID, OrgID: orgID, Name: resource.Name, ExcludeID: resource.ID})
	if err != nil {
		return resource, err
	}
	if exists {
		return resource, ErrDuplicateName
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
		return resource, ErrForbidden
	}
	if resource.OwnerID == userID || resourceInCurrentTeam(resource.OrgID, orgID) {
		return resource, nil
	}
	return resource, ErrForbidden
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

func resourceBlobFromModel(blob persistencemodel.ResourceBlob) resourceBlob {
	return resourceBlob{
		ID:             blob.ID,
		Hash:           blob.Hash,
		StorageBackend: blob.StorageBackend,
		StorageKey:     blob.StorageKey,
		Size:           blob.Size,
		MimeType:       blob.MimeType,
		RefCount:       blob.RefCount,
	}
}

func resourceUpdateColumns(spec domainresource.UpdateSpec) map[string]any {
	updates := map[string]any{}
	if spec.Name != nil {
		updates["name"] = *spec.Name
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
