package resourceadmin

import (
	"context"
	"errors"
	"strings"

	resourcebinding "github.com/movscript/movscript/internal/app/resourcebinding"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	domainbinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	StorageStats(ctx context.Context) ([]StorageStat, error)
	ListResources(ctx context.Context, filter ResourceListFilter) (ResourcePage, error)
	ResourceDetail(ctx context.Context, id uint) (ResourceDetail, error)
	GetResource(ctx context.Context, id uint) (domainresource.RawResource, error)
	DeleteResourceAndBindings(ctx context.Context, resource domainresource.RawResource) error
}

type gormRepository struct {
	db *gorm.DB
}

func (s *gormRepository) StorageStats(ctx context.Context) ([]StorageStat, error) {
	type row struct {
		UserID         uint
		StorageBackend string
		Count          int64
		TotalSize      int64
	}
	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).
		Select("owner_id as user_id, storage_backend, count(*) as count, sum(size) as total_size").
		Group("owner_id, storage_backend").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	userIDs := make(map[uint]bool)
	for _, r := range rows {
		userIDs[r.UserID] = true
	}
	userMap, err := s.usernames(ctx, userIDs)
	if err != nil {
		return nil, err
	}

	result := make([]StorageStat, 0, len(rows))
	for _, r := range rows {
		result = append(result, StorageStat{
			UserID:         r.UserID,
			StorageBackend: r.StorageBackend,
			Count:          r.Count,
			TotalSize:      r.TotalSize,
			Username:       userMap[r.UserID],
		})
	}
	return result, nil
}

func (s *gormRepository) ListResources(ctx context.Context, filter ResourceListFilter) (ResourcePage, error) {
	q := s.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).Preload("Owner")
	if filter.Query = strings.TrimSpace(filter.Query); filter.Query != "" {
		like := "%" + filter.Query + "%"
		if s.db.Dialector.Name() == "postgres" {
			q = q.Where("name ILIKE ? OR mime_type ILIKE ? OR storage_key ILIKE ?", like, like, like)
		} else {
			q = q.Where("LOWER(name) LIKE LOWER(?) OR LOWER(mime_type) LIKE LOWER(?) OR LOWER(storage_key) LIKE LOWER(?)", like, like, like)
		}
	}
	if value := strings.TrimSpace(filter.Type); value != "" {
		q = q.Where("type = ?", value)
	}
	if value := strings.TrimSpace(filter.StorageBackend); value != "" {
		q = q.Where("storage_backend = ?", value)
	}
	if value := strings.TrimSpace(filter.UserID); value != "" {
		q = q.Where("owner_id = ?", value)
	}
	if value := strings.TrimSpace(filter.OrgID); value != "" {
		if value == "null" || value == "none" {
			q = q.Where("org_id IS NULL")
		} else {
			q = q.Where("org_id = ?", value)
		}
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return ResourcePage{}, err
	}
	resources := make([]persistencemodel.RawResource, 0)
	offset := (filter.Page - 1) * filter.PageSize
	if err := q.Order("id desc").Limit(filter.PageSize).Offset(offset).Find(&resources).Error; err != nil {
		return ResourcePage{}, err
	}
	items := make([]domainresource.RawResource, 0, len(resources))
	for _, resource := range resources {
		items = append(items, domainresource.RawResourceFromModel(resource))
	}
	return ResourcePage{Items: items, Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (s *gormRepository) ResourceDetail(ctx context.Context, id uint) (ResourceDetail, error) {
	resource, err := s.GetResource(ctx, id)
	if err != nil {
		return ResourceDetail{}, err
	}

	var bindingCount int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ResourceBinding{}).Where("resource_id = ?", id).Count(&bindingCount).Error; err != nil {
		return ResourceDetail{}, err
	}

	bindingRows := make([]persistencemodel.ResourceBinding, 0)
	if err := s.db.WithContext(ctx).
		Where("resource_id = ?", id).
		Order("id desc").
		Limit(100).
		Find(&bindingRows).Error; err != nil {
		return ResourceDetail{}, err
	}
	bindings := make([]domainbinding.Binding, 0, len(bindingRows))
	for _, row := range bindingRows {
		bindings = append(bindings, domainbinding.BindingFromModel(row))
	}
	return ResourceDetail{Resource: resource, BindingCount: bindingCount, Bindings: bindings}, nil
}

func (s *gormRepository) GetResource(ctx context.Context, id uint) (domainresource.RawResource, error) {
	var resource persistencemodel.RawResource
	if err := s.db.WithContext(ctx).Preload("Owner").First(&resource, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainresource.RawResource{}, gorm.ErrRecordNotFound
		}
		return domainresource.RawResource{}, err
	}
	return domainresource.RawResourceFromModel(resource), nil
}

func (s *gormRepository) DeleteResourceAndBindings(ctx context.Context, resource domainresource.RawResource) error {
	var bindings []persistencemodel.ResourceBinding
	if err := s.db.WithContext(ctx).Select("id").Where("resource_id = ?", resource.ID).Find(&bindings).Error; err != nil {
		return err
	}
	bindingSvc := resourcebinding.NewService(s.db)
	for i := range bindings {
		if err := bindingSvc.Delete(ctx, bindings[i].ID); err != nil {
			return err
		}
	}
	modelResource := resource.ToModel()
	return s.db.WithContext(ctx).Delete(&modelResource).Error
}

func (s *gormRepository) usernames(ctx context.Context, ids map[uint]bool) (map[uint]string, error) {
	userMap := map[uint]string{}
	if len(ids) == 0 {
		return userMap, nil
	}
	values := make([]uint, 0, len(ids))
	for id := range ids {
		values = append(values, id)
	}
	users := make([]persistencemodel.User, 0)
	if err := s.db.WithContext(ctx).Where("id IN ?", values).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, u := range users {
		userMap[u.ID] = u.Username
	}
	return userMap, nil
}
