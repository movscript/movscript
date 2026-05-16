package project

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	domainproject "github.com/movscript/movscript/internal/domain/project"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

var (
	ErrProjectNotFound          = errors.New("project not found")
	ErrProjectOrgNotFound       = errors.New("project organization not found")
	ErrProjectOrgInactive       = errors.New("project organization inactive")
	ErrOwnerNotFound            = errors.New("owner user not found")
	ErrOwnerInactive            = errors.New("owner user inactive")
	ErrMemberUserNotFound       = errors.New("member user not found")
	ErrMemberUserInactive       = errors.New("member user inactive")
	ErrProjectMemberNotFound    = errors.New("project member not found")
	ErrInvalidProjectMemberRole = errors.New("invalid project member role")
	ErrInvalidProjectName       = errors.New("invalid project name")
	ErrInvalidProjectStatus     = errors.New("invalid project status")
	ErrNoProjectFieldsToUpdate  = errors.New("no project fields to update")
	ErrProjectOwnerMemberLocked = errors.New("project owner member is locked")
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
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type AdminCreateInput struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	OwnerID       uint   `json:"owner_id"`
	OrgID         *uint  `json:"org_id"`
	Status        string `json:"status"`
	TotalEpisodes int    `json:"total_episodes"`
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type UpdateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type AdminUpdateInput struct {
	Name   *string `json:"name"`
	Status *string `json:"status"`
}

type AdminDetail struct {
	Project          domainproject.Project `json:"project"`
	MemberCount      int64                 `json:"member_count"`
	ScriptCount      int64                 `json:"script_count"`
	ContentUnitCount int64                 `json:"content_unit_count"`
	AssetSlotCount   int64                 `json:"asset_slot_count"`
	ResourceCount    int64                 `json:"resource_count"`
	Usage            UsageSummary          `json:"usage"`
	Audit            AuditSummary          `json:"audit"`
}

type UsageSummary struct {
	Calls        int64   `json:"calls"`
	Cost         float64 `json:"cost"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	Images       int64   `json:"images"`
	DurationSec  int64   `json:"duration_sec"`
}

type AuditSummary struct {
	Records    int64      `json:"records"`
	LastAction string     `json:"last_action,omitempty"`
	LastAt     *time.Time `json:"last_at,omitempty"`
}

type adminUpdateSpec struct {
	Name   *string
	Status *string
}

type MemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type Progress struct {
	Scripts      int64
	Segments     int64
	AssetSlots   int64
	Members      int64
	ContentUnits map[string]int64
	Keyframes    map[string]int64
}

type AdminListFilter struct {
	Query     string
	ProjectID *uint
	Status    string
	OwnerID   *uint
	OrgID     *uint
	Page      int
	PageSize  int
}

type ProjectPage struct {
	Items []domainproject.Project
	Total int64
}

func (s *Service) List(ctx context.Context, orgID *uint) ([]domainproject.Project, error) {
	return s.repo.List(ctx, orgID)
}

func (s *Service) AdminList(ctx context.Context, filter AdminListFilter) (ProjectPage, error) {
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 50
	}
	if filter.PageSize > 200 {
		filter.PageSize = 200
	}
	return s.repo.AdminList(ctx, filter)
}

func (s *Service) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error) {
	project, err := s.repo.ForceSetOwner(ctx, projectID, ownerID)
	if err == nil {
		s.bumpProgressVersion(ctx, projectID)
	}
	return project, err
}

func (s *Service) AdminCreate(ctx context.Context, input AdminCreateInput) (domainproject.Project, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return domainproject.Project{}, ErrInvalidProjectName
	}
	if input.OwnerID == 0 {
		return domainproject.Project{}, ErrOwnerNotFound
	}
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	if input.Status == "" {
		input.Status = domainproject.StatusPlanning
	}
	if !domainproject.ValidStatus(input.Status) {
		return domainproject.Project{}, ErrInvalidProjectStatus
	}
	project, err := s.repo.AdminCreate(ctx, input)
	if err == nil {
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
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

func (s *Service) AdminDetail(ctx context.Context, id uint) (AdminDetail, error) {
	if id == 0 {
		return AdminDetail{}, ErrProjectNotFound
	}
	return s.repo.AdminDetail(ctx, id)
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

func (s *Service) AdminUpdate(ctx context.Context, id uint, input AdminUpdateInput) (domainproject.Project, error) {
	if id == 0 {
		return domainproject.Project{}, ErrProjectNotFound
	}
	spec := adminUpdateSpec{}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return domainproject.Project{}, ErrInvalidProjectName
		}
		spec.Name = &name
	}
	if input.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*input.Status))
		if !domainproject.ValidStatus(status) {
			return domainproject.Project{}, ErrInvalidProjectStatus
		}
		spec.Status = &status
	}
	if spec.Name == nil && spec.Status == nil {
		return domainproject.Project{}, ErrNoProjectFieldsToUpdate
	}
	project, err := s.repo.AdminUpdate(ctx, id, spec)
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
	input.Role = normalizeMemberRole(input.Role)
	if input.Role == "" {
		input.Role = domainproject.RoleViewer
	}
	if !validEditableMemberRole(input.Role) {
		return domainproject.Member{}, ErrInvalidProjectMemberRole
	}
	member, err := s.repo.AddMember(ctx, projectID, input, orgID)
	if err != nil {
		return member, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return member, nil
}

func (s *Service) UpdateMemberRole(ctx context.Context, projectID uint, memberID uint, role string, orgID *uint) (domainproject.Member, error) {
	role = normalizeMemberRole(role)
	if !validEditableMemberRole(role) {
		return domainproject.Member{}, ErrInvalidProjectMemberRole
	}
	member, err := s.repo.UpdateMemberRole(ctx, projectID, memberID, role, orgID)
	if err == nil {
		s.bumpProgressVersion(ctx, projectID)
	}
	return member, err
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

func normalizeMemberRole(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validEditableMemberRole(value string) bool {
	switch value {
	case domainproject.RoleDirector, "writer", "generator", domainproject.RoleViewer:
		return true
	default:
		return false
	}
}
