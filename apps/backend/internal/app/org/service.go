package org

import (
	"context"
	"errors"
	"strings"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("organization not found")
	ErrForbidden      = errors.New("organization permission denied")
	ErrConflict       = errors.New("organization conflict")
	ErrInvalidCode    = errors.New("organization code invalid")
	ErrSuspended      = errors.New("organization suspended")
	ErrUserInactive   = errors.New("organization user inactive")
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

func isActiveUser(user domainorg.User) bool {
	return user.Status == "" || user.Status == domainauth.UserStatusActive
}

type CreateInput struct {
	Name string
	Slug string
}

type MemberInput struct {
	UserID   uint
	Username string
	Role     string
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

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error) {
	return s.repo.Create(ctx, ownerID, input)
}

func (s *Service) Get(ctx context.Context, orgID uint) (domainorg.Organization, error) {
	return s.repo.Get(ctx, orgID)
}

func (s *Service) ResolveCurrentMember(ctx context.Context, userID uint, preferredOrgID *uint) (domainorg.OrganizationMember, bool, error) {
	members, err := s.repo.ListUserMembers(ctx, userID)
	if err != nil {
		return domainorg.OrganizationMember{}, false, err
	}
	if len(members) == 0 {
		user, err := s.repo.FindUserByID(ctx, userID)
		if err == nil {
			_ = s.CreatePersonalOrg(ctx, user)
			members, err = s.repo.ListUserMembers(ctx, userID)
		}
		if err != nil {
			return domainorg.OrganizationMember{}, false, err
		}
		if len(members) == 0 {
			return domainorg.OrganizationMember{}, false, nil
		}
	}

	if preferredOrgID != nil {
		for _, member := range members {
			if member.OrgID == *preferredOrgID {
				if err := s.requireActiveOrg(ctx, member.OrgID); err != nil {
					return domainorg.OrganizationMember{}, false, err
				}
				return member, true, nil
			}
		}
		return domainorg.OrganizationMember{}, false, ErrForbidden
	}

	if member, ok, err := s.repo.FindPersonalMember(ctx, userID); err != nil {
		return domainorg.OrganizationMember{}, false, err
	} else if ok {
		if err := s.requireActiveOrg(ctx, member.OrgID); err == nil {
			return member, true, nil
		} else if err != ErrSuspended {
			return domainorg.OrganizationMember{}, false, err
		}
	}
	for _, member := range members {
		if err := s.requireActiveOrg(ctx, member.OrgID); err == nil {
			return member, true, nil
		} else if err != ErrSuspended {
			return domainorg.OrganizationMember{}, false, err
		}
	}
	return domainorg.OrganizationMember{}, false, ErrSuspended
}

func (s *Service) GetMemberForUser(ctx context.Context, orgID uint, userID uint) (domainorg.OrganizationMember, error) {
	member, err := s.repo.FindUserMember(ctx, orgID, userID)
	if err != nil {
		return domainorg.OrganizationMember{}, err
	}
	if err := s.requireActiveOrg(ctx, member.OrgID); err != nil {
		return domainorg.OrganizationMember{}, err
	}
	return member, nil
}

func (s *Service) Update(ctx context.Context, member domainorg.OrganizationMember, name string) error {
	if !IsAdminOrAbove(member.Role) {
		return ErrForbidden
	}
	return s.repo.UpdateName(ctx, member.OrgID, name)
}

func (s *Service) ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error) {
	return s.repo.ListMembers(ctx, orgID)
}

func (s *Service) AddMember(ctx context.Context, caller domainorg.OrganizationMember, input MemberInput) (domainorg.OrganizationMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.OrganizationMember{}, ErrForbidden
	}
	if input.UserID == 0 && strings.TrimSpace(input.Username) != "" {
		user, err := s.repo.FindUserByUsername(ctx, input.Username)
		if err != nil {
			return domainorg.OrganizationMember{}, err
		}
		if !isActiveUser(user) {
			return domainorg.OrganizationMember{}, ErrUserInactive
		}
		input.UserID = user.ID
	}
	if input.UserID == 0 {
		return domainorg.OrganizationMember{}, ErrNotFound
	}
	user, err := s.repo.FindUserByID(ctx, input.UserID)
	if err != nil {
		return domainorg.OrganizationMember{}, err
	}
	if !isActiveUser(user) {
		return domainorg.OrganizationMember{}, ErrUserInactive
	}
	member := domainorg.Member(caller.OrgID, input.UserID, input.Role)
	return s.repo.CreateMember(ctx, member)
}

func (s *Service) UpdateMember(ctx context.Context, caller domainorg.OrganizationMember, targetUserID uint, role string) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.UpdateMemberRole(ctx, caller.OrgID, targetUserID, role)
}

func (s *Service) RemoveMember(ctx context.Context, caller domainorg.OrganizationMember, targetUserID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteMember(ctx, caller.OrgID, targetUserID)
}

func (s *Service) ListInvitations(ctx context.Context, caller domainorg.OrganizationMember) ([]domainorg.Invitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return nil, ErrForbidden
	}
	return s.repo.ListInvitations(ctx, caller.OrgID)
}

func (s *Service) CreateInvitation(ctx context.Context, caller domainorg.OrganizationMember, creatorID uint, input InvitationInput) (domainorg.Invitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.Invitation{}, ErrForbidden
	}
	token, err := generateInviteToken()
	if err != nil {
		return domainorg.Invitation{}, err
	}
	inv := domainorg.NewInvitation(caller.OrgID, token, input.Role, input.Note, creatorID, time.Now().Add(7*24*time.Hour))
	return s.repo.CreateInvitation(ctx, inv)
}

func (s *Service) RevokeInvitation(ctx context.Context, caller domainorg.OrganizationMember, invID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteInvitation(ctx, caller.OrgID, invID)
}

func (s *Service) GetInvitation(ctx context.Context, token string) (domainorg.Invitation, domainorg.Organization, error) {
	inv, err := s.repo.FindInvitationByToken(ctx, token)
	if err != nil {
		return inv, domainorg.Organization{}, err
	}
	if inv.UsedAt != nil {
		return inv, domainorg.Organization{}, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return inv, domainorg.Organization{}, ErrInviteExpired
	}
	org, err := s.repo.Get(ctx, inv.OrgID)
	if err != nil {
		return inv, domainorg.Organization{}, err
	}
	if org.Status == domainorg.StatusSuspended {
		return inv, domainorg.Organization{}, ErrSuspended
	}
	return inv, org, nil
}

func (s *Service) AcceptInvitation(ctx context.Context, token string, user *domainorg.User, registration *RegistrationInput) (uint, error) {
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
	if err := s.requireActiveOrg(ctx, inv.OrgID); err != nil {
		return 0, err
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
		registeredUser := domainauth.NewRegisteredUser(registration.Username, string(hash), "", false, nil)
		createdUser, err := s.repo.CreateUser(ctx, registeredUser)
		if err != nil {
			return 0, err
		}
		if err := s.repo.CreatePersonalOrg(ctx, createdUser); err != nil {
			// non-fatal
		}
		user = &createdUser
	} else if !isActiveUser(*user) {
		return 0, ErrUserInactive
	}
	if err := s.repo.AcceptInvitation(ctx, inv, user.ID); err != nil {
		return 0, err
	}
	return inv.OrgID, nil
}

func (s *Service) requireActiveOrg(ctx context.Context, orgID uint) error {
	org, err := s.repo.Get(ctx, orgID)
	if err != nil {
		return err
	}
	if org.Status == domainorg.StatusSuspended {
		return ErrSuspended
	}
	return nil
}

func (s *Service) JoinByCode(ctx context.Context, token string, user domainorg.User) (uint, error) {
	code := normalizeJoinCode(token)
	if code == "" {
		return 0, ErrInvalidCode
	}
	if !isActiveUser(user) {
		return 0, ErrUserInactive
	}
	return s.repo.JoinByCode(ctx, code, user.ID)
}

func (s *Service) ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error) {
	return s.repo.ListGroups(ctx, orgID)
}

func (s *Service) CreateGroup(ctx context.Context, caller domainorg.OrganizationMember, input GroupInput) (domainorg.UserGroup, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.UserGroup{}, ErrForbidden
	}
	group := domainorg.NewUserGroup(caller.OrgID, input.Name)
	return s.repo.CreateGroup(ctx, group)
}

func (s *Service) AddGroupMember(ctx context.Context, caller domainorg.OrganizationMember, groupID uint, userID uint) (domainorg.UserGroupMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.UserGroupMember{}, ErrForbidden
	}
	user, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return domainorg.UserGroupMember{}, err
	}
	if !isActiveUser(user) {
		return domainorg.UserGroupMember{}, ErrUserInactive
	}
	gm := domainorg.GroupMember(groupID, userID)
	return s.repo.CreateGroupMember(ctx, gm)
}

func (s *Service) RemoveGroupMember(ctx context.Context, caller domainorg.OrganizationMember, groupID uint, userID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.repo.DeleteGroupMember(ctx, groupID, userID)
}

func (s *Service) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	return s.repo.GetUsage(ctx, orgID)
}

func (s *Service) CreatePersonalOrg(ctx context.Context, user domainorg.User) error {
	return s.repo.CreatePersonalOrg(ctx, user)
}

type OrgWithRole struct {
	domainorg.Organization
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
