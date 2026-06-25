package project

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
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
	ErrMemberUserNotInOrg       = errors.New("member user is not in project organization")
	ErrProjectMemberNotFound    = errors.New("project member not found")
	ErrInvalidProjectMemberRole = errors.New("invalid project member role")
	ErrInvalidProjectName       = errors.New("invalid project name")
	ErrNoProjectFieldsToUpdate  = errors.New("no project fields to update")
	ErrProjectOwnerMemberLocked = errors.New("project owner member is locked")
)

type Service struct {
	repo     repository
	cache    cache.Cache
	identity projectIdentity
}

const progressCacheTTL = 2 * time.Minute

type projectIdentity interface {
	authidentity.Reader
	ListOrgs(ctx context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error)
}

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	return NewServiceWithIdentity(db, nil, cacheStore...)
}

func NewServiceWithIdentity(db *gorm.DB, identity projectIdentity, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db}, cache: c, identity: identity}
}

type CreateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	ProjectUID    string `json:"project_uid"`
	TotalEpisodes int    `json:"total_episodes"`
	AspectRatio   string `json:"aspect_ratio"`
	VisualStyle   string `json:"visual_style"`
	ProjectStyle  string `json:"project_style"`
}

type EnsureInput struct {
	ProjectUID  string `json:"project_uid" binding:"required"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type AdminCreateInput struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	OwnerID       uint   `json:"owner_id"`
	OrgID         *uint  `json:"org_id"`
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
	Name *string `json:"name"`
}

type AdminDetail struct {
	Project     domainproject.Project `json:"project"`
	MemberCount int64                 `json:"member_count"`
	Usage       UsageSummary          `json:"usage"`
	Audit       AuditSummary          `json:"audit"`
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
	Name *string
}

type MemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type Progress struct {
	Members int64
}

type AdminListFilter struct {
	Query     string
	ProjectID *uint
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
	projects, err := s.repo.List(ctx, orgID)
	if err != nil {
		return nil, err
	}
	s.enrichProjects(ctx, projects)
	return projects, nil
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
	page, err := s.repo.AdminList(ctx, filter)
	if err != nil {
		return ProjectPage{}, err
	}
	s.enrichProjects(ctx, page.Items)
	return page, nil
}

func (s *Service) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error) {
	if err := s.validateOwner(ctx, ownerID); err != nil {
		return domainproject.Project{}, err
	}
	project, err := s.repo.ForceSetOwner(ctx, projectID, ownerID)
	if err == nil {
		s.enrichProject(ctx, &project)
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
	if err := s.validateOwner(ctx, input.OwnerID); err != nil {
		return domainproject.Project{}, err
	}
	if err := s.validateProjectOrg(ctx, input.OrgID); err != nil {
		return domainproject.Project{}, err
	}
	project, err := s.repo.AdminCreate(ctx, input)
	if err == nil {
		s.enrichProject(ctx, &project)
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) validateOwner(ctx context.Context, ownerID uint) error {
	if ownerID == 0 || s.identity == nil {
		return ErrOwnerNotFound
	}
	profile, err := s.identity.UserProfile(ctx, ownerID)
	if err != nil {
		if errors.Is(err, authidentity.ErrUserNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if profile.Status != "" && profile.Status != domainidentity.UserStatusActive {
		return ErrOwnerInactive
	}
	return nil
}

func (s *Service) validateProjectOrg(ctx context.Context, orgID *uint) error {
	if orgID == nil {
		return nil
	}
	if s.identity == nil {
		return ErrProjectOrgNotFound
	}
	page, err := s.identity.ListOrgs(ctx, authidentity.ListOrgsFilter{OrgID: orgID, Page: 1, PageSize: 1})
	if err != nil {
		if errors.Is(err, authidentity.ErrOrgNotFound) {
			return ErrProjectOrgNotFound
		}
		return err
	}
	if len(page.Items) == 0 {
		return ErrProjectOrgNotFound
	}
	if page.Items[0].Status == domainorg.StatusSuspended {
		return ErrProjectOrgInactive
	}
	return nil
}

func (s *Service) Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.ProjectUID = strings.TrimSpace(input.ProjectUID)
	if input.Name == "" {
		return domainproject.Project{}, ErrInvalidProjectName
	}
	project, err := s.repo.Create(ctx, input, ownerID, orgID)
	if err == nil {
		s.enrichProject(ctx, &project)
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) ResolveByUID(ctx context.Context, projectUID string, orgID *uint) (domainproject.Project, error) {
	projectUID = strings.TrimSpace(projectUID)
	if projectUID == "" {
		return domainproject.Project{}, ErrProjectNotFound
	}
	project, err := s.repo.GetByUID(ctx, projectUID, orgID)
	if err != nil {
		return domainproject.Project{}, err
	}
	s.enrichProject(ctx, &project)
	return project, nil
}

func (s *Service) EnsureByUID(ctx context.Context, input EnsureInput, ownerID uint, orgID *uint) (domainproject.Project, bool, error) {
	projectUID := strings.TrimSpace(input.ProjectUID)
	if projectUID == "" {
		return domainproject.Project{}, false, ErrProjectNotFound
	}
	if existing, err := s.repo.GetByUID(ctx, projectUID, orgID); err == nil {
		s.enrichProject(ctx, &existing)
		return existing, false, nil
	} else if !errors.Is(err, ErrProjectNotFound) {
		return domainproject.Project{}, false, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = projectUID
	}
	project, err := s.repo.Create(ctx, CreateInput{
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		ProjectUID:  projectUID,
	}, ownerID, orgID)
	if err != nil {
		return domainproject.Project{}, false, err
	}
	s.enrichProject(ctx, &project)
	s.bumpProgressVersion(ctx, project.ID)
	return project, true, nil
}

func (s *Service) Get(ctx context.Context, id uint, orgID *uint) (domainproject.Project, error) {
	project, err := s.repo.Get(ctx, id, orgID)
	if err != nil {
		return domainproject.Project{}, err
	}
	s.enrichProject(ctx, &project)
	return project, nil
}

func (s *Service) AdminDetail(ctx context.Context, id uint) (AdminDetail, error) {
	if id == 0 {
		return AdminDetail{}, ErrProjectNotFound
	}
	detail, err := s.repo.AdminDetail(ctx, id)
	if err != nil {
		return AdminDetail{}, err
	}
	s.enrichProject(ctx, &detail.Project)
	return detail, nil
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
		s.enrichProject(ctx, &project)
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
	if spec.Name == nil {
		return domainproject.Project{}, ErrNoProjectFieldsToUpdate
	}
	project, err := s.repo.AdminUpdate(ctx, id, spec)
	if err == nil {
		s.enrichProject(ctx, &project)
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
	s.enrichMember(ctx, &member)
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
		s.enrichMember(ctx, &member)
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
	members, err := s.repo.ListMembers(ctx, projectID, orgID)
	if err != nil {
		return nil, err
	}
	s.enrichMembers(ctx, members)
	return members, nil
}

func (s *Service) enrichProjects(ctx context.Context, projects []domainproject.Project) {
	for i := range projects {
		s.enrichProject(ctx, &projects[i])
	}
}

func (s *Service) enrichProject(ctx context.Context, project *domainproject.Project) {
	if project == nil || s.identity == nil {
		return
	}
	ids := make([]uint, 0, len(project.Members)+1)
	if project.OwnerID != 0 && project.Owner == nil {
		ids = append(ids, project.OwnerID)
	}
	for _, member := range project.Members {
		if member.UserID != 0 && member.User == nil {
			ids = append(ids, member.UserID)
		}
	}
	users := s.userRefs(ctx, ids)
	if project.Owner == nil {
		if ref, ok := users[project.OwnerID]; ok {
			project.Owner = &ref
		}
	}
	for i := range project.Members {
		if project.Members[i].User == nil {
			if ref, ok := users[project.Members[i].UserID]; ok {
				project.Members[i].User = &ref
			}
		}
	}
}

func (s *Service) enrichMembers(ctx context.Context, members []domainproject.Member) {
	if s.identity == nil {
		return
	}
	ids := make([]uint, 0, len(members))
	for _, member := range members {
		if member.UserID != 0 && member.User == nil {
			ids = append(ids, member.UserID)
		}
	}
	users := s.userRefs(ctx, ids)
	for i := range members {
		if members[i].User == nil {
			if ref, ok := users[members[i].UserID]; ok {
				members[i].User = &ref
			}
		}
	}
}

func (s *Service) enrichMember(ctx context.Context, member *domainproject.Member) {
	if member == nil || s.identity == nil || member.User != nil || member.UserID == 0 {
		return
	}
	if ref, ok := s.userRefs(ctx, []uint{member.UserID})[member.UserID]; ok {
		member.User = &ref
	}
}

func (s *Service) userRefs(ctx context.Context, userIDs []uint) map[uint]domainproject.UserRef {
	out := make(map[uint]domainproject.UserRef, len(userIDs))
	seen := make(map[uint]struct{}, len(userIDs))
	for _, userID := range userIDs {
		if userID == 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		profile, err := s.identity.UserProfile(ctx, userID)
		if err != nil {
			continue
		}
		out[userID] = userRefFromProfile(profile)
	}
	return out
}

func userRefFromProfile(profile domainidentity.UserProfile) domainproject.UserRef {
	return domainproject.UserRef{
		ID:           profile.ID,
		Username:     profile.Username,
		SystemRole:   profile.SystemRole,
		PrimaryEmail: profile.PrimaryEmail,
		DisplayName:  profile.DisplayName,
		AvatarURL:    profile.AvatarURL,
		Status:       profile.Status,
	}
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
