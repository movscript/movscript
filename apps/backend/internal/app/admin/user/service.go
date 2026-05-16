package user

import (
	"context"
	"errors"
	"strings"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserConflict      = errors.New("user conflict")
	ErrInvalidUsername   = errors.New("invalid username")
	ErrInvalidEmail      = errors.New("invalid email")
	ErrInvalidSystemRole = errors.New("invalid system role")
	ErrInvalidStatus     = errors.New("invalid user status")
	ErrInvalidPassword   = errors.New("invalid password")
	ErrSessionNotFound   = errors.New("session not found")
	ErrLastSuperAdmin    = errors.New("cannot remove the last super admin")
	ErrNoFieldsToUpdate  = errors.New("no fields to update")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	Query      string
	UserID     *uint
	SystemRole string
	Status     string
	Page       int
	PageSize   int
}

type Page struct {
	Items    []domainauth.UserProfile `json:"items"`
	Total    int64                    `json:"total"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"page_size"`
}

type Detail struct {
	User     domainauth.UserProfile `json:"user"`
	Orgs     []OrgMembership        `json:"orgs"`
	Projects []ProjectMembership    `json:"projects"`
	Sessions []SessionSummary       `json:"sessions"`
	Usage    UsageSummary           `json:"usage"`
	Audit    AuditSummary           `json:"audit"`
}

type OrgMembership struct {
	ID       uint      `json:"ID"`
	Name     string    `json:"name"`
	Slug     string    `json:"slug"`
	Plan     string    `json:"plan"`
	Status   string    `json:"status"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type ProjectMembership struct {
	ID       uint      `json:"ID"`
	Name     string    `json:"name"`
	Status   string    `json:"status"`
	OrgID    *uint     `json:"org_id,omitempty"`
	OwnerID  uint      `json:"owner_id"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
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

type SessionSummary struct {
	ID         uint       `json:"ID"`
	ExpiresAt  time.Time  `json:"expires_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
	UserAgent  string     `json:"user_agent,omitempty"`
	IPAddress  string     `json:"ip_address,omitempty"`
	CreatedAt  time.Time  `json:"CreatedAt"`
}

type UpdateInput struct {
	SystemRole  *string `json:"system_role"`
	Status      *string `json:"status"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
}

type CreateInput struct {
	Username    string  `json:"username"`
	Password    string  `json:"password"`
	Email       *string `json:"email"`
	DisplayName *string `json:"display_name"`
	SystemRole  *string `json:"system_role"`
	Status      *string `json:"status"`
}

type ResetPasswordInput struct {
	Password string `json:"password"`
}

type updateSpec struct {
	SystemRole      *string
	Status          *string
	DisplayName     *string
	PrimaryEmail    *string
	EmailSet        bool
	EmailVerifiedAt *int64
	RevokeSessions  bool
}

func (s updateSpec) empty() bool {
	return s.SystemRole == nil && s.Status == nil && s.DisplayName == nil && !s.EmailSet
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
	filter.SystemRole = normalizeSystemRole(filter.SystemRole)
	filter.Status = normalizeStatus(filter.Status)
	return s.repo.List(ctx, filter)
}

func (s *Service) Detail(ctx context.Context, id uint) (Detail, error) {
	if id == 0 {
		return Detail{}, ErrUserNotFound
	}
	return s.repo.Detail(ctx, id)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (domainauth.UserProfile, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return domainauth.UserProfile{}, ErrInvalidUsername
	}
	passwordHash, err := hashAdminPassword(input.Password)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	role := domainauth.SystemRoleUser
	if input.SystemRole != nil {
		role = normalizeSystemRole(*input.SystemRole)
		if !validSystemRole(role) {
			return domainauth.UserProfile{}, ErrInvalidSystemRole
		}
	}
	status := domainauth.UserStatusActive
	if input.Status != nil {
		status = normalizeStatus(*input.Status)
		if !validStatus(status) {
			return domainauth.UserProfile{}, ErrInvalidStatus
		}
	}
	email := ""
	var verifiedAt *int64
	if input.Email != nil {
		email = domainauth.NormalizeEmail(*input.Email)
		if strings.TrimSpace(*input.Email) != "" && email == "" {
			return domainauth.UserProfile{}, ErrInvalidEmail
		}
		if email != "" {
			now := time.Now().UTC().Unix()
			verifiedAt = &now
		}
	}
	user := domainauth.NewRegisteredUser(username, passwordHash, email, role == domainauth.SystemRoleSuperAdmin, verifiedAt)
	user.SystemRole = role
	user.Status = status
	if input.DisplayName != nil {
		user.DisplayName = strings.TrimSpace(*input.DisplayName)
	}
	return s.repo.Create(ctx, user)
}

func (s *Service) ResetPassword(ctx context.Context, id uint, input ResetPasswordInput) (domainauth.UserProfile, error) {
	if id == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	passwordHash, err := hashAdminPassword(input.Password)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return s.repo.ResetPassword(ctx, id, passwordHash)
}

func (s *Service) RevokeSession(ctx context.Context, userID uint, sessionID uint) error {
	if userID == 0 {
		return ErrUserNotFound
	}
	if sessionID == 0 {
		return ErrSessionNotFound
	}
	return s.repo.RevokeSession(ctx, userID, sessionID, time.Now().UTC())
}

func (s *Service) RevokeAllSessions(ctx context.Context, userID uint) (int64, error) {
	if userID == 0 {
		return 0, ErrUserNotFound
	}
	return s.repo.RevokeAllSessions(ctx, userID, time.Now().UTC())
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput) (domainauth.UserProfile, error) {
	if id == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	spec := updateSpec{}
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
		spec.RevokeSessions = status != domainauth.UserStatusActive
	}
	if input.DisplayName != nil {
		displayName := strings.TrimSpace(*input.DisplayName)
		spec.DisplayName = &displayName
	}
	if input.Email != nil {
		email := domainauth.NormalizeEmail(*input.Email)
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
	if spec.empty() {
		return domainauth.UserProfile{}, ErrNoFieldsToUpdate
	}
	return s.repo.Update(ctx, id, spec)
}

func hashAdminPassword(password string) (string, error) {
	password = strings.TrimSpace(password)
	if len(password) < 8 {
		return "", ErrInvalidPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return string(hash), nil
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
	case domainauth.UserStatusActive, "disabled", "suspended":
		return true
	default:
		return false
	}
}
