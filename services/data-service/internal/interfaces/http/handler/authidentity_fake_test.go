package handler

import (
	"context"
	"strings"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
)

type fakeAuthIdentityManager struct {
	nextUserID                  uint
	nextOrgID                   uint
	nextMemberID                uint
	createUserWithPasswordCalls int
	setPasswordHashCalls        int
	lastCreatedPassword         string
	users                       map[uint]domainidentity.UserProfile
	orgs                        map[uint]authidentity.Organization
	members                     map[uint]map[uint]authidentity.OrganizationMember
}

func newFakeAuthIdentityManager() *fakeAuthIdentityManager {
	return &fakeAuthIdentityManager{
		nextUserID:   1,
		nextOrgID:    1,
		nextMemberID: 1,
		users:        map[uint]domainidentity.UserProfile{},
		orgs:         map[uint]authidentity.Organization{},
		members:      map[uint]map[uint]authidentity.OrganizationMember{},
	}
}

func (m *fakeAuthIdentityManager) UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error) {
	user, ok := m.users[userID]
	if !ok {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	return user, nil
}

func (m *fakeAuthIdentityManager) OrgMemberships(ctx context.Context, userID uint) ([]authidentity.OrgMembership, error) {
	out := make([]authidentity.OrgMembership, 0)
	for orgID, members := range m.members {
		member, ok := members[userID]
		if !ok {
			continue
		}
		org := m.orgs[orgID]
		out = append(out, authidentity.OrgMembership{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Plan:       org.Plan,
			Status:     org.Status,
			Role:       member.Role,
		})
	}
	return out, nil
}

func (m *fakeAuthIdentityManager) ListUsers(ctx context.Context, filter authidentity.ListUsersFilter) (authidentity.UserPage, error) {
	items := make([]domainidentity.UserProfile, 0)
	for _, user := range m.users {
		if filter.UserID != nil && user.ID != *filter.UserID {
			continue
		}
		if filter.SystemRole != "" && user.SystemRole != filter.SystemRole {
			continue
		}
		if filter.Status != "" && user.Status != filter.Status {
			continue
		}
		if filter.Query != "" && !strings.Contains(user.Username, filter.Query) && !strings.Contains(user.DisplayName, filter.Query) {
			continue
		}
		items = append(items, user)
	}
	return authidentity.UserPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (m *fakeAuthIdentityManager) CreateUser(ctx context.Context, input authidentity.CreateUserInput) (domainidentity.UserProfile, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return domainidentity.UserProfile{}, authidentity.ErrBadRequest
	}
	for _, user := range m.users {
		if user.Username == username {
			return domainidentity.UserProfile{}, authidentity.ErrConflict
		}
	}
	role := domainidentity.SystemRoleUser
	if input.SystemRole != nil && strings.TrimSpace(*input.SystemRole) != "" {
		role = strings.TrimSpace(*input.SystemRole)
	}
	status := domainidentity.UserStatusActive
	if input.Status != nil && strings.TrimSpace(*input.Status) != "" {
		status = strings.TrimSpace(*input.Status)
	}
	displayName := ""
	if input.DisplayName != nil {
		displayName = strings.TrimSpace(*input.DisplayName)
	}
	user := domainidentity.UserProfile{
		ID:           m.nextUserID,
		Username:     username,
		SystemRole:   role,
		DisplayName:  displayName,
		PrimaryEmail: input.Email,
		Status:       status,
	}
	m.users[user.ID] = user
	m.nextUserID++
	return user, nil
}

func (m *fakeAuthIdentityManager) CreateUserWithPassword(ctx context.Context, input authidentity.CreateUserInput, password string) (domainidentity.UserProfile, error) {
	if strings.TrimSpace(password) == "" {
		return domainidentity.UserProfile{}, authidentity.ErrBadRequest
	}
	user, err := m.CreateUser(ctx, input)
	if err != nil {
		return domainidentity.UserProfile{}, err
	}
	m.createUserWithPasswordCalls++
	m.lastCreatedPassword = password
	return user, nil
}

func (m *fakeAuthIdentityManager) UpdateUser(ctx context.Context, userID uint, input authidentity.UpdateUserInput) (domainidentity.UserProfile, error) {
	user, ok := m.users[userID]
	if !ok {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	if input.SystemRole != nil {
		user.SystemRole = strings.TrimSpace(*input.SystemRole)
	}
	if input.Status != nil {
		user.Status = strings.TrimSpace(*input.Status)
	}
	if input.DisplayName != nil {
		user.DisplayName = strings.TrimSpace(*input.DisplayName)
	}
	if input.Email != nil {
		user.PrimaryEmail = input.Email
	}
	m.users[userID] = user
	return user, nil
}

func (m *fakeAuthIdentityManager) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error) {
	m.setPasswordHashCalls++
	user, ok := m.users[userID]
	if !ok {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	if strings.TrimSpace(passwordHash) == "" {
		return domainidentity.UserProfile{}, authidentity.ErrBadRequest
	}
	return user, nil
}

func (m *fakeAuthIdentityManager) ListOrgs(ctx context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range m.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		if filter.UserID != nil {
			if _, ok := m.members[org.ID][*filter.UserID]; !ok {
				continue
			}
		}
		if filter.Status != "" && org.Status != filter.Status {
			continue
		}
		if filter.Plan != "" && org.Plan != filter.Plan {
			continue
		}
		if filter.IsPersonal != nil && org.IsPersonal != *filter.IsPersonal {
			continue
		}
		if filter.Query != "" && !strings.Contains(org.Name, filter.Query) && !strings.Contains(org.Slug, filter.Query) {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (m *fakeAuthIdentityManager) CreateOrg(ctx context.Context, input authidentity.CreateOrgInput) (authidentity.Organization, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || input.CreatedBy == 0 {
		return authidentity.Organization{}, authidentity.ErrBadRequest
	}
	if _, ok := m.users[input.CreatedBy]; !ok {
		return authidentity.Organization{}, authidentity.ErrUserNotFound
	}
	slug := strings.TrimSpace(input.Slug)
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	}
	for _, org := range m.orgs {
		if org.Slug == slug {
			return authidentity.Organization{}, authidentity.ErrConflict
		}
	}
	plan := input.Plan
	if plan == "" {
		plan = "team"
	}
	status := input.Status
	if status == "" {
		status = "active"
	}
	org := authidentity.Organization{ID: m.nextOrgID, Name: name, Slug: slug, Plan: plan, Status: status, CreatedBy: input.CreatedBy}
	m.orgs[org.ID] = org
	m.nextOrgID++
	member, _ := m.AddOrgMember(ctx, org.ID, authidentity.OrgMemberInput{UserID: input.CreatedBy, Role: "owner"})
	member.Role = "owner"
	m.members[org.ID][input.CreatedBy] = member
	return org, nil
}

func (m *fakeAuthIdentityManager) UpdateOrg(ctx context.Context, orgID uint, input authidentity.UpdateOrgInput) (authidentity.Organization, error) {
	org, ok := m.orgs[orgID]
	if !ok {
		return authidentity.Organization{}, authidentity.ErrOrgNotFound
	}
	if input.Name == nil && input.Slug == nil && input.Plan == nil && input.Status == nil {
		return authidentity.Organization{}, authidentity.ErrBadRequest
	}
	if input.Name != nil {
		org.Name = strings.TrimSpace(*input.Name)
	}
	if input.Slug != nil {
		org.Slug = strings.TrimSpace(*input.Slug)
	}
	if input.Plan != nil {
		plan := strings.TrimSpace(*input.Plan)
		if plan != "personal" && plan != "team" {
			return authidentity.Organization{}, authidentity.ErrBadRequest
		}
		org.Plan = plan
	}
	if input.Status != nil {
		status := strings.TrimSpace(*input.Status)
		if status != "active" && status != "suspended" {
			return authidentity.Organization{}, authidentity.ErrBadRequest
		}
		org.Status = status
	}
	m.orgs[orgID] = org
	return org, nil
}

func (m *fakeAuthIdentityManager) ListOrgMembers(ctx context.Context, orgID uint) ([]authidentity.OrganizationMember, error) {
	if _, ok := m.orgs[orgID]; !ok {
		return nil, authidentity.ErrOrgNotFound
	}
	members := make([]authidentity.OrganizationMember, 0)
	for _, member := range m.members[orgID] {
		members = append(members, member)
	}
	return members, nil
}

func (m *fakeAuthIdentityManager) AddOrgMember(ctx context.Context, orgID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	if _, ok := m.orgs[orgID]; !ok {
		return authidentity.OrganizationMember{}, authidentity.ErrOrgNotFound
	}
	user, ok := m.users[input.UserID]
	if !ok {
		return authidentity.OrganizationMember{}, authidentity.ErrUserNotFound
	}
	if m.members[orgID] == nil {
		m.members[orgID] = map[uint]authidentity.OrganizationMember{}
	}
	if _, ok := m.members[orgID][input.UserID]; ok {
		return authidentity.OrganizationMember{}, authidentity.ErrConflict
	}
	role := strings.TrimSpace(input.Role)
	if role == "" {
		role = "member"
	}
	if !fakeValidOrgRole(role) {
		return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
	}
	member := authidentity.OrganizationMember{ID: m.nextMemberID, OrgID: orgID, UserID: input.UserID, Role: role, User: &user}
	m.members[orgID][input.UserID] = member
	m.nextMemberID++
	return member, nil
}

func (m *fakeAuthIdentityManager) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	member, ok := m.members[orgID][userID]
	if !ok {
		return authidentity.OrganizationMember{}, authidentity.ErrOrgNotFound
	}
	role := strings.TrimSpace(input.Role)
	if !fakeValidOrgRole(role) {
		return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
	}
	if member.Role == "owner" && role != "owner" && !m.fakeHasOtherOwner(orgID, userID) {
		return authidentity.OrganizationMember{}, authidentity.ErrConflict
	}
	member.Role = role
	m.members[orgID][userID] = member
	return member, nil
}

func (m *fakeAuthIdentityManager) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error) {
	member, ok := m.members[orgID][userID]
	if !ok {
		return false, authidentity.ErrOrgNotFound
	}
	if member.Role == "owner" && !m.fakeHasOtherOwner(orgID, userID) {
		return false, authidentity.ErrConflict
	}
	delete(m.members[orgID], userID)
	return true, nil
}

func (m *fakeAuthIdentityManager) fakeHasOtherOwner(orgID uint, userID uint) bool {
	for candidateUserID, member := range m.members[orgID] {
		if candidateUserID != userID && member.Role == "owner" {
			return true
		}
	}
	return false
}

func fakeValidOrgRole(role string) bool {
	switch role {
	case "owner", "admin", "member", "viewer":
		return true
	default:
		return false
	}
}
