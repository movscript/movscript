package resource

import (
	"context"

	appresource "github.com/movscript/movscript/internal/app/resource"
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

type BlobGCInput struct {
	Limit  int
	DryRun bool
}

type BlobGCResult struct {
	Backend    string `json:"backend"`
	DryRun     bool   `json:"dry_run"`
	Candidates int    `json:"candidates"`
	Deleted    int    `json:"deleted"`
	FreedBytes int64  `json:"freed_bytes"`
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

func (s *Service) DeleteResource(ctx context.Context, id uint) (domainresource.RawResource, error) {
	var resource domainresource.RawResource
	if err := s.repo.Transaction(ctx, func(repo repository) error {
		var err error
		resource, err = repo.GetResource(ctx, id)
		if err != nil {
			return err
		}
		refs, err := repo.ResourceReferenceCount(ctx, resource.ID)
		if err != nil {
			return err
		}
		if refs > 0 {
			return appresource.ErrResourceInUse
		}
		if err := repo.DeleteResourceRecord(ctx, &resource); err != nil {
			return err
		}
		if resource.BlobID != nil {
			return repo.DecrementBlobRef(ctx, *resource.BlobID)
		}
		return nil
	}); err != nil {
		return resource, err
	}
	return resource, nil
}

func (s *Service) CollectUnusedBlobs(ctx context.Context, store storage.Storage, input BlobGCInput) (BlobGCResult, error) {
	result := BlobGCResult{DryRun: input.DryRun}
	if store == nil {
		return result, nil
	}
	result.Backend = store.Backend()
	limit := normalizeBlobGCLimit(input.Limit)
	blobs, err := s.repo.ListUnusedBlobs(ctx, result.Backend, limit)
	if err != nil {
		return result, err
	}
	result.Candidates = len(blobs)
	for _, blob := range blobs {
		result.FreedBytes += blob.Size
		if input.DryRun {
			continue
		}
		if err := store.Delete(ctx, blob.StorageKey); err != nil {
			return result, err
		}
		if err := s.repo.DeleteBlobRecord(ctx, blob.ID); err != nil {
			return result, err
		}
		result.Deleted++
	}
	return result, nil
}

func normalizeBlobGCLimit(limit int) int {
	if limit <= 0 {
		return 100
	}
	if limit > 1000 {
		return 1000
	}
	return limit
}
