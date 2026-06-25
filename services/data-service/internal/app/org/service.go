package org

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("organization not found")
	ErrForbidden      = errors.New("organization permission denied")
	ErrConflict       = errors.New("organization conflict")
	ErrInvalidCode    = errors.New("organization code invalid")
	ErrSuspended      = errors.New("organization suspended")
	ErrPersonalOrg    = errors.New("personal organization cannot be managed as a team")
	ErrUserInactive   = errors.New("organization user inactive")
	ErrInvalidRole    = errors.New("organization role invalid")
	ErrLastOwner      = errors.New("organization must keep at least one owner")
	ErrInviteNotFound = errors.New("invitation not found")
	ErrInviteUsed     = errors.New("invitation already used")
	ErrInviteExpired  = errors.New("invitation expired")
)

type Service struct {
	repo     repository
	identity orgIdentity
}

type orgIdentity interface {
	authidentity.Reader
	ListOrgMembers(ctx context.Context, orgID uint) ([]authidentity.OrganizationMember, error)
	AddOrgMember(ctx context.Context, orgID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error)
	UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error)
	RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error)
}

func NewService(db *gorm.DB) *Service {
	return NewServiceWithIdentity(db, nil)
}

func NewServiceWithIdentity(db *gorm.DB, identity orgIdentity) *Service {
	return &Service{repo: &gormRepository{db: db}, identity: identity}
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
	return user.Status == "" || user.Status == domainidentity.UserStatusActive
}

func normalizeRole(role string) (string, error) {
	role = strings.TrimSpace(role)
	if role == "" {
		role = domainorg.RoleMember
	}
	if !domainorg.IsKnownRole(role) {
		return "", ErrInvalidRole
	}
	return role, nil
}

type CreateInput struct {
	Name string
	Slug string
}

type MemberInput struct {
	Role string
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

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error) {
	return s.repo.Create(ctx, ownerID, input)
}

func (s *Service) Get(ctx context.Context, orgID uint) (domainorg.Organization, error) {
	return s.repo.Get(ctx, orgID)
}

func (s *Service) Update(ctx context.Context, member domainorg.OrganizationMember, name string) error {
	if !IsAdminOrAbove(member.Role) {
		return ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, member.OrgID); err != nil {
		return err
	}
	return s.repo.UpdateName(ctx, member.OrgID, name)
}

func (s *Service) ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error) {
	if err := s.requireTeamOrg(ctx, orgID); err != nil {
		return nil, err
	}
	if s.identity == nil {
		return nil, ErrNotFound
	}
	members, err := s.identity.ListOrgMembers(ctx, orgID)
	if err != nil {
		return nil, s.authIdentityErr(err)
	}
	return membersFromIdentity(members), nil
}

func (s *Service) AddMember(ctx context.Context, caller domainorg.OrganizationMember, targetUser domainorg.User, input MemberInput) (domainorg.OrganizationMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.OrganizationMember{}, ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return domainorg.OrganizationMember{}, err
	}
	role, err := normalizeRole(input.Role)
	if err != nil {
		return domainorg.OrganizationMember{}, err
	}
	if role == domainorg.RoleOwner && caller.Role != domainorg.RoleOwner {
		return domainorg.OrganizationMember{}, ErrForbidden
	}
	if targetUser.ID == 0 {
		return domainorg.OrganizationMember{}, ErrNotFound
	}
	if !isActiveUser(targetUser) {
		return domainorg.OrganizationMember{}, ErrUserInactive
	}
	if s.identity == nil {
		return domainorg.OrganizationMember{}, ErrNotFound
	}
	created, err := s.identity.AddOrgMember(ctx, caller.OrgID, authidentity.OrgMemberInput{UserID: targetUser.ID, Role: role})
	if err != nil {
		return domainorg.OrganizationMember{}, s.authIdentityErr(err)
	}
	return memberFromIdentity(created), nil
}

func (s *Service) UpdateMember(ctx context.Context, caller domainorg.OrganizationMember, targetUserID uint, role string) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	if caller.UserID == targetUserID {
		return ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return err
	}
	nextRole, err := normalizeRole(role)
	if err != nil {
		return err
	}
	target, err := s.identityMember(ctx, caller.OrgID, targetUserID)
	if err != nil {
		return err
	}
	if (target.Role == domainorg.RoleOwner || nextRole == domainorg.RoleOwner) && caller.Role != domainorg.RoleOwner {
		return ErrForbidden
	}
	if target.Role == domainorg.RoleOwner && nextRole != domainorg.RoleOwner {
		if err := s.ensureOwnerCanBeChanged(ctx, caller.OrgID); err != nil {
			return err
		}
	}
	if s.identity == nil {
		return ErrNotFound
	}
	if _, err := s.identity.UpdateOrgMember(ctx, caller.OrgID, targetUserID, authidentity.OrgMemberInput{Role: nextRole}); err != nil {
		return s.authIdentityErr(err)
	}
	return nil
}

func (s *Service) RemoveMember(ctx context.Context, caller domainorg.OrganizationMember, targetUserID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	if caller.UserID == targetUserID {
		return ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return err
	}
	target, err := s.identityMember(ctx, caller.OrgID, targetUserID)
	if err != nil {
		return err
	}
	if target.Role == domainorg.RoleOwner {
		if caller.Role != domainorg.RoleOwner {
			return ErrForbidden
		}
		if err := s.ensureOwnerCanBeChanged(ctx, caller.OrgID); err != nil {
			return err
		}
	}
	if s.identity == nil {
		return ErrNotFound
	}
	removed, err := s.identity.RemoveOrgMember(ctx, caller.OrgID, targetUserID)
	if err != nil {
		return s.authIdentityErr(err)
	}
	if !removed {
		return ErrNotFound
	}
	return nil
}

func (s *Service) ListInvitations(ctx context.Context, caller domainorg.OrganizationMember) ([]domainorg.Invitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return nil, ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return nil, err
	}
	return s.repo.ListInvitations(ctx, caller.OrgID)
}

func (s *Service) CreateInvitation(ctx context.Context, caller domainorg.OrganizationMember, creatorID uint, input InvitationInput) (domainorg.Invitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.Invitation{}, ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return domainorg.Invitation{}, err
	}
	role, err := normalizeRole(input.Role)
	if err != nil {
		return domainorg.Invitation{}, err
	}
	if role == domainorg.RoleOwner && caller.Role != domainorg.RoleOwner {
		return domainorg.Invitation{}, ErrForbidden
	}
	token, err := generateInviteToken()
	if err != nil {
		return domainorg.Invitation{}, err
	}
	inv := domainorg.NewInvitation(caller.OrgID, token, role, input.Note, creatorID, time.Now().Add(7*24*time.Hour))
	return s.repo.CreateInvitation(ctx, inv)
}

func (s *Service) RevokeInvitation(ctx context.Context, caller domainorg.OrganizationMember, invID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return err
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

func (s *Service) AcceptInvitation(ctx context.Context, token string, user *domainorg.User) (uint, *domainorg.User, error) {
	inv, err := s.repo.FindInvitationByToken(ctx, token)
	if err != nil {
		return 0, nil, err
	}
	if inv.UsedAt != nil {
		return 0, nil, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return 0, nil, ErrInviteExpired
	}
	if err := s.requireActiveOrg(ctx, inv.OrgID); err != nil {
		return 0, nil, err
	}
	if err := s.requireTeamOrg(ctx, inv.OrgID); err != nil {
		return 0, nil, err
	}
	if user == nil {
		return 0, nil, ErrForbidden
	}
	if !isActiveUser(*user) {
		return 0, nil, ErrUserInactive
	}
	if err := s.addIdentityMember(ctx, inv.OrgID, user.ID, inv.Role); err != nil {
		if !errors.Is(err, ErrConflict) {
			return 0, nil, err
		}
	}
	if err := s.repo.AcceptInvitation(ctx, inv, user.ID); err != nil {
		return 0, nil, err
	}
	return inv.OrgID, user, nil
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

func (s *Service) requireTeamOrg(ctx context.Context, orgID uint) error {
	org, err := s.repo.Get(ctx, orgID)
	if err != nil {
		return err
	}
	if org.IsPersonal {
		return ErrPersonalOrg
	}
	return nil
}

func (s *Service) ensureOwnerCanBeChanged(ctx context.Context, orgID uint) error {
	count, err := s.countIdentityOwners(ctx, orgID)
	if err != nil {
		return err
	}
	if count <= 1 {
		return ErrLastOwner
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
	org, err := s.repo.FindByJoinCode(ctx, code)
	if err != nil {
		return 0, err
	}
	if org.Status == domainorg.StatusSuspended {
		return 0, ErrSuspended
	}
	if err := s.requireTeamOrg(ctx, org.ID); err != nil {
		return 0, err
	}
	if err := s.addIdentityMember(ctx, org.ID, user.ID, domainorg.RoleMember); err != nil && !errors.Is(err, ErrConflict) {
		return 0, err
	}
	return org.ID, nil
}

func (s *Service) ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error) {
	if err := s.requireTeamOrg(ctx, orgID); err != nil {
		return nil, err
	}
	groups, err := s.repo.ListGroups(ctx, orgID)
	if err != nil {
		return nil, err
	}
	s.enrichGroups(ctx, groups)
	return groups, nil
}

func (s *Service) CreateGroup(ctx context.Context, caller domainorg.OrganizationMember, input GroupInput) (domainorg.UserGroup, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.UserGroup{}, ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return domainorg.UserGroup{}, err
	}
	group := domainorg.NewUserGroup(caller.OrgID, input.Name)
	return s.repo.CreateGroup(ctx, group)
}

func (s *Service) AddGroupMember(ctx context.Context, caller domainorg.OrganizationMember, groupID uint, targetUser domainorg.User) (domainorg.UserGroupMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return domainorg.UserGroupMember{}, ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return domainorg.UserGroupMember{}, err
	}
	if err := s.requireGroupInCallerOrg(ctx, caller.OrgID, groupID); err != nil {
		return domainorg.UserGroupMember{}, err
	}
	if targetUser.ID == 0 {
		return domainorg.UserGroupMember{}, ErrNotFound
	}
	if !isActiveUser(targetUser) {
		return domainorg.UserGroupMember{}, ErrUserInactive
	}
	if _, err := s.identityMember(ctx, caller.OrgID, targetUser.ID); err != nil {
		return domainorg.UserGroupMember{}, err
	}
	gm := domainorg.GroupMember(groupID, targetUser.ID)
	created, err := s.repo.CreateGroupMember(ctx, gm)
	if err != nil {
		return domainorg.UserGroupMember{}, err
	}
	s.enrichGroupMember(ctx, &created)
	return created, nil
}

func (s *Service) RemoveGroupMember(ctx context.Context, caller domainorg.OrganizationMember, groupID uint, userID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	if err := s.requireTeamOrg(ctx, caller.OrgID); err != nil {
		return err
	}
	if err := s.requireGroupInCallerOrg(ctx, caller.OrgID, groupID); err != nil {
		return err
	}
	return s.repo.DeleteGroupMember(ctx, groupID, userID)
}

func (s *Service) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	if err := s.requireTeamOrg(ctx, orgID); err != nil {
		return UsageResult{}, err
	}
	return s.repo.GetUsage(ctx, orgID)
}

func (s *Service) requireGroupInCallerOrg(ctx context.Context, orgID uint, groupID uint) error {
	groupOrgID, err := s.repo.FindGroupOrgID(ctx, groupID)
	if err != nil {
		return err
	}
	if groupOrgID != orgID {
		return ErrForbidden
	}
	return nil
}

func (s *Service) userFromIdentity(ctx context.Context, userID uint) (domainorg.User, error) {
	if s.identity == nil {
		return domainorg.User{}, ErrNotFound
	}
	profile, err := s.identity.UserProfile(ctx, userID)
	if err != nil {
		if errors.Is(err, authidentity.ErrUserNotFound) {
			return domainorg.User{}, ErrNotFound
		}
		return domainorg.User{}, err
	}
	return userFromIdentityProfile(profile), nil
}

func (s *Service) identityMember(ctx context.Context, orgID uint, userID uint) (domainorg.OrganizationMember, error) {
	if s.identity == nil {
		return domainorg.OrganizationMember{}, ErrNotFound
	}
	members, err := s.identity.ListOrgMembers(ctx, orgID)
	if err != nil {
		return domainorg.OrganizationMember{}, s.authIdentityErr(err)
	}
	for _, member := range members {
		if member.UserID == userID {
			return memberFromIdentity(member), nil
		}
	}
	return domainorg.OrganizationMember{}, ErrNotFound
}

func (s *Service) countIdentityOwners(ctx context.Context, orgID uint) (int64, error) {
	if s.identity == nil {
		return 0, ErrNotFound
	}
	members, err := s.identity.ListOrgMembers(ctx, orgID)
	if err != nil {
		return 0, s.authIdentityErr(err)
	}
	var count int64
	for _, member := range members {
		if member.Role == domainorg.RoleOwner {
			count++
		}
	}
	return count, nil
}

func (s *Service) addIdentityMember(ctx context.Context, orgID uint, userID uint, role string) error {
	if s.identity == nil {
		return ErrNotFound
	}
	_, err := s.identity.AddOrgMember(ctx, orgID, authidentity.OrgMemberInput{UserID: userID, Role: role})
	return s.authIdentityErr(err)
}

func (s *Service) authIdentityErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, authidentity.ErrOrgNotFound), errors.Is(err, authidentity.ErrUserNotFound):
		return ErrNotFound
	case errors.Is(err, authidentity.ErrConflict):
		return ErrConflict
	case errors.Is(err, authidentity.ErrBadRequest):
		return ErrInvalidRole
	default:
		return err
	}
}

func (s *Service) enrichMembers(ctx context.Context, members []domainorg.OrganizationMember) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0, len(members))
	for _, member := range members {
		if member.UserID != 0 && member.User == nil {
			userIDs = append(userIDs, member.UserID)
		}
	}
	users := s.usersFromIdentity(ctx, userIDs)
	for i := range members {
		if members[i].User == nil {
			if user, ok := users[members[i].UserID]; ok {
				members[i].User = &user
			}
		}
	}
}

func (s *Service) enrichMember(ctx context.Context, member *domainorg.OrganizationMember) {
	if member == nil || member.User != nil || member.UserID == 0 || s.identity == nil {
		return
	}
	if user, ok := s.usersFromIdentity(ctx, []uint{member.UserID})[member.UserID]; ok {
		member.User = &user
	}
}

func (s *Service) enrichGroups(ctx context.Context, groups []domainorg.UserGroup) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0)
	for _, group := range groups {
		for _, member := range group.Members {
			if member.UserID != 0 && member.User == nil {
				userIDs = append(userIDs, member.UserID)
			}
		}
	}
	users := s.usersFromIdentity(ctx, userIDs)
	for i := range groups {
		for j := range groups[i].Members {
			if groups[i].Members[j].User == nil {
				if user, ok := users[groups[i].Members[j].UserID]; ok {
					groups[i].Members[j].User = &user
				}
			}
		}
	}
}

func (s *Service) enrichGroupMember(ctx context.Context, member *domainorg.UserGroupMember) {
	if member == nil || member.User != nil || member.UserID == 0 || s.identity == nil {
		return
	}
	if user, ok := s.usersFromIdentity(ctx, []uint{member.UserID})[member.UserID]; ok {
		member.User = &user
	}
}

func (s *Service) usersFromIdentity(ctx context.Context, userIDs []uint) map[uint]domainorg.User {
	out := make(map[uint]domainorg.User, len(userIDs))
	seen := make(map[uint]struct{}, len(userIDs))
	for _, userID := range userIDs {
		if userID == 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		user, err := s.userFromIdentity(ctx, userID)
		if err != nil {
			continue
		}
		out[userID] = user
	}
	return out
}

func userFromIdentityProfile(profile domainidentity.UserProfile) domainorg.User {
	return domainorg.User{
		ID:              profile.ID,
		Username:        profile.Username,
		SystemRole:      profile.SystemRole,
		PrimaryEmail:    profile.PrimaryEmail,
		PrimaryPhone:    profile.PrimaryPhone,
		DisplayName:     profile.DisplayName,
		AvatarURL:       profile.AvatarURL,
		Locale:          profile.Locale,
		Status:          profile.Status,
		EmailVerifiedAt: profile.EmailVerifiedAt,
		CreatedAt:       profile.CreatedAt,
		UpdatedAt:       profile.UpdatedAt,
	}
}

func memberFromIdentity(member authidentity.OrganizationMember) domainorg.OrganizationMember {
	out := domainorg.OrganizationMember{
		ID:     member.ID,
		OrgID:  member.OrgID,
		UserID: member.UserID,
		Role:   member.Role,
	}
	if member.User != nil {
		user := userFromIdentityProfile(*member.User)
		out.User = &user
	}
	return out
}

func membersFromIdentity(members []authidentity.OrganizationMember) []domainorg.OrganizationMember {
	out := make([]domainorg.OrganizationMember, 0, len(members))
	for _, member := range members {
		out = append(out, memberFromIdentity(member))
	}
	return out
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
