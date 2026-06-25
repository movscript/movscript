package resource

import (
	"context"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	appresource "github.com/movscript/movscript/internal/app/resource"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type Service struct {
	repo     repository
	identity authidentity.Reader
}

func NewService(db *gorm.DB, identity ...authidentity.Reader) *Service {
	service := &Service{repo: &gormRepository{db: db}}
	if len(identity) > 0 {
		service.identity = identity[0]
	}
	return service
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
	stats, err := s.repo.StorageStats(ctx)
	if err != nil {
		return nil, err
	}
	s.enrichStorageStats(ctx, stats)
	return stats, nil
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
	page, err := s.repo.ListResources(ctx, filter)
	if err != nil {
		return ResourcePage{}, err
	}
	s.enrichResources(ctx, page.Items)
	return page, nil
}

func (s *Service) GetResource(ctx context.Context, id uint) (domainresource.RawResource, error) {
	resource, err := s.repo.GetResource(ctx, id)
	if err != nil {
		return domainresource.RawResource{}, err
	}
	s.enrichResource(ctx, &resource)
	return resource, nil
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

func (s *Service) enrichStorageStats(ctx context.Context, stats []StorageStat) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0, len(stats))
	seen := make(map[uint]struct{})
	for _, stat := range stats {
		if stat.UserID == 0 || stat.Username != "" {
			continue
		}
		if _, ok := seen[stat.UserID]; ok {
			continue
		}
		seen[stat.UserID] = struct{}{}
		userIDs = append(userIDs, stat.UserID)
	}
	users := s.userRefs(ctx, userIDs)
	for i := range stats {
		if ref, ok := users[stats[i].UserID]; ok && stats[i].Username == "" {
			stats[i].Username = ref.Username
		}
	}
}

func (s *Service) enrichResources(ctx context.Context, rows []domainresource.RawResource) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0, len(rows))
	seen := make(map[uint]struct{})
	for _, row := range rows {
		if row.OwnerID == 0 || row.Owner != nil {
			continue
		}
		if _, ok := seen[row.OwnerID]; ok {
			continue
		}
		seen[row.OwnerID] = struct{}{}
		userIDs = append(userIDs, row.OwnerID)
	}
	users := s.userRefs(ctx, userIDs)
	for i := range rows {
		if rows[i].Owner == nil {
			if ref, ok := users[rows[i].OwnerID]; ok {
				rows[i].Owner = &ref
			}
		}
	}
}

func (s *Service) enrichResource(ctx context.Context, row *domainresource.RawResource) {
	if row == nil || row.Owner != nil || row.OwnerID == 0 || s.identity == nil {
		return
	}
	profile, err := s.identity.UserProfile(ctx, row.OwnerID)
	if err != nil {
		return
	}
	ref := resourceUserRefFromProfile(profile)
	row.Owner = &ref
}

func (s *Service) userRefs(ctx context.Context, userIDs []uint) map[uint]domainresource.UserRef {
	out := make(map[uint]domainresource.UserRef, len(userIDs))
	for _, userID := range userIDs {
		profile, err := s.identity.UserProfile(ctx, userID)
		if err != nil {
			continue
		}
		out[userID] = resourceUserRefFromProfile(profile)
	}
	return out
}

func resourceUserRefFromProfile(profile domainidentity.UserProfile) domainresource.UserRef {
	return domainresource.UserRef{
		ID:           profile.ID,
		Username:     profile.Username,
		SystemRole:   profile.SystemRole,
		PrimaryEmail: profile.PrimaryEmail,
		DisplayName:  profile.DisplayName,
		AvatarURL:    profile.AvatarURL,
		Status:       profile.Status,
	}
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
