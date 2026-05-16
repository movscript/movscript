package project

import (
	"context"
	"errors"
	"testing"

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
	createProjectRecord(t, db, "Alpha Film", "pilot", "planning", owner.ID, &orgID)
	createProjectRecord(t, db, "Beta Cut", "editorial", "editing", otherOwner.ID, nil)
	createProjectRecord(t, db, "Alpha Second", "follow-up", "planning", owner.ID, &orgID)

	service := NewService(db)
	page, err := service.AdminList(context.Background(), AdminListFilter{
		Query:    "alpha",
		Status:   "planning",
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
}

func TestAdminCreateCreatesProjectWithOwnerMemberAndValidatesInputs(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-admin-create.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.Project{}, &persistencemodel.ProjectMember{})
	owner := createProjectUser(t, db, "owner")
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}

	service := NewService(db)
	created, err := service.AdminCreate(context.Background(), AdminCreateInput{
		Name:          "  Admin Film  ",
		Description:   "created by admin",
		OwnerID:       owner.ID,
		OrgID:         &org.ID,
		TotalEpisodes: 8,
	})
	if err != nil {
		t.Fatalf("AdminCreate returned error: %v", err)
	}
	if created.Name != "Admin Film" || created.OwnerID != owner.ID || created.Status != "planning" || created.OrgID == nil || *created.OrgID != org.ID {
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
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Disabled Owner", OwnerID: disabledOwner.ID}); !errors.Is(err, ErrOwnerInactive) {
		t.Fatalf("disabled owner err = %v, want ErrOwnerInactive", err)
	}
	missingOrgID := uint(999)
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Missing Org", OwnerID: owner.ID, OrgID: &missingOrgID}); !errors.Is(err, ErrProjectOrgNotFound) {
		t.Fatalf("missing org err = %v, want ErrProjectOrgNotFound", err)
	}
	suspendedOrg := persistencemodel.Organization{Name: "Suspended", Slug: "suspended", Plan: "team", Status: "suspended", CreatedBy: owner.ID}
	if err := db.Create(&suspendedOrg).Error; err != nil {
		t.Fatalf("create suspended org: %v", err)
	}
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Suspended Org", OwnerID: owner.ID, OrgID: &suspendedOrg.ID}); !errors.Is(err, ErrProjectOrgInactive) {
		t.Fatalf("suspended org err = %v, want ErrProjectOrgInactive", err)
	}
	badStatus := "archived"
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "Bad", OwnerID: owner.ID, Status: badStatus}); !errors.Is(err, ErrInvalidProjectStatus) {
		t.Fatalf("invalid status err = %v, want ErrInvalidProjectStatus", err)
	}
	if _, err := service.AdminCreate(context.Background(), AdminCreateInput{Name: "  ", OwnerID: owner.ID}); !errors.Is(err, ErrInvalidProjectName) {
		t.Fatalf("blank name err = %v, want ErrInvalidProjectName", err)
	}
}

func TestForceSetOwnerRejectsInactiveOwner(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	disabledOwner := createProjectUserWithStatus(t, db, "disabled-owner", "disabled")
	project := createProjectRecord(t, db, "Film", "desc", "planning", owner.ID, nil)

	service := NewService(db)
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

func TestAdminUpdateValidatesAndUpdatesProjectNameAndStatus(t *testing.T) {
	db := newProjectTestDB(t)
	owner := createProjectUser(t, db, "owner")
	project := createProjectRecord(t, db, "Film", "desc", "planning", owner.ID, nil)

	service := NewService(db)
	name := "  Final Cut  "
	status := " EDITING "
	updated, err := service.AdminUpdate(context.Background(), project.ID, AdminUpdateInput{Name: &name, Status: &status})
	if err != nil {
		t.Fatalf("AdminUpdate returned error: %v", err)
	}
	if updated.Name != "Final Cut" || updated.Status != "editing" {
		t.Fatalf("unexpected updated project: %+v", updated)
	}
	if updated.Owner == nil || updated.Owner.ID != owner.ID {
		t.Fatalf("owner not preloaded after update: %+v", updated)
	}

	badStatus := "archived"
	if _, err := service.AdminUpdate(context.Background(), project.ID, AdminUpdateInput{Status: &badStatus}); !errors.Is(err, ErrInvalidProjectStatus) {
		t.Fatalf("invalid status err = %v, want ErrInvalidProjectStatus", err)
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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.Script{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	owner := createProjectUser(t, db, "detail-owner")
	project := createProjectRecord(t, db, "Detail Film", "desc", "planning", owner.ID, nil)
	if err := db.Create(&persistencemodel.Script{ProjectID: project.ID, Title: "Script", AuthorID: owner.ID}).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Create(&persistencemodel.ContentUnit{ProjectID: project.ID, Kind: "shot", Title: "Shot"}).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if err := db.Create(&persistencemodel.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Hero", Status: "missing"}).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}
	resource := persistencemodel.RawResource{Name: "Asset", OwnerID: owner.ID, Type: "image", FilePath: "asset.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&persistencemodel.ResourceBinding{ProjectID: project.ID, ResourceID: resource.ID, OwnerType: "asset_slot", OwnerID: 1, Role: "reference"}).Error; err != nil {
		t.Fatalf("create resource binding: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: owner.ID, ProjectID: &project.ID, AIModelConfigID: 1, OperationType: "image", InputTokens: 5, OutputTokens: 7, ImageCount: 2, Cost: 3.5}).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{ProjectID: &project.ID, Action: "project.admin_updated", TargetType: "project", TargetID: "1"}).Error; err != nil {
		t.Fatalf("create audit: %v", err)
	}

	detail, err := NewService(db).AdminDetail(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("AdminDetail returned error: %v", err)
	}
	if detail.Project.ID != project.ID || detail.Project.Owner == nil || detail.Project.Owner.ID != owner.ID {
		t.Fatalf("unexpected project detail: %+v", detail.Project)
	}
	if detail.MemberCount != 1 || detail.ScriptCount != 1 || detail.ContentUnitCount != 1 || detail.AssetSlotCount != 1 || detail.ResourceCount != 1 {
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
	project := createProjectRecord(t, db, "Film", "desc", "planning", owner.ID, nil)
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: memberUser.ID, Role: "director"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}

	service := NewService(db)
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
	project := createProjectRecord(t, db, "Film", "desc", "planning", owner.ID, nil)
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: memberUser.ID, Role: "director"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}

	service := NewService(db)
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
	project := createProjectRecord(t, db, "Film", "desc", "planning", owner.ID, nil)

	service := NewService(db)
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
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: 404, Role: "viewer"}, nil); !errors.Is(err, ErrMemberUserNotFound) {
		t.Fatalf("missing user err = %v, want ErrMemberUserNotFound", err)
	}
	disabledMember := createProjectUserWithStatus(t, db, "disabled-member", "disabled")
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: disabledMember.ID, Role: "viewer"}, nil); !errors.Is(err, ErrMemberUserInactive) {
		t.Fatalf("disabled member err = %v, want ErrMemberUserInactive", err)
	}
	if _, err := service.AddMember(context.Background(), project.ID, MemberInput{UserID: owner.ID, Role: "viewer"}, nil); !errors.Is(err, ErrProjectOwnerMemberLocked) {
		t.Fatalf("owner member err = %v, want ErrProjectOwnerMemberLocked", err)
	}
}

func newProjectTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "project.db", &persistencemodel.User{}, &persistencemodel.Project{}, &persistencemodel.ProjectMember{})
}

func createProjectUser(t *testing.T, db *gorm.DB, username string) persistencemodel.User {
	t.Helper()
	return createProjectUserWithStatus(t, db, username, "active")
}

func createProjectUserWithStatus(t *testing.T, db *gorm.DB, username string, status string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, PasswordHash: "hash", Status: status}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return user
}

func createProjectRecord(t *testing.T, db *gorm.DB, name string, description string, status string, ownerID uint, orgID *uint) persistencemodel.Project {
	t.Helper()
	project := persistencemodel.Project{Name: name, Description: description, Status: status, OwnerID: ownerID, OrgID: orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project %q: %v", name, err)
	}
	member := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: ownerID, Role: "owner"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}
	return project
}
