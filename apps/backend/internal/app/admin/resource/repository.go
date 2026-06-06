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
	StorageStats(ctx context.Context) ([]StorageStat, error)
	ListResources(ctx context.Context, filter ResourceListFilter) (ResourcePage, error)
	GetResource(ctx context.Context, id uint) (domainresource.RawResource, error)
	ResourceReferenceCount(ctx context.Context, resourceID uint) (int64, error)
	DeleteResourceRecord(ctx context.Context, resource *domainresource.RawResource) error
	DecrementBlobRef(ctx context.Context, blobID uint) error
	ListUnusedBlobs(ctx context.Context, backend string, limit int) ([]ResourceBlob, error)
	DeleteBlobRecord(ctx context.Context, blobID uint) error
}

type gormRepository struct {
	db *gorm.DB
}

type ResourceBlob struct {
	ID             uint
	StorageBackend string
	StorageKey     string
	Size           int64
}

func (s *gormRepository) Transaction(ctx context.Context, fn func(repository) error) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&gormRepository{db: tx})
	})
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

func (s *gormRepository) ResourceReferenceCount(ctx context.Context, resourceID uint) (int64, error) {
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
		if !s.db.Migrator().HasTable(check.model) {
			continue
		}
		var count int64
		if err := s.db.WithContext(ctx).Model(check.model).Where(check.where, check.args...).Count(&count).Error; err != nil {
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

func (s *gormRepository) DeleteResourceRecord(ctx context.Context, resource *domainresource.RawResource) error {
	modelResource := resource.ToModel()
	return s.db.WithContext(ctx).Delete(&modelResource).Error
}

func (s *gormRepository) DecrementBlobRef(ctx context.Context, blobID uint) error {
	if blobID == 0 {
		return nil
	}
	return s.db.WithContext(ctx).
		Model(&persistencemodel.ResourceBlob{}).
		Where("id = ? AND ref_count > 0", blobID).
		UpdateColumn("ref_count", gorm.Expr("ref_count - ?", 1)).Error
}

func (s *gormRepository) ListUnusedBlobs(ctx context.Context, backend string, limit int) ([]ResourceBlob, error) {
	rows := make([]persistencemodel.ResourceBlob, 0)
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.ResourceBlob{}).
		Where("storage_backend = ? AND ref_count <= 0", backend).
		Where("NOT EXISTS (SELECT 1 FROM raw_resources WHERE raw_resources.blob_id = resource_blobs.id AND raw_resources.deleted_at IS NULL)").
		Order("id ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	blobs := make([]ResourceBlob, 0, len(rows))
	for _, row := range rows {
		blobs = append(blobs, ResourceBlob{
			ID:             row.ID,
			StorageBackend: row.StorageBackend,
			StorageKey:     row.StorageKey,
			Size:           row.Size,
		})
	}
	return blobs, nil
}

func (s *gormRepository) DeleteBlobRecord(ctx context.Context, blobID uint) error {
	return s.db.WithContext(ctx).Unscoped().Delete(&persistencemodel.ResourceBlob{}, blobID).Error
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
