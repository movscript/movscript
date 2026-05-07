package project

import (
	"context"
	"errors"
	"fmt"
	"time"

	domainproject "github.com/movscript/movscript/internal/domain/project"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

var (
	ErrProjectNotFound       = errors.New("project not found")
	ErrOwnerNotFound         = errors.New("owner user not found")
	ErrProjectMemberNotFound = errors.New("project member not found")
)

type Service struct {
	repo  repository
	cache cache.Cache
}

const progressCacheTTL = 2 * time.Minute

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db}, cache: c}
}

type CreateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type UpdateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type MemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type Progress struct {
	Scripts         int64
	Segments        int64
	AssetSlots      int64
	Members         int64
	StoryboardLines int64
	ContentUnits    map[string]int64
	Keyframes       map[string]int64
}

func (s *Service) List(ctx context.Context, orgID *uint) ([]domainproject.Project, error) {
	return s.repo.List(ctx, orgID)
}

func (s *Service) AdminList(ctx context.Context) ([]domainproject.Project, error) {
	return s.repo.AdminList(ctx)
}

func (s *Service) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error) {
	return s.repo.ForceSetOwner(ctx, projectID, ownerID)
}

func (s *Service) Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error) {
	project, err := s.repo.Create(ctx, input, ownerID, orgID)
	if err == nil {
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) Get(ctx context.Context, id uint, orgID *uint) (domainproject.Project, error) {
	return s.repo.Get(ctx, id, orgID)
}

func (s *Service) BelongsToOrg(ctx context.Context, projectID uint, orgID uint) (bool, error) {
	return s.repo.BelongsToOrg(ctx, projectID, orgID)
}

func (s *Service) ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (domainproject.Role, error) {
	return s.repo.ResolveRole(ctx, projectID, userID, systemRole)
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (domainproject.Project, error) {
	project, err := s.repo.Update(ctx, id, input, orgID)
	if err == nil {
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) Delete(ctx context.Context, id uint, orgID *uint) error {
	err := s.repo.Delete(ctx, id, orgID)
	if err == nil {
		s.bumpProgressVersion(ctx, id)
	}
	return err
}

func (s *Service) AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (domainproject.Member, error) {
	member, err := s.repo.AddMember(ctx, projectID, input, orgID)
	if err != nil {
		return member, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return member, nil
}

func (s *Service) RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error {
	err := s.repo.RemoveMember(ctx, projectID, memberID, orgID)
	if err == nil {
		s.bumpProgressVersion(ctx, projectID)
	}
	return err
}

func (s *Service) ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]domainproject.Member, error) {
	return s.repo.ListMembers(ctx, projectID, orgID)
}

func (s *Service) Progress(ctx context.Context, projectID uint, orgID *uint) (Progress, error) {
	var progress Progress
	version, _ := s.cache.GetVersion(ctx, progressCacheNamespace(projectID))
	cacheKey := fmt.Sprintf("project:%d:progress:v%d", projectID, version)
	if ok, err := s.cache.GetJSON(ctx, cacheKey, &progress); err == nil && ok {
		return progress, nil
	}
	progress, err := s.repo.Progress(ctx, projectID, orgID)
	if err != nil {
		return progress, err
	}
	_ = s.cache.SetJSON(ctx, cacheKey, progress, progressCacheTTL)
	return progress, nil
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, progressCacheNamespace(projectID))
}

func progressCacheNamespace(projectID uint) string {
	return fmt.Sprintf("project:%d:progress", projectID)
}
