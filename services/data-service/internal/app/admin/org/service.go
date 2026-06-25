package org

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

var (
	ErrOrgNotFound         = errors.New("organization not found")
	ErrOrgInactive         = errors.New("organization inactive")
	ErrOrgAlreadyExists    = errors.New("organization already exists")
	ErrInvitationNotFound  = errors.New("organization invitation not found")
	ErrInvalidMemberRole   = errors.New("invalid organization member role")
	ErrPersonalOrgJoinCode = errors.New("personal organization cannot rotate join code")
	ErrIdentityUnavailable = errors.New("organization identity manager unavailable")
)

type Service struct {
	repo     repository
	identity authidentity.OrgMemberDirectory
}

func NewService(db *gorm.DB) *Service {
	return NewServiceWithIdentity(db, nil)
}

func NewServiceWithIdentity(db *gorm.DB, identity authidentity.OrgMemberDirectory) *Service {
	return &Service{repo: &gormRepository{db: db}, identity: identity}
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

type CreateInvitationInput struct {
	Role string `json:"role"`
	Note string `json:"note"`
}

func (s *Service) Detail(ctx context.Context, id uint) (Detail, error) {
	if id == 0 {
		return Detail{}, ErrOrgNotFound
	}
	detail, err := s.repo.Detail(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	memberCount, err := s.memberCount(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	detail.Org.MemberCount = memberCount
	return detail, nil
}

func (s *Service) ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	return s.repo.ListInvitations(ctx, orgID)
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
	org, err := s.repo.RotateJoinCode(ctx, orgID)
	if err != nil {
		return Organization{}, err
	}
	memberCount, err := s.memberCount(ctx, orgID)
	if err != nil {
		return Organization{}, err
	}
	org.MemberCount = memberCount
	return org, nil
}

func (s *Service) memberCount(ctx context.Context, orgID uint) (int64, error) {
	if s.identity == nil {
		return 0, ErrIdentityUnavailable
	}
	members, err := s.identity.ListOrgMembers(ctx, orgID)
	if err != nil {
		if errors.Is(err, authidentity.ErrOrgNotFound) {
			return 0, ErrOrgNotFound
		}
		return 0, err
	}
	return int64(len(members)), nil
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
