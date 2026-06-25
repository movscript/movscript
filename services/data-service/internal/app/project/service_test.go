package project

import (
	"context"
	"errors"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCreateBuildsOwnerMemberWithoutPanic(t *testing.T) {
	db := testutil.OpenPostgresDryRun(t)
	orgID := uint(3)
	service := NewService(db)

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("Create panicked: %v", recovered)
		}
	}()

	project, err := service.Create(context.Background(), CreateInput{
		Name:          "Film",
		Description:   "desc",
		TotalEpisodes: 12,
	}, 7, &orgID)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if project.Name != "Film" || project.OwnerID != 7 || project.OrgID == nil || *project.OrgID != orgID {
		t.Fatalf("unexpected project: %+v", project)
	}
}

func TestAdminListFiltersAndPaginatesProjects(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	otherOwner := createProjectUser(t, db, "other")
	orgID := uint(10)
	alpha := createProjectRecord(t, db, "Alpha Film", "pilot", owner.ID, &orgID)
	createProjectRecord(t, db, "Beta Cut", "editorial", otherOwner.ID, nil)
	createProjectRecord(t, db, "Alpha Second", "follow-up", owner.ID, &orgID)

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID: {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	page, err := service.AdminList(context.Background(), AdminListFilter{
		Query:    "alpha",
		OwnerID:  &owner.ID,
		OrgID:    &orgID,
		Page:     1,
		PageSize: 1,
	})
	if err != nil {
		t.Fatalf("AdminList returned error: %v", err)
	}
	if page.Total != 2 || len(page.Items) != 1 {
		t.Fatalf("unexpected page: total=%d len=%d items=%+v", page.Total, len(page.Items), page.Items)
	}
	if page.Items[0].Owner == nil || page.Items[0].Owner.ID != owner.ID {
		t.Fatalf("owner not preloaded: %+v", page.Items[0])
	}

	projectPage, err := service.AdminList(context.Background(), AdminListFilter{
		ProjectID: &alpha.ID,
		Page:      1,
		PageSize:  50,
	})
	if err != nil {
		t.Fatalf("AdminList with project id returned error: %v", err)
	}
	if projectPage.Total != 1 || len(projectPage.Items) != 1 || projectPage.Items[0].ID != alpha.ID {
		t.Fatalf("project id filter returned %+v", projectPage)
	}
}

func TestAdminCreateCreatesProjectWithOwnerMemberAndValidatesInputs(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	orgID := uint(12)

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID: {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
		orgs: map[uint]authidentity.Organization{
			orgID: {ID: orgID, Name: "Team", Slug: "team", Plan: "team", Status: domainorg.StatusActive, CreatedBy: owner.ID},
		},
	})
	created, err := service.AdminCreate(context.Background(), AdminCreateInput{
		Name:          "  Admin Film  ",
		Description:   "created by admin",
		OwnerID:       owner.ID,
		OrgID:         &orgID,
		TotalEpisodes: 8,
	})
	if err != nil {
		t.Fatalf("AdminCreate returned error: %v", err)
	}
	if created.Name != "Admin Film" || created.OwnerID != owner.ID || created.OrgID == nil || *created.OrgID != orgID {
		t.Fatalf("unexpected created project: %+v", created)
	}
	var member persistencemodel.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", created.ID, owner.ID).First(&member).Error; err != nil {
		t.Fatalf("expected owner member: %v", err)
	}
	if member.Role != "owner" {
		t.Fatalf("owner member role = %q, want owner", member.Role)
	}

	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Missing Owner", OwnerID: 999}); !errors.Is(err, ErrOwnerNotFound) {
		t.Fatalf("missing owner err = %v, want ErrOwnerNotFound", err)
	}
	disabledOwner := createProjectUserWithStatus(t, db, "disabled-owner", "disabled")
	service.identity = fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:         {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
			disabledOwner.ID: {ID: disabledOwner.ID, Username: disabledOwner.Username, SystemRole: domainidentity.SystemRoleUser, Status: "disabled"},
		},
	}
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Disabled Owner", OwnerID: disabledOwner.ID}); !errors.Is(err, ErrOwnerInactive) {
		t.Fatalf("disabled owner err = %v, want ErrOwnerInactive", err)
	}
	missingOrgID := uint(999)
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Missing Org", OwnerID: owner.ID, OrgID: &missingOrgID}); !errors.Is(err, ErrProjectOrgNotFound) {
		t.Fatalf("missing org err = %v, want ErrProjectOrgNotFound", err)
	}
	suspendedOrgID := uint(30)
	service.identity = fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID: {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
		orgs: map[uint]authidentity.Organization{
			suspendedOrgID: {ID: suspendedOrgID, Name: "Suspended", Slug: "suspended", Plan: "team", Status: domainorg.StatusSuspended, CreatedBy: owner.ID},
		},
	}
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Suspended Org", OwnerID: owner.ID, OrgID: &suspendedOrgID}); !errors.Is(err, ErrProjectOrgInactive) {
		t.Fatalf("suspended org err = %v, want ErrProjectOrgInactive", err)
	}
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "  ", OwnerID: owner.ID}); !errors.Is(err, ErrInvalidProjectName) {
		t.Fatalf("blank name err = %v, want ErrInvalidProjectName", err)
	}
}

func TestForceSetOwnerRejectsInactiveOwner(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	disabledOwner := createProjectUserWithStatus(t, db, "disabled-owner", "disabled")
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, nil)

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			disabledOwner.ID: {ID: disabledOwner.ID, Username: disabledOwner.Username, SystemRole: domainidentity.SystemRoleUser, Status: "disabled"},
		},
	})
	if _, err := service.ForceSetOwner(context.Background(), project.ID, disabledOwner.ID); !errors.Is(err, ErrOwnerInactive) {
		t.Fatalf("ForceSetOwner disabled owner err = %v, want ErrOwnerInactive", err)
	}
	var persisted persistencemodel.Project
	if err := db.First(&persisted, project.ID).Error; err != nil {
		t.Fatalf("load project: %v", err)
	}
	if persisted.OwnerID != owner.ID {
		t.Fatalf("owner changed to %d, want %d", persisted.OwnerID, owner.ID)
	}
}

func TestAdminUpdateValidatesAndUpdatesProjectName(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, nil)

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID: {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	name := "  Final Cut  "
	updated, err := service.AdminUpdate(context.Background(), project.ID, AdminUpdateInput{Name: &name})
	if err != nil {
		t.Fatalf("AdminUpdate returned error: %v", err)
	}
	if updated.Name != "Final Cut" {
		t.Fatalf("unexpected updated project: %+v", updated)
	}
	if updated.Owner == nil || updated.Owner.ID != owner.ID {
		t.Fatalf("owner not preloaded after update: %+v", updated)
	}

	blankName := " "
	if _, err := service.AdminUpdate(context.Background(), project.ID, AdminUpdateInput{Name: &blankName}); !errors.Is(err, ErrInvalidProjectName) {
		t.Fatalf("blank name err = %v, want ErrInvalidProjectName", err)
	}
	if _, err := service.AdminUpdate(context.Background(), project.ID, AdminUpdateInput{}); !errors.Is(err, ErrNoProjectFieldsToUpdate) {
		t.Fatalf("empty update err = %v, want ErrNoProjectFieldsToUpdate", err)
	}
}

func TestAdminDetailReturnsProjectOperationalSummary(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-admin-detail.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	owner := createProjectUser(t, db, "detail-owner")
	project := createProjectRecord(t, db, "Detail Film", "desc", owner.ID, nil)
	if err := db.Create(&persistencemodel.UsageLog{UserID: owner.ID, ProjectID: &project.ID, RuntimeModelID: 1, OperationType: "image", InputTokens: 5, OutputTokens: 7, ImageCount: 2, Cost: 3.5}).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{ProjectID: &project.ID, Action: "project.admin_updated", TargetType: "project", TargetID: "1"}).Error; err != nil {
		t.Fatalf("create audit: %v", err)
	}

	detail, err := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID: {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	}).AdminDetail(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("AdminDetail returned error: %v", err)
	}
	if detail.Project.ID != project.ID || detail.Project.Owner == nil || detail.Project.Owner.ID != owner.ID {
		t.Fatalf("unexpected project detail: %+v", detail.Project)
	}
	if detail.MemberCount != 1 {
		t.Fatalf("unexpected counts: %+v", detail)
	}
	if detail.Usage.Calls != 1 || detail.Usage.Cost != 3.5 || detail.Usage.InputTokens != 5 || detail.Usage.OutputTokens != 7 || detail.Usage.Images != 2 {
		t.Fatalf("unexpected usage summary: %+v", detail.Usage)
	}
	if detail.Audit.Records != 1 || detail.Audit.LastAction != "project.admin_updated" || detail.Audit.LastAt == nil {
		t.Fatalf("unexpected audit summary: %+v", detail.Audit)
	}

	if _, err := NewService(db).AdminDetail(context.Background(), 999); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("missing project error = %v, want ErrProjectNotFound", err)
	}
}

func TestDeleteMissingProjectReturnsNotFound(t *testing.T) {
	db := newProjectTestDB(t)
	service := NewService(db)
	if err := service.Delete(context.Background(), 404, nil); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("Delete err = %v, want ErrProjectNotFound", err)
	}
}

func TestListMembersIncludesUserProfile(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	memberUser := createProjectUser(t, db, "member")
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, nil)
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: memberUser.ID, Role: "director"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:      {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
			memberUser.ID: {ID: memberUser.ID, Username: memberUser.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	members, err := service.ListMembers(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("ListMembers returned error: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("member count = %d, want 2: %+v", len(members), members)
	}
	var found bool
	for _, item := range members {
		if item.UserID == memberUser.ID {
			found = item.User != nil && item.User.Username == "member" && item.Role == "director"
		}
	}
	if !found {
		t.Fatalf("director member with user profile not found: %+v", members)
	}
}

func TestUpdateAndRemoveMemberProtectsProjectOwner(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	memberUser := createProjectUser(t, db, "member")
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, nil)
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: memberUser.ID, Role: "director"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:      {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
			memberUser.ID: {ID: memberUser.ID, Username: memberUser.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	updated, err := service.UpdateMemberRole(context.Background(), project.ID, member.ID, "writer", nil)
	if err != nil {
		t.Fatalf("UpdateMemberRole returned error: %v", err)
	}
	if updated.Role != "writer" || updated.User == nil || updated.User.Username != "member" {
		t.Fatalf("unexpected updated member: %+v", updated)
	}

	var ownerMember persistencemodel.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", project.ID, owner.ID).First(&ownerMember).Error; err != nil {
		t.Fatalf("load owner member: %v", err)
	}
	if _, err := service.UpdateMemberRole(context.Background(), project.ID, ownerMember.ID, "viewer", nil); !errors.Is(err, ErrProjectOwnerMemberLocked) {
		t.Fatalf("update owner member err = %v, want ErrProjectOwnerMemberLocked", err)
	}
	if err := service.RemoveMember(context.Background(), project.ID, ownerMember.ID, nil); !errors.Is(err, ErrProjectOwnerMemberLocked) {
		t.Fatalf("remove owner member err = %v, want ErrProjectOwnerMemberLocked", err)
	}
	if err := service.RemoveMember(context.Background(), project.ID, member.ID, nil); err != nil {
		t.Fatalf("remove non-owner member returned error: %v", err)
	}
	if err := service.RemoveMember(context.Background(), project.ID, member.ID, nil); !errors.Is(err, ErrProjectMemberNotFound) {
		t.Fatalf("remove missing member err = %v, want ErrProjectMemberNotFound", err)
	}
}

func TestAddMemberValidatesUserRoleAndUpdatesExisting(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	memberUser := createProjectUser(t, db, "member")
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, nil)

	service := NewServiceWithIdentity(db, fakeProjectIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:      {ID: owner.ID, Username: owner.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
			memberUser.ID: {ID: memberUser.ID, Username: memberUser.Username, SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	member, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: memberUser.ID, Role: "writer"}, nil)
	if err != nil {
		t.Fatalf("AddMember returned error: %v", err)
	}
	if member.Role != "writer" || member.User == nil || member.User.Username != "member" {
		t.Fatalf("unexpected member: %+v", member)
	}
	updated, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: memberUser.ID, Role: "generator"}, nil)
	if err != nil {
		t.Fatalf("AddMember existing returned error: %v", err)
	}
	if updated.ID != member.ID || updated.Role != "generator" {
		t.Fatalf("existing member was not updated: before=%+v after=%+v", member, updated)
	}
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: memberUser.ID, Role: "owner"}, nil); !errors.Is(err, ErrInvalidProjectMemberRole) {
		t.Fatalf("invalid role err = %v, want ErrInvalidProjectMemberRole", err)
	}
	withoutLocalUser, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: 404, Role: "viewer"}, nil)
	if err != nil {
		t.Fatalf("AddMember without local user row returned error: %v", err)
	}
	if withoutLocalUser.UserID != 404 || withoutLocalUser.User != nil {
		t.Fatalf("member without local user row = %+v, want user_id only", withoutLocalUser)
	}
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: owner.ID, Role: "viewer"}, nil); !errors.Is(err, ErrProjectOwnerMemberLocked) {
		t.Fatalf("owner member err = %v, want ErrProjectOwnerMemberLocked", err)
	}
}

func TestAddMemberRequiresOrgMembershipWhenScoped(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-member-org-scope.db", &persistencemodel.Organization{}, &persistencemodel.Project{}, &persistencemodel.ProjectMember{})
	owner := createProjectUser(t, db, "owner")
	memberUser := createProjectUser(t, db, "member")
	org := persistencemodel.Organization{Name: "Team", Slug: "project-member-scope", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := createProjectRecord(t, db, "Film", "desc", owner.ID, &org.ID)

	service := NewService(db)
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: memberUser.ID, Role: "writer"}, &org.ID); err != nil {
		t.Fatalf("org member add returned error: %v", err)
	}
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: 404, Role: "viewer"}, &org.ID); err != nil {
		t.Fatalf("scoped AddMember without local membership row returned error: %v", err)
	}
}

func newProjectTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "project.db", &persistencemodel.Project{}, &persistencemodel.ProjectMember{})
}

func createProjectUser(t *testing.T, db *gorm.DB, username string) testutil.ExternalUser {
	t.Helper()
	return createProjectUserWithStatus(t, db, username, "active")
}

func createProjectUserWithStatus(t *testing.T, _ *gorm.DB, username string, status string) testutil.ExternalUser {
	t.Helper()
	nextProjectTestUserID++
	return testutil.NewExternalUserWithStatus(nextProjectTestUserID, username, status)
}

var nextProjectTestUserID uint = 100

type fakeProjectIdentity struct {
	profiles map[uint]domainidentity.UserProfile
	orgs     map[uint]authidentity.Organization
}

func (f fakeProjectIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	if profile, ok := f.profiles[userID]; ok {
		return profile, nil
	}
	return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
}

func (f fakeProjectIdentity) OrgMemberships(context.Context, uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func (f fakeProjectIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	if filter.OrgID != nil {
		org, ok := f.orgs[*filter.OrgID]
		if !ok {
			return authidentity.OrgPage{}, nil
		}
		return authidentity.OrgPage{Items: []authidentity.Organization{org}, Total: 1, Page: 1, PageSize: 1}, nil
	}
	items := make([]authidentity.Organization, 0, len(f.orgs))
	for _, org := range f.orgs {
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: 1, PageSize: len(items)}, nil
}

func createProjectRecord(t *testing.T, db *gorm.DB, name string, description string, ownerID uint, orgID *uint) persistencemodel.Project {
	t.Helper()
	project := persistencemodel.Project{Name: name, Description: description, OwnerID: ownerID, OrgID: orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project %q: %v", name, err)
	}
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: ownerID, Role: "owner"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}
	return project
}
