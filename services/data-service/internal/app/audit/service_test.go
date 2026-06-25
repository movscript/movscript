package audit

import (
	"context"
	"testing"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSummaryAggregatesFilteredAuditLogs(t *testing.T) {
	db := testutil.OpenSQLite(t, "audit.db", &persistencemodel.AuditLog{})
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	actorA := uint(7)
	actorB := uint(8)
	orgID := uint(31)
	otherOrgID := uint(32)
	projectID := uint(11)
	createAuditLog(t, db, &actorA, "project.admin_deleted", "project", "1", &orgID, &projectID, now.Add(-time.Hour))
	createAuditLog(t, db, &actorA, "project.admin_deleted", "project", "2", &orgID, &projectID, now.Add(-2*time.Hour))
	createAuditLog(t, db, &actorB, "user.admin_updated", "user", "9", &orgID, &projectID, now.Add(-3*time.Hour))
	createAuditLog(t, db, &actorB, "project.admin_created", "project", "3", &otherOrgID, &projectID, now.Add(-4*time.Hour))
	createAuditLog(t, db, nil, "usage.viewed", "usage_log", "4", nil, nil, now.AddDate(0, 0, -30))

	service := NewService(db)
	since := now.AddDate(0, 0, -7)
	summary, err := service.Summary(context.Background(), ListFilter{OrgID: "31", ProjectID: "11", Since: &since})
	if err != nil {
		t.Fatalf("Summary returned error: %v", err)
	}
	if summary.Totals.Records != 3 || summary.Totals.UniqueActors != 2 {
		t.Fatalf("unexpected totals: %+v", summary.Totals)
	}
	if len(summary.TopActions) != 2 || summary.TopActions[0].Action != "project.admin_deleted" || summary.TopActions[0].Count != 2 {
		t.Fatalf("unexpected top actions: %+v", summary.TopActions)
	}
	if len(summary.TopTargets) != 2 || summary.TopTargets[0].TargetType != "project" || summary.TopTargets[0].Count != 2 {
		t.Fatalf("unexpected top targets: %+v", summary.TopTargets)
	}
	if len(summary.TopActors) != 2 || summary.TopActors[0].ActorID != actorA || summary.TopActors[0].Count != 2 {
		t.Fatalf("unexpected top actors: %+v", summary.TopActors)
	}
	if summary.GeneratedAt.IsZero() {
		t.Fatalf("GeneratedAt was not set")
	}
}

func createAuditLog(t *testing.T, db *gorm.DB, actorID *uint, action string, targetType string, targetID string, orgID *uint, projectID *uint, createdAt time.Time) {
	t.Helper()
	log := persistencemodel.AuditLog{
		ActorID:    actorID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		OrgID:      orgID,
		ProjectID:  projectID,
	}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}
	if err := db.Model(&log).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
		t.Fatalf("set audit timestamp: %v", err)
	}
}
