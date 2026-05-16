package orgadmin

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

var (
	ErrOrgNotFound         = errors.New("organization not found")
	ErrOrgInactive         = errors.New("organization inactive")
	ErrOrgAlreadyExists    = errors.New("organization already exists")
	ErrUserNotFound        = errors.New("user not found")
	ErrUserInactive        = errors.New("user inactive")
	ErrMemberNotFound      = errors.New("organization member not found")
	ErrMemberAlreadyExists = errors.New("organization member already exists")
	ErrInvitationNotFound  = errors.New("organization invitation not found")
	ErrInvalidOrgName      = errors.New("invalid organization name")
	ErrInvalidPlan         = errors.New("invalid organization plan")
	ErrInvalidStatus       = errors.New("invalid organization status")
	ErrInvalidMemberRole   = errors.New("invalid organization member role")
	ErrPersonalOrgJoinCode = errors.New("personal organization cannot rotate join code")
	ErrLastOwner           = errors.New("cannot remove the last organization owner")
	ErrNoFieldsToUpdate    = errors.New("no fields to update")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	Query      string
	Plan       string
	Status     string
	IsPersonal *bool
	Page       int
	PageSize   int
}

type Organization struct {
	domainorg.Organization
	MemberCount int64 `json:"member_count"`
}

type Detail struct {
	Org               Organization     `json:"org"`
	ActiveInvitations int64            `json:"active_invitations"`
	ProjectCount      int64            `json:"project_count"`
	ResourceCount     int64            `json:"resource_count"`
	Projects          []ProjectSummary `json:"projects"`
	Usage             UsageSummary     `json:"usage"`
	Audit             AuditSummary     `json:"audit"`
}

type ProjectSummary struct {
	ID        uint      `json:"ID"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	OwnerID   uint      `json:"owner_id"`
	UpdatedAt time.Time `json:"UpdatedAt"`
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

type Page struct {
	Items    []Organization `json:"items"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
}

type CreateInput struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	OwnerUserID uint   `json:"owner_user_id"`
}

type UpdateInput struct {
	Name   *string `json:"name"`
	Plan   *string `json:"plan"`
	Status *string `json:"status"`
}

type updateSpec struct {
	Name   *string
	Plan   *string
	Status *string
}

type AddMemberInput struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
}

type CreateInvitationInput struct {
	Role string `json:"role"`
	Note string `json:"note"`
}

func (s updateSpec) empty() bool {
	return s.Name == nil && s.Plan == nil && s.Status == nil
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 50
	}
	if filter.PageSize > 200 {
		filter.PageSize = 200
	}
	filter.Query = strings.TrimSpace(filter.Query)
	filter.Plan = normalizePlan(filter.Plan)
	filter.Status = normalizeStatus(filter.Status)
	return s.repo.List(ctx, filter)
}

func (s *Service) Detail(ctx context.Context, id uint) (Detail, error) {
	if id == 0 {
		return Detail{}, ErrOrgNotFound
	}
	return s.repo.Detail(ctx, id)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (Organization, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return Organization{}, ErrInvalidOrgName
	}
	if input.OwnerUserID == 0 {
		return Organization{}, ErrUserNotFound
	}
	input.Name = name
	input.Slug = normalizeOrgSlug(input.Slug)
	if input.Slug == "" {
		input.Slug = normalizeOrgSlug(name)
	}
	if input.Slug == "" {
		input.Slug = fallbackOrgSlug(input.OwnerUserID)
	}
	return s.repo.Create(ctx, input)
}

func (s *Service) ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	return s.repo.ListMembers(ctx, orgID)
}

func (s *Service) ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	return s.repo.ListInvitations(ctx, orgID)
}

func (s *Service) AddMember(ctx context.Context, orgID uint, input AddMemberInput) (domainorg.OrganizationMember, error) {
	if orgID == 0 {
		return domainorg.OrganizationMember{}, ErrOrgNotFound
	}
	if input.UserID == 0 {
		return domainorg.OrganizationMember{}, ErrUserNotFound
	}
	role := normalizeMemberRole(input.Role)
	if role == "" {
		role = domainorg.RoleMember
	}
	if !validMemberRole(role) {
		return domainorg.OrganizationMember{}, ErrInvalidMemberRole
	}
	return s.repo.AddMember(ctx, orgID, input.UserID, role)
}

func (s *Service) CreateInvitation(ctx context.Context, orgID uint, creatorID uint, input CreateInvitationInput) (domainorg.Invitation, error) {
	if orgID == 0 {
		return domainorg.Invitation{}, ErrOrgNotFound
	}
	role := normalizeMemberRole(input.Role)
	if role == "" {
		role = domainorg.RoleMember
	}
	if !validMemberRole(role) {
		return domainorg.Invitation{}, ErrInvalidMemberRole
	}
	token, err := domainorg.GenerateInviteToken()
	if err != nil {
		return domainorg.Invitation{}, err
	}
	invitation := domainorg.NewInvitation(orgID, token, role, strings.TrimSpace(input.Note), creatorID, time.Now().UTC().Add(7*24*time.Hour))
	return s.repo.CreateInvitation(ctx, invitation)
}

func (s *Service) UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) (domainorg.OrganizationMember, error) {
	if orgID == 0 || userID == 0 {
		return domainorg.OrganizationMember{}, ErrMemberNotFound
	}
	role = normalizeMemberRole(role)
	if !validMemberRole(role) {
		return domainorg.OrganizationMember{}, ErrInvalidMemberRole
	}
	return s.repo.UpdateMemberRole(ctx, orgID, userID, role)
}

func (s *Service) RemoveMember(ctx context.Context, orgID uint, userID uint) error {
	if orgID == 0 || userID == 0 {
		return ErrMemberNotFound
	}
	return s.repo.DeleteMember(ctx, orgID, userID)
}

func (s *Service) RevokeInvitation(ctx context.Context, orgID uint, invitationID uint) error {
	if orgID == 0 {
		return ErrOrgNotFound
	}
	if invitationID == 0 {
		return ErrInvitationNotFound
	}
	return s.repo.DeleteInvitation(ctx, orgID, invitationID)
}

func (s *Service) RotateJoinCode(ctx context.Context, orgID uint) (Organization, error) {
	if orgID == 0 {
		return Organization{}, ErrOrgNotFound
	}
	return s.repo.RotateJoinCode(ctx, orgID)
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput) (Organization, error) {
	if id == 0 {
		return Organization{}, ErrOrgNotFound
	}
	spec := updateSpec{}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name != "" {
			spec.Name = &name
		}
	}
	if input.Plan != nil {
		plan := normalizePlan(*input.Plan)
		if !validPlan(plan) {
			return Organization{}, ErrInvalidPlan
		}
		spec.Plan = &plan
	}
	if input.Status != nil {
		status := normalizeStatus(*input.Status)
		if !validStatus(status) {
			return Organization{}, ErrInvalidStatus
		}
		spec.Status = &status
	}
	if spec.empty() {
		return Organization{}, ErrNoFieldsToUpdate
	}
	return s.repo.Update(ctx, id, spec)
}

func normalizePlan(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validPlan(value string) bool {
	switch value {
	case domainorg.PlanPersonal, domainorg.PlanTeam:
		return true
	default:
		return false
	}
}

func normalizeStatus(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validStatus(value string) bool {
	switch value {
	case domainorg.StatusActive, domainorg.StatusSuspended:
		return true
	default:
		return false
	}
}

func normalizeMemberRole(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validMemberRole(value string) bool {
	switch value {
	case domainorg.RoleOwner, domainorg.RoleAdmin, domainorg.RoleMember, "viewer":
		return true
	default:
		return false
	}
}

func normalizeOrgSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= '一' && r <= '龥') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	runes := []rune(slug)
	if len(runes) > 64 {
		slug = strings.Trim(string(runes[:64]), "-")
	}
	return slug
}

func fallbackOrgSlug(ownerUserID uint) string {
	return strings.ToLower(strings.TrimSpace("org-" + strconv.FormatUint(uint64(ownerUserID), 10) + "-" + strconv.FormatInt(time.Now().UTC().UnixNano(), 36)))
}
