package resource

import (
	"context"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type StorageStat struct {
	UserID         uint   `json:"user_id"`
	StorageBackend string `json:"storage_backend"`
	Count          int64  `json:"count"`
	TotalSize      int64  `json:"total_size"`
	Username       string `json:"username"`
}

type ResourceListFilter struct {
	Query          string
	Type           string
	StorageBackend string
	UserID         string
	OrgID          string
	Page           int
	PageSize       int
}

type ResourcePage struct {
	Items    []domainresource.RawResource `json:"items"`
	Total    int64                        `json:"total"`
	Page     int                          `json:"page"`
	PageSize int                          `json:"page_size"`
}

type ResourceDetail struct {
	Resource     domainresource.RawResource `json:"resource"`
	BindingCount int64                      `json:"binding_count"`
	Bindings     []domainbinding.Binding    `json:"bindings"`
}

func (s *Service) StorageStats(ctx context.Context) ([]StorageStat, error) {
	return s.repo.StorageStats(ctx)
}

func (s *Service) ListResources(ctx context.Context, filter ResourceListFilter) (ResourcePage, error) {
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 50
	}
	if filter.PageSize > 200 {
		filter.PageSize = 200
	}
	return s.repo.ListResources(ctx, filter)
}

func (s *Service) ResourceDetail(ctx context.Context, id uint) (ResourceDetail, error) {
	return s.repo.ResourceDetail(ctx, id)
}

func (s *Service) DeleteResource(ctx context.Context, id uint, store storage.Storage) (domainresource.RawResource, error) {
	resource, err := s.repo.GetResource(ctx, id)
	if err != nil {
		return resource, err
	}
	if resource.StorageKey != "" && store != nil {
		_ = store.Delete(ctx, resource.StorageKey)
	}
	if err := s.repo.DeleteResourceAndBindings(ctx, resource); err != nil {
		return resource, err
	}
	return resource, nil
}
