package identity

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	domainauth "github.com/movscript/auth-service/internal/domain/auth"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound                = errors.New("auth user not found")
	ErrUserConflict                = errors.New("auth user conflict")
	ErrInvalidUsername             = errors.New("invalid auth username")
	ErrInvalidEmail                = errors.New("invalid auth email")
	ErrInvalidSystemRole           = errors.New("invalid auth system role")
	ErrInvalidStatus               = errors.New("invalid auth user status")
	ErrLastSuperAdmin              = errors.New("cannot remove the last auth super admin")
	ErrNoFieldsToUpdate            = errors.New("no auth user fields to update")
	ErrInvalidPasswordHash         = errors.New("invalid auth password hash")
	ErrIdentityMutationUnavailable = errors.New("auth identity mutation unavailable")
	ErrOrgNotFound                 = errors.New("auth org not found")
	ErrOrgConflict                 = errors.New("auth org conflict")
	ErrInvalidOrgName              = errors.New("invalid auth org name")
	ErrInvalidOrgSlug              = errors.New("invalid auth org slug")
	ErrInvalidOrgPlan              = errors.New("invalid auth org plan")
	ErrInvalidOrgStatus            = errors.New("invalid auth org status")
	ErrInvalidOrgRole              = errors.New("invalid auth org role")
	ErrOrgMemberNotFound           = errors.New("auth org member not found")
	ErrOrgMemberConflict           = errors.New("auth org member conflict")
	ErrLastOrgOwner                = errors.New("auth org must keep at least one owner")
)

type Directory interface {
	UserProfile(ctx context.Context, userID uint) (domainauth.UserProfile, bool, error)
	OrgMemberships(ctx context.Context, userID uint) ([]domainauth.OrgMembership, bool, error)
}

type UserManager interface {
	ListUsers(ctx context.Context, filter ListUsersFilter) (UserPage, error)
	CreateUser(ctx context.Context, input CreateUserInput) (domainauth.UserProfile, error)
	CreateUserWithPassword(ctx context.Context, input CreateUserInput, passwordHash string) (domainauth.UserProfile, error)
	UpdateUser(ctx context.Context, userID uint, spec UpdateUserSpec) (domainauth.UserProfile, error)
	SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainauth.UserProfile, error)
	ListOrgs(ctx context.Context, filter ListOrgsFilter) (OrgPage, error)
	CreateOrg(ctx context.Context, input CreateOrgInput) (domainauth.Organization, error)
	UpdateOrg(ctx context.Context, orgID uint, spec UpdateOrgSpec) (domainauth.Organization, error)
	ListOrgMembers(ctx context.Context, orgID uint) ([]domainauth.OrganizationMember, error)
	AddOrgMember(ctx context.Context, orgID uint, input OrgMemberInput) (domainauth.OrganizationMember, error)
	UpdateOrgMember(ctx context.Context, orgID uint, userID uint, role string) (domainauth.OrganizationMember, error)
	RemoveOrgMember(ctx context.Context, orgID uint, userID uint) error
}

type Service struct {
	directory Directory
}

func NewService(directory Directory) *Service {
	return &Service{directory: directory}
}

func (s *Service) UserProfile(ctx context.Context, userID uint) (domainauth.UserProfile, error) {
	if s == nil || s.directory == nil || userID == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	profile, ok, err := s.directory.UserProfile(ctx, userID)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	if !ok {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	return profile, nil
}

func (s *Service) OrgMemberships(ctx context.Context, userID uint) ([]domainauth.OrgMembership, error) {
	if s == nil || s.directory == nil || userID == 0 {
		return nil, ErrUserNotFound
	}
	memberships, ok, err := s.directory.OrgMemberships(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrUserNotFound
	}
	return memberships, nil
}

type ListUsersFilter struct {
	Query      string
	UserID     *uint
	SystemRole string
	Status     string
	Page       int
	PageSize   int
}

type UserPage struct {
	Items    []domainauth.UserProfile `json:"items"`
	Total    int64                    `json:"total"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"page_size"`
}

type CreateUserInput struct {
	Username    string  `json:"username"`
	Email       *string `json:"email,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	SystemRole  *string `json:"system_role,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type CreateUserWithPasswordInput struct {
	Username    string  `json:"username"`
	Password    string  `json:"password"`
	Email       *string `json:"email,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	SystemRole  *string `json:"system_role,omitempty"`
	Status      *string `json:"status,omitempty"`
}

func (i CreateUserWithPasswordInput) CreateUserInput() CreateUserInput {
	return CreateUserInput{
		Username:    i.Username,
		Email:       i.Email,
		DisplayName: i.DisplayName,
		SystemRole:  i.SystemRole,
		Status:      i.Status,
	}
}

type UpdateUserInput struct {
	SystemRole  *string `json:"system_role,omitempty"`
	Status      *string `json:"status,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type UpdateUserSpec struct {
	SystemRole      *string
	Status          *string
	DisplayName     *string
	PrimaryEmail    *string
	EmailSet        bool
	EmailVerifiedAt *int64
}

type ListOrgsFilter struct {
	Query      string
	OrgID      *uint
	UserID     *uint
	Status     string
	Plan       string
	IsPersonal *bool
	Page       int
	PageSize   int
}

type OrgPage struct {
	Items    []domainauth.Organization `json:"items"`
	Total    int64                     `json:"total"`
	Page     int                       `json:"page"`
	PageSize int                       `json:"page_size"`
}

type CreateOrgInput struct {
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedBy uint   `json:"created_by"`
	Plan      string `json:"plan,omitempty"`
	Status    string `json:"status,omitempty"`
}

type UpdateOrgInput struct {
	Name   *string `json:"name,omitempty"`
	Slug   *string `json:"slug,omitempty"`
	Plan   *string `json:"plan,omitempty"`
	Status *string `json:"status,omitempty"`
}

type UpdateOrgSpec struct {
	Name   *string
	Slug   *string
	Plan   *string
	Status *string
}

func (s UpdateOrgSpec) Empty() bool {
	return s.Name == nil && s.Slug == nil && s.Plan == nil && s.Status == nil
}

type OrgMemberInput struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role,omitempty"`
}

func (s UpdateUserSpec) Empty() bool {
	return s.SystemRole == nil && s.Status == nil && s.DisplayName == nil && !s.EmailSet
}

func (s *Service) ListUsers(ctx context.Context, filter ListUsersFilter) (UserPage, error) {
	manager, err := s.manager()
	if err != nil {
		return UserPage{}, err
	}
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
	filter.SystemRole = normalizeSystemRole(filter.SystemRole)
	if filter.SystemRole != "" && !validSystemRole(filter.SystemRole) {
		return UserPage{}, ErrInvalidSystemRole
	}
	filter.Status = normalizeStatus(filter.Status)
	if filter.Status != "" && !validStatus(filter.Status) {
		return UserPage{}, ErrInvalidStatus
	}
	return manager.ListUsers(ctx, filter)
}

func (s *Service) CreateUser(ctx context.Context, input CreateUserInput) (domainauth.UserProfile, error) {
	manager, err := s.manager()
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	normalized, err := normalizeCreateUserInput(input)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return manager.CreateUser(ctx, normalized)
}

func (s *Service) CreateUserWithPassword(ctx context.Context, input CreateUserWithPasswordInput) (domainauth.UserProfile, error) {
	manager, err := s.manager()
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	normalized, err := normalizeCreateUserInput(input.CreateUserInput())
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	password := strings.TrimSpace(input.Password)
	if password == "" {
		return domainauth.UserProfile{}, ErrInvalidPasswordHash
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return manager.CreateUserWithPassword(ctx, normalized, string(hash))
}

func normalizeCreateUserInput(input CreateUserInput) (CreateUserInput, error) {
	input.Username = strings.TrimSpace(input.Username)
	if input.Username == "" {
		return CreateUserInput{}, ErrInvalidUsername
	}
	role := domainauth.SystemRoleUser
	if input.SystemRole != nil {
		role = normalizeSystemRole(*input.SystemRole)
		if !validSystemRole(role) {
			return CreateUserInput{}, ErrInvalidSystemRole
		}
	}
	status := domainauth.UserStatusActive
	if input.Status != nil {
		status = normalizeStatus(*input.Status)
		if !validStatus(status) {
			return CreateUserInput{}, ErrInvalidStatus
		}
	}
	input.SystemRole = &role
	input.Status = &status
	if input.Email != nil {
		email := NormalizeEmail(*input.Email)
		if strings.TrimSpace(*input.Email) != "" && email == "" {
			return CreateUserInput{}, ErrInvalidEmail
		}
		if email != "" {
			input.Email = &email
		} else {
			input.Email = nil
		}
	}
	if input.DisplayName != nil {
		displayName := strings.TrimSpace(*input.DisplayName)
		input.DisplayName = &displayName
	}
	return input, nil
}

func (s *Service) UpdateUser(ctx context.Context, userID uint, input UpdateUserInput) (domainauth.UserProfile, error) {
	if userID == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	manager, err := s.manager()
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	spec := UpdateUserSpec{}
	if input.SystemRole != nil {
		role := normalizeSystemRole(*input.SystemRole)
		if !validSystemRole(role) {
			return domainauth.UserProfile{}, ErrInvalidSystemRole
		}
		spec.SystemRole = &role
	}
	if input.Status != nil {
		status := normalizeStatus(*input.Status)
		if !validStatus(status) {
			return domainauth.UserProfile{}, ErrInvalidStatus
		}
		spec.Status = &status
	}
	if input.DisplayName != nil {
		displayName := strings.TrimSpace(*input.DisplayName)
		spec.DisplayName = &displayName
	}
	if input.Email != nil {
		email := NormalizeEmail(*input.Email)
		spec.EmailSet = true
		if strings.TrimSpace(*input.Email) != "" && email == "" {
			return domainauth.UserProfile{}, ErrInvalidEmail
		}
		if email != "" {
			spec.PrimaryEmail = &email
			now := time.Now().UTC().Unix()
			spec.EmailVerifiedAt = &now
		}
	}
	if spec.Empty() {
		return domainauth.UserProfile{}, ErrNoFieldsToUpdate
	}
	return manager.UpdateUser(ctx, userID, spec)
}

func (s *Service) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainauth.UserProfile, error) {
	if userID == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	manager, err := s.manager()
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	passwordHash = strings.TrimSpace(passwordHash)
	if passwordHash == "" {
		return domainauth.UserProfile{}, ErrInvalidPasswordHash
	}
	return manager.SetUserPasswordHash(ctx, userID, passwordHash)
}

func (s *Service) ListOrgs(ctx context.Context, filter ListOrgsFilter) (OrgPage, error) {
	manager, err := s.manager()
	if err != nil {
		return OrgPage{}, err
	}
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
	filter.Status = normalizeOrgStatus(filter.Status)
	if filter.Status != "" && !validOrgStatus(filter.Status) {
		return OrgPage{}, ErrInvalidOrgStatus
	}
	filter.Plan = normalizeOrgPlan(filter.Plan)
	if filter.Plan != "" && !validOrgPlan(filter.Plan) {
		return OrgPage{}, ErrInvalidOrgPlan
	}
	return manager.ListOrgs(ctx, filter)
}

func (s *Service) CreateOrg(ctx context.Context, input CreateOrgInput) (domainauth.Organization, error) {
	manager, err := s.manager()
	if err != nil {
		return domainauth.Organization{}, err
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return domainauth.Organization{}, ErrInvalidOrgName
	}
	input.Slug = NormalizeSlug(input.Slug)
	if input.Slug == "" {
		return domainauth.Organization{}, ErrInvalidOrgSlug
	}
	if input.CreatedBy == 0 {
		return domainauth.Organization{}, ErrUserNotFound
	}
	input.Plan = normalizeOrgPlan(input.Plan)
	if input.Plan == "" {
		input.Plan = domainauth.OrgPlanTeam
	}
	if !validOrgPlan(input.Plan) {
		return domainauth.Organization{}, ErrInvalidOrgPlan
	}
	input.Status = normalizeOrgStatus(input.Status)
	if input.Status == "" {
		input.Status = domainauth.OrgStatusActive
	}
	if !validOrgStatus(input.Status) {
		return domainauth.Organization{}, ErrInvalidOrgStatus
	}
	return manager.CreateOrg(ctx, input)
}

func (s *Service) UpdateOrg(ctx context.Context, orgID uint, input UpdateOrgInput) (domainauth.Organization, error) {
	if orgID == 0 {
		return domainauth.Organization{}, ErrOrgNotFound
	}
	manager, err := s.manager()
	if err != nil {
		return domainauth.Organization{}, err
	}
	spec := UpdateOrgSpec{}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return domainauth.Organization{}, ErrInvalidOrgName
		}
		spec.Name = &name
	}
	if input.Slug != nil {
		slug := NormalizeSlug(*input.Slug)
		if slug == "" {
			return domainauth.Organization{}, ErrInvalidOrgSlug
		}
		spec.Slug = &slug
	}
	if input.Plan != nil {
		plan := normalizeOrgPlan(*input.Plan)
		if !validOrgPlan(plan) {
			return domainauth.Organization{}, ErrInvalidOrgPlan
		}
		spec.Plan = &plan
	}
	if input.Status != nil {
		status := normalizeOrgStatus(*input.Status)
		if !validOrgStatus(status) {
			return domainauth.Organization{}, ErrInvalidOrgStatus
		}
		spec.Status = &status
	}
	if spec.Empty() {
		return domainauth.Organization{}, ErrNoFieldsToUpdate
	}
	return manager.UpdateOrg(ctx, orgID, spec)
}

func (s *Service) ListOrgMembers(ctx context.Context, orgID uint) ([]domainauth.OrganizationMember, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	manager, err := s.manager()
	if err != nil {
		return nil, err
	}
	return manager.ListOrgMembers(ctx, orgID)
}

func (s *Service) AddOrgMember(ctx context.Context, orgID uint, input OrgMemberInput) (domainauth.OrganizationMember, error) {
	if orgID == 0 {
		return domainauth.OrganizationMember{}, ErrOrgNotFound
	}
	if input.UserID == 0 {
		return domainauth.OrganizationMember{}, ErrUserNotFound
	}
	role := normalizeOrgRole(input.Role)
	if role == "" {
		role = domainauth.OrgRoleMember
	}
	if !validOrgRole(role) {
		return domainauth.OrganizationMember{}, ErrInvalidOrgRole
	}
	input.Role = role
	manager, err := s.manager()
	if err != nil {
		return domainauth.OrganizationMember{}, err
	}
	return manager.AddOrgMember(ctx, orgID, input)
}

func (s *Service) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input OrgMemberInput) (domainauth.OrganizationMember, error) {
	if orgID == 0 {
		return domainauth.OrganizationMember{}, ErrOrgNotFound
	}
	if userID == 0 {
		return domainauth.OrganizationMember{}, ErrUserNotFound
	}
	role := normalizeOrgRole(input.Role)
	if !validOrgRole(role) {
		return domainauth.OrganizationMember{}, ErrInvalidOrgRole
	}
	manager, err := s.manager()
	if err != nil {
		return domainauth.OrganizationMember{}, err
	}
	return manager.UpdateOrgMember(ctx, orgID, userID, role)
}

func (s *Service) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) error {
	if orgID == 0 {
		return ErrOrgNotFound
	}
	if userID == 0 {
		return ErrUserNotFound
	}
	manager, err := s.manager()
	if err != nil {
		return err
	}
	return manager.RemoveOrgMember(ctx, orgID, userID)
}

func (s *Service) manager() (UserManager, error) {
	if s == nil || s.directory == nil {
		return nil, ErrIdentityMutationUnavailable
	}
	manager, ok := s.directory.(UserManager)
	if !ok {
		return nil, ErrIdentityMutationUnavailable
	}
	return manager, nil
}

func NormalizeEmail(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}
	if !regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`).MatchString(value) {
		return ""
	}
	return value
}

func normalizeSystemRole(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validSystemRole(value string) bool {
	switch value {
	case domainauth.SystemRoleSuperAdmin, domainauth.SystemRoleUser:
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
	case domainauth.UserStatusActive, domainauth.UserStatusDisabled, domainauth.UserStatusSuspended:
		return true
	default:
		return false
	}
}

func NormalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '-':
			return r
		case r == '_' || r == ' ':
			return '-'
		default:
			return -1
		}
	}, value)
	value = regexp.MustCompile(`-+`).ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func normalizeOrgPlan(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validOrgPlan(value string) bool {
	switch value {
	case domainauth.OrgPlanPersonal, domainauth.OrgPlanTeam:
		return true
	default:
		return false
	}
}

func normalizeOrgStatus(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validOrgStatus(value string) bool {
	switch value {
	case domainauth.OrgStatusActive, domainauth.OrgStatusSuspended:
		return true
	default:
		return false
	}
}

func normalizeOrgRole(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validOrgRole(value string) bool {
	switch value {
	case domainauth.OrgRoleOwner, domainauth.OrgRoleAdmin, domainauth.OrgRoleMember, domainauth.OrgRoleViewer:
		return true
	default:
		return false
	}
}
