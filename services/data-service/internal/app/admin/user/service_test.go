package user

import (
	"context"
	"errors"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestDetailIncludesProjectUsageAndAuditWithoutLocalUserAuthority(t *testing.T) {
	db := newTestDB(t)
	userID := uint(42)
	org := persistencemodel.Organization{Name: "Studio", Slug: "studio", Plan: "team", Status: "active", CreatedBy: userID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Film", OwnerID: userID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: userID, Role: "owner"}).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: userID, RuntimeModelID: 1, ProjectID: &project.ID, OperationType: "image", ImageCount: 3, InputTokens: 11, OutputTokens: 22, Cost: 1.5}).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{ActorID: &userID, Action: "user.tested", TargetType: "user", TargetID: "42"}).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}

	detail, err := NewService(db).Detail(context.Background(), userID)
	if err != nil {
		t.Fatalf("Detail returned error: %v", err)
	}
	if detail.User.ID != 0 || len(detail.Orgs) != 0 {
		t.Fatalf("detail should not source identity fields locally: %+v", detail)
	}
	if len(detail.Projects) != 1 || detail.Projects[0].ID != project.ID || detail.Projects[0].Role != "owner" {
		t.Fatalf("unexpected project detail: %+v", detail.Projects)
	}
	if detail.Usage.Calls != 1 || detail.Usage.Images != 3 || detail.Usage.InputTokens != 11 || detail.Usage.OutputTokens != 22 {
		t.Fatalf("unexpected usage summary: %+v", detail.Usage)
	}
	if detail.Audit.Records != 1 || detail.Audit.LastAction != "user.tested" || detail.Audit.LastAt == nil {
		t.Fatalf("unexpected audit summary: %+v", detail.Audit)
	}
}

func TestDetailRejectsZeroUserID(t *testing.T) {
	if _, err := NewService(newTestDB(t)).Detail(context.Background(), 0); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("Detail err = %v, want ErrUserNotFound", err)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(
		t,
		"adminuser.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
}
