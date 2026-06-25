package identity

import (
	"context"
	"errors"
	"testing"

	domainauth "github.com/movscript/auth-service/internal/domain/auth"
	"golang.org/x/crypto/bcrypt"
)

type memoryDirectory struct {
	users       map[uint]domainauth.UserProfile
	memberships map[uint][]domainauth.OrgMembership
}

func (d memoryDirectory) UserProfile(_ context.Context, userID uint) (domainauth.UserProfile, bool, error) {
	profile, ok := d.users[userID]
	return profile, ok, nil
}

func (d memoryDirectory) OrgMemberships(_ context.Context, userID uint) ([]domainauth.OrgMembership, bool, error) {
	if _, ok := d.users[userID]; !ok {
		return nil, false, nil
	}
	return d.memberships[userID], true, nil
}

type memoryUserManager struct {
	memoryDirectory
	createWithPasswordInput CreateUserInput
	passwordHash            string
}

func (m *memoryUserManager) ListUsers(context.Context, ListUsersFilter) (UserPage, error) {
	return UserPage{}, nil
}

func (m *memoryUserManager) CreateUser(_ context.Context, input CreateUserInput) (domainauth.UserProfile, error) {
	return domainauth.UserProfile{ID: 9, Username: input.Username}, nil
}

func (m *memoryUserManager) CreateUserWithPassword(_ context.Context, input CreateUserInput, passwordHash string) (domainauth.UserProfile, error) {
	m.createWithPasswordInput = input
	m.passwordHash = passwordHash
	return domainauth.UserProfile{ID: 10, Username: input.Username}, nil
}

func (m *memoryUserManager) UpdateUser(context.Context, uint, UpdateUserSpec) (domainauth.UserProfile, error) {
	return domainauth.UserProfile{}, nil
}

func (m *memoryUserManager) SetUserPasswordHash(context.Context, uint, string) (domainauth.UserProfile, error) {
	return domainauth.UserProfile{}, nil
}

func (m *memoryUserManager) ListOrgs(context.Context, ListOrgsFilter) (OrgPage, error) {
	return OrgPage{}, nil
}

func (m *memoryUserManager) CreateOrg(context.Context, CreateOrgInput) (domainauth.Organization, error) {
	return domainauth.Organization{}, nil
}

func (m *memoryUserManager) UpdateOrg(context.Context, uint, UpdateOrgSpec) (domainauth.Organization, error) {
	return domainauth.Organization{}, nil
}

func (m *memoryUserManager) ListOrgMembers(context.Context, uint) ([]domainauth.OrganizationMember, error) {
	return nil, nil
}

func (m *memoryUserManager) AddOrgMember(context.Context, uint, OrgMemberInput) (domainauth.OrganizationMember, error) {
	return domainauth.OrganizationMember{}, nil
}

func (m *memoryUserManager) UpdateOrgMember(context.Context, uint, uint, string) (domainauth.OrganizationMember, error) {
	return domainauth.OrganizationMember{}, nil
}

func (m *memoryUserManager) RemoveOrgMember(context.Context, uint, uint) error {
	return nil
}

func TestUserProfile(t *testing.T) {
	service := NewService(memoryDirectory{users: map[uint]domainauth.UserProfile{
		7: {ID: 7, Username: "alice", SystemRole: "user", Status: "active"},
	}})

	profile, err := service.UserProfile(context.Background(), 7)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if profile.Username != "alice" {
		t.Fatalf("profile = %#v", profile)
	}
	if _, err := service.UserProfile(context.Background(), 8); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("missing user err = %v, want ErrUserNotFound", err)
	}
}

func TestOrgMemberships(t *testing.T) {
	service := NewService(memoryDirectory{
		users: map[uint]domainauth.UserProfile{7: {ID: 7, Username: "alice"}},
		memberships: map[uint][]domainauth.OrgMembership{
			7: {{OrgID: 3, OrgName: "Studio", OrgSlug: "studio", Role: "owner", Plan: "team", Status: "active"}},
		},
	})

	memberships, err := service.OrgMemberships(context.Background(), 7)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if len(memberships) != 1 || memberships[0].OrgID != 3 {
		t.Fatalf("memberships = %#v", memberships)
	}
	if _, err := service.OrgMemberships(context.Background(), 8); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("missing user err = %v, want ErrUserNotFound", err)
	}
}

func TestCreateUserWithPasswordHashesPasswordServerSide(t *testing.T) {
	manager := &memoryUserManager{}
	service := NewService(manager)
	email := "alice@example.com"

	created, err := service.CreateUserWithPassword(context.Background(), CreateUserWithPasswordInput{
		Username:    " alice ",
		Email:       &email,
		DisplayName: ptr(" Alice "),
		Password:    " secret-pass ",
	})
	if err != nil {
		t.Fatalf("CreateUserWithPassword returned error: %v", err)
	}
	if created.ID != 10 || manager.createWithPasswordInput.Username != "alice" {
		t.Fatalf("created = %#v input = %#v", created, manager.createWithPasswordInput)
	}
	if manager.passwordHash == "" || manager.passwordHash == "secret-pass" {
		t.Fatalf("password hash = %q, want generated bcrypt hash", manager.passwordHash)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(manager.passwordHash), []byte("secret-pass")); err != nil {
		t.Fatalf("password hash does not match original password: %v", err)
	}

	_, err = service.CreateUserWithPassword(context.Background(), CreateUserWithPasswordInput{Username: "bob", Password: " "})
	if !errors.Is(err, ErrInvalidPasswordHash) {
		t.Fatalf("empty password err = %v, want ErrInvalidPasswordHash", err)
	}
}

func ptr(value string) *string {
	return &value
}
