package org

import (
	"context"
	"errors"
	"strings"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("organization not found")
	ErrForbidden      = errors.New("organization permission denied")
	ErrConflict       = errors.New("organization conflict")
	ErrInvalidCode    = errors.New("organization code invalid")
	ErrInviteNotFound = errors.New("invitation not found")
	ErrInviteUsed     = errors.New("invitation already used")
	ErrInviteExpired  = errors.New("invitation expired")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

func IsDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique_violation")
}

type CreateInput struct {
	Name string
	Slug string
}

type MemberInput struct {
	UserID uint
	Role   string
}

type InvitationInput struct {
	Role string
	Note string
}

type GroupInput struct {
	Name string
}

type UsageRow struct {
	UserID      uint
	Username    string
	TotalCost   float64
	TotalTokens int
}

type UsageResult struct {
	Month string
	Rows  []UsageRow
}

func (s *Service) List(ctx context.Context, userID uint) ([]OrgWithRole, error) {
	return s.repo.List(ctx, userID)
}

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (model.Organization, error) {
	return s.repo.Create(ctx, ownerID, input)
}

func (s *Service) Get(ctx context.Context, orgID uint) (model.Organization, error) {
	return s.repo.Get(ctx, orgID)
}

func (s *Service) Update(ctx context.Context, member model.OrganizationMember, name string) error {
	if !IsAdminOrAbove(member.Role) {
		return ErrForbidden
	}
	return s.repo.UpdateName(ctx, member.OrgID, name)
}

func (s *Service) ListMembers(ctx context.Context, orgID uint) ([]model.OrganizationMember, error) {
	return s.repo.ListMembers(ctx, orgID)
}

func (s *Service) AddMember(ctx context.Context, caller model.OrganizationMember, input MemberInput) (model.OrganizationMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.OrganizationMember{}, ErrForbidden
	}
	member := domainorg.Member(caller.OrgID, input.UserID, input.Role)
	return s.repo.CreateMember(ctx, member)
}

func (s *Service) UpdateMember(ctx context.Context, caller model.OrganizationMember, targetUserID uint, role string) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.UpdateMemberRole(ctx, caller.OrgID, targetUserID, role)
}

func (s *Service) RemoveMember(ctx context.Context, caller model.OrganizationMember, targetUserID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteMember(ctx, caller.OrgID, targetUserID)
}

func (s *Service) ListInvitations(ctx context.Context, caller model.OrganizationMember) ([]model.OrgInvitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return nil, ErrForbidden
	}
	return s.repo.ListInvitations(ctx, caller.OrgID)
}

func (s *Service) CreateInvitation(ctx context.Context, caller model.OrganizationMember, creatorID uint, input InvitationInput) (model.OrgInvitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.OrgInvitation{}, ErrForbidden
	}
	token, err := generateInviteToken()
	if err != nil {
		return model.OrgInvitation{}, err
	}
	role := domainorg.DefaultMemberRole(input.Role)
	inv := model.OrgInvitation{
		OrgID:     caller.OrgID,
		Token:     token,
		Role:      role,
		Note:      input.Note,
		CreatedBy: creatorID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	return s.repo.CreateInvitation(ctx, inv)
}

func (s *Service) RevokeInvitation(ctx context.Context, caller model.OrganizationMember, invID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteInvitation(ctx, caller.OrgID, invID)
}

func (s *Service) GetInvitation(ctx context.Context, token string) (model.OrgInvitation, model.Organization, error) {
	inv, err := s.repo.FindInvitationByToken(ctx, token)
	if err != nil {
		return inv, model.Organization{}, err
	}
	if inv.UsedAt != nil {
		return inv, model.Organization{}, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return inv, model.Organization{}, ErrInviteExpired
	}
	org, err := s.repo.Get(ctx, inv.OrgID)
	if err != nil {
		return inv, model.Organization{}, err
	}
	return inv, org, nil
}

func (s *Service) AcceptInvitation(ctx context.Context, token string, user *model.User, registration *RegistrationInput) (uint, error) {
	inv, err := s.repo.FindInvitationByToken(ctx, token)
	if err != nil {
		return 0, err
	}
	if inv.UsedAt != nil {
		return 0, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return 0, ErrInviteExpired
	}
	if user == nil {
		if registration == nil {
			return 0, ErrForbidden
		}
		exists, err := s.repo.UsernameExists(ctx, registration.Username)
		if err != nil {
			return 0, err
		}
		if exists {
			return 0, ErrConflict
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(registration.Password), 12)
		if err != nil {
			return 0, err
		}
		createdUser := domainauth.NewRegisteredUser(registration.Username, string(hash), "", false, nil)
		user = &createdUser
		if err := s.repo.CreateUser(ctx, user); err != nil {
			return 0, err
		}
		if err := s.repo.CreatePersonalOrg(ctx, user); err != nil {
			// non-fatal
		}
	}
	if err := s.repo.AcceptInvitation(ctx, inv, user.ID); err != nil {
		return 0, err
	}
	return inv.OrgID, nil
}

func (s *Service) JoinByCode(ctx context.Context, token string, user model.User) (uint, error) {
	code := normalizeJoinCode(token)
	if code == "" {
		return 0, ErrInvalidCode
	}
	return s.repo.JoinByCode(ctx, code, user)
}

func (s *Service) ListGroups(ctx context.Context, orgID uint) ([]model.UserGroup, error) {
	return s.repo.ListGroups(ctx, orgID)
}

func (s *Service) CreateGroup(ctx context.Context, caller model.OrganizationMember, input GroupInput) (model.UserGroup, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.UserGroup{}, ErrForbidden
	}
	group := model.UserGroup{OrgID: caller.OrgID, Name: input.Name}
	return s.repo.CreateGroup(ctx, group)
}

func (s *Service) AddGroupMember(ctx context.Context, caller model.OrganizationMember, groupID uint, userID uint) (model.UserGroupMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.UserGroupMember{}, ErrForbidden
	}
	gm := model.UserGroupMember{GroupID: groupID, UserID: userID}
	return s.repo.CreateGroupMember(ctx, gm)
}

func (s *Service) RemoveGroupMember(ctx context.Context, caller model.OrganizationMember, groupID uint, userID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteGroupMember(ctx, groupID, userID)
}

func (s *Service) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	return s.repo.GetUsage(ctx, orgID)
}

func (s *Service) CreatePersonalOrg(ctx context.Context, user *model.User) error {
	return s.repo.CreatePersonalOrg(ctx, user)
}

type OrgWithRole struct {
	model.Organization
	Role string `json:"role"`
}

type RegistrationInput struct {
	Username string
	Password string
}

func IsAdminOrAbove(role string) bool {
	return domainorg.IsAdminOrAbove(role)
}

func generateInviteToken() (string, error) {
	return domainorg.GenerateInviteToken()
}

func GenerateJoinCode() (string, error) {
	return domainorg.GenerateJoinCode()
}

func normalizeJoinCode(value string) string {
	return domainorg.NormalizeJoinCode(value)
}
