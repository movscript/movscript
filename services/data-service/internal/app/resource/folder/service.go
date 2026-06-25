package folder

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resource/folder"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("resource folder not found")
	ErrForbidden = errors.New("resource folder forbidden")
	ErrConflict  = errors.New("resource folder conflict")
)

type Service struct {
	repo  repository
	cache cache.Cache
}

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	return NewServiceWithIdentity(db, nil, cacheStore...)
}

func NewServiceWithIdentity(db *gorm.DB, identity authidentity.OrgDirectory, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db, identity: identity}, cache: c}
}

type CreateInput struct {
	OrgID          *uint
	Name           string
	ParentID       *uint
	StorageBackend string
}

type UpdateInput struct {
	Name           string
	StorageBackend string
}

func (s *Service) List(ctx context.Context, userID uint, orgID *uint) ([]domainresourcefolder.Folder, error) {
	return s.repo.ListFolders(ctx, userID, orgID, s.repo.IncludeLegacyPersonal(ctx, orgID))
}

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (domainresourcefolder.Folder, error) {
	folder, err := s.repo.CreateFolder(ctx, ownerID, input, s.repo.IncludeLegacyPersonal(ctx, input.OrgID))
	if err != nil {
		return folder, err
	}
	s.bumpResourceListVersion(ctx, ownerID, input.OrgID)
	return folder, nil
}

func (s *Service) Update(ctx context.Context, userID uint, orgID *uint, id uint, input UpdateInput) (domainresourcefolder.Folder, error) {
	spec := domainresourcefolder.NewFolderUpdateSpec(input.Name, input.StorageBackend)
	folder, err := s.repo.UpdateFolder(ctx, userID, orgID, id, spec, s.repo.IncludeLegacyPersonal(ctx, orgID))
	if err != nil {
		return folder, err
	}
	s.bumpResourceListVersion(ctx, userID, orgID)
	return folder, nil
}

func (s *Service) Delete(ctx context.Context, userID uint, orgID *uint, id uint) error {
	if err := s.repo.DeleteFolder(ctx, userID, orgID, id, s.repo.IncludeLegacyPersonal(ctx, orgID)); err != nil {
		return err
	}
	s.bumpResourceListVersion(ctx, userID, orgID)
	return nil
}

func (s *Service) bumpResourceListVersion(ctx context.Context, userID uint, orgID *uint) {
	_, _ = s.cache.BumpVersion(ctx, resourceListNamespace(userID, orgID))
}

func resourceListNamespace(userID uint, orgID *uint) string {
	return fmt.Sprintf("resources:user:%d:org:%s", userID, orgIDCachePart(orgID))
}

func orgIDCachePart(orgID *uint) string {
	if orgID == nil {
		return "none"
	}
	return strconv.FormatUint(uint64(*orgID), 10)
}
