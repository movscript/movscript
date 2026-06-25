package authidentity

import (
	"context"
	"strings"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
)

const (
	LocalOwnerUserID   uint = 1
	LocalWorkspaceID   uint = 1
	LocalOwnerMemberID uint = 1
)

type LocalOwnerOptions struct {
	Username      string
	SystemRole    string
	WorkspaceName string
	WorkspaceSlug string
}

type LocalOwnerManager struct {
	user       domainidentity.UserProfile
	org        Organization
	membership OrganizationMember
}

func NewLocalOwnerManager(options LocalOwnerOptions) *LocalOwnerManager {
	username := strings.TrimSpace(options.Username)
	if username == "" {
		username = "local-owner"
	}
	workspaceName := strings.TrimSpace(options.WorkspaceName)
	if workspaceName == "" {
		workspaceName = "Local Workspace"
	}
	workspaceSlug := strings.TrimSpace(options.WorkspaceSlug)
	if workspaceSlug == "" {
		workspaceSlug = "local-workspace"
	}
	systemRole := strings.TrimSpace(options.SystemRole)
	if systemRole == "" {
		systemRole = domainidentity.SystemRoleUser
	}
	user := domainidentity.UserProfile{
		ID:         LocalOwnerUserID,
		Username:   username,
		SystemRole: systemRole,
		Status:     domainidentity.UserStatusActive,
	}
	org := Organization{
		ID:         LocalWorkspaceID,
		Name:       workspaceName,
		Slug:       workspaceSlug,
		IsPersonal: false,
		Plan:       "team",
		Status:     "active",
		CreatedBy:  LocalOwnerUserID,
	}
	return &LocalOwnerManager{
		user: user,
		org:  org,
		membership: OrganizationMember{
			ID:     LocalOwnerMemberID,
			OrgID:  LocalWorkspaceID,
			UserID: LocalOwnerUserID,
			Role:   "owner",
			User:   &user,
		},
	}
}

func (m *LocalOwnerManager) UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error) {
	if userID != m.user.ID {
		return domainidentity.UserProfile{}, ErrUserNotFound
	}
	return m.user, nil
}

func (m *LocalOwnerManager) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembership, error) {
	if userID != m.user.ID {
		return nil, ErrUserNotFound
	}
	return []OrgMembership{{
		OrgID:      m.org.ID,
		OrgName:    m.org.Name,
		OrgSlug:    m.org.Slug,
		IsPersonal: m.org.IsPersonal,
		Plan:       m.org.Plan,
		Status:     m.org.Status,
		Role:       m.membership.Role,
	}}, nil
}

func (m *LocalOwnerManager) ListUsers(ctx context.Context, filter ListUsersFilter) (UserPage, error) {
	if filter.UserID != nil && *filter.UserID != m.user.ID {
		return UserPage{Items: []domainidentity.UserProfile{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.SystemRole != "" && filter.SystemRole != m.user.SystemRole {
		return UserPage{Items: []domainidentity.UserProfile{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.Status != "" && filter.Status != m.user.Status {
		return UserPage{Items: []domainidentity.UserProfile{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if query := strings.TrimSpace(filter.Query); query != "" && !strings.Contains(m.user.Username, query) && !strings.Contains(m.user.DisplayName, query) {
		return UserPage{Items: []domainidentity.UserProfile{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	return UserPage{Items: []domainidentity.UserProfile{m.user}, Total: 1, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (m *LocalOwnerManager) CreateUser(ctx context.Context, input CreateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, ErrBadRequest
}

func (m *LocalOwnerManager) CreateUserWithPassword(ctx context.Context, input CreateUserInput, password string) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, ErrBadRequest
}

func (m *LocalOwnerManager) UpdateUser(ctx context.Context, userID uint, input UpdateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, ErrBadRequest
}

func (m *LocalOwnerManager) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, ErrBadRequest
}

func (m *LocalOwnerManager) ListOrgs(ctx context.Context, filter ListOrgsFilter) (OrgPage, error) {
	if filter.OrgID != nil && *filter.OrgID != m.org.ID {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.UserID != nil && *filter.UserID != m.user.ID {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.Status != "" && filter.Status != m.org.Status {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.Plan != "" && filter.Plan != m.org.Plan {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if filter.IsPersonal != nil && *filter.IsPersonal != m.org.IsPersonal {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	if query := strings.TrimSpace(filter.Query); query != "" && !strings.Contains(m.org.Name, query) && !strings.Contains(m.org.Slug, query) {
		return OrgPage{Items: []Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
	}
	return OrgPage{Items: []Organization{m.org}, Total: 1, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (m *LocalOwnerManager) CreateOrg(ctx context.Context, input CreateOrgInput) (Organization, error) {
	return Organization{}, ErrBadRequest
}

func (m *LocalOwnerManager) UpdateOrg(ctx context.Context, orgID uint, input UpdateOrgInput) (Organization, error) {
	return Organization{}, ErrBadRequest
}

func (m *LocalOwnerManager) ListOrgMembers(ctx context.Context, orgID uint) ([]OrganizationMember, error) {
	if orgID != m.org.ID {
		return nil, ErrOrgNotFound
	}
	return []OrganizationMember{m.membership}, nil
}

func (m *LocalOwnerManager) AddOrgMember(ctx context.Context, orgID uint, input OrgMemberInput) (OrganizationMember, error) {
	return OrganizationMember{}, ErrBadRequest
}

func (m *LocalOwnerManager) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input OrgMemberInput) (OrganizationMember, error) {
	return OrganizationMember{}, ErrBadRequest
}

func (m *LocalOwnerManager) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error) {
	return false, ErrBadRequest
}
