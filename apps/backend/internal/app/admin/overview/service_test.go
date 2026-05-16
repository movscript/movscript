package overview

import (
	"context"
	"testing"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSummaryAggregatesAdminOverview(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-overview.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.Job{},
		&persistencemodel.UsageLog{},
		&persistencemodel.RawResource{},
		&persistencemodel.AuditLog{},
	)
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	seedOverviewData(t, db, now)

	service := NewService(db)
	service.now = func() time.Time { return now }
	summary, err := service.Summary(context.Background())
	if err != nil {
		t.Fatalf("Summary returned error: %v", err)
	}
	if summary.Users.Total != 2 || summary.Users.Active != 1 || summary.Users.Disabled != 1 {
		t.Fatalf("unexpected users: %+v", summary.Users)
	}
	if summary.Orgs.Total != 2 || summary.Orgs.Suspended != 1 {
		t.Fatalf("unexpected orgs: %+v", summary.Orgs)
	}
	if summary.Projects.Total != 1 {
		t.Fatalf("projects total = %d, want 1", summary.Projects.Total)
	}
	if summary.Models.Credentials != 2 || summary.Models.EnabledCredentials != 1 || summary.Models.EnabledConfigs != 1 {
		t.Fatalf("unexpected models: %+v", summary.Models)
	}
	if summary.Jobs.Total != 3 || summary.Jobs.Pending != 1 || summary.Jobs.Running != 1 || summary.Jobs.Failed != 1 {
		t.Fatalf("unexpected jobs: %+v", summary.Jobs)
	}
	if summary.Usage.Records != 3 || summary.Usage.Cost7D != 1 || summary.Usage.Cost30D != 10 {
		t.Fatalf("unexpected usage: %+v", summary.Usage)
	}
	if summary.Resources.Total != 2 || summary.Resources.Bytes != 300 {
		t.Fatalf("unexpected resources: %+v", summary.Resources)
	}
	if summary.Audits.Total != 1 || summary.GeneratedAt == "" {
		t.Fatalf("unexpected audits/generated_at: audits=%+v generated_at=%q", summary.Audits, summary.GeneratedAt)
	}
}

func seedOverviewData(t *testing.T, db *gorm.DB, now time.Time) {
	t.Helper()
	users := []persistencemodel.User{
		{Username: "active", PasswordHash: "hash", Status: "active"},
		{Username: "disabled", PasswordHash: "hash", Status: "disabled"},
	}
	for i := range users {
		if err := db.Create(&users[i]).Error; err != nil {
			t.Fatalf("create user: %v", err)
		}
	}
	orgs := []persistencemodel.Organization{
		{Name: "Studio", Slug: "studio", Plan: "team", Status: "active", CreatedBy: users[0].ID},
		{Name: "Paused", Slug: "paused", Plan: "team", Status: "suspended", CreatedBy: users[0].ID},
	}
	for i := range orgs {
		if err := db.Create(&orgs[i]).Error; err != nil {
			t.Fatalf("create org: %v", err)
		}
	}
	project := persistencemodel.Project{Name: "Film", OwnerID: users[0].ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	credentials := []persistencemodel.AICredential{
		{AdapterType: "openai_compat", DisplayName: "OpenAI", IsEnabled: true},
		{AdapterType: "gemini", DisplayName: "Gemini", IsEnabled: false},
	}
	for i := range credentials {
		if err := db.Create(&credentials[i]).Error; err != nil {
			t.Fatalf("create credential: %v", err)
		}
	}
	if err := db.Model(&credentials[1]).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable credential: %v", err)
	}
	configs := []persistencemodel.AIModelConfig{
		{CredentialID: credentials[0].ID, ModelDefID: "gpt-4o", IsEnabled: true},
		{CredentialID: credentials[1].ID, ModelDefID: "gemini", IsEnabled: false},
	}
	for i := range configs {
		if err := db.Create(&configs[i]).Error; err != nil {
			t.Fatalf("create model config: %v", err)
		}
	}
	if err := db.Model(&configs[1]).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable model config: %v", err)
	}
	jobs := []persistencemodel.Job{
		{UserID: users[0].ID, ModelConfigID: configs[0].ID, JobType: "image", Status: "pending"},
		{UserID: users[0].ID, ModelConfigID: configs[0].ID, JobType: "image", Status: "running"},
		{UserID: users[0].ID, ModelConfigID: configs[0].ID, JobType: "image", Status: "failed"},
	}
	for i := range jobs {
		if err := db.Create(&jobs[i]).Error; err != nil {
			t.Fatalf("create job: %v", err)
		}
	}
	logs := []persistencemodel.UsageLog{
		{UserID: users[0].ID, AIModelConfigID: configs[0].ID, OperationType: "image", Cost: 1},
		{UserID: users[0].ID, AIModelConfigID: configs[0].ID, OperationType: "video", Cost: 2},
		{UserID: users[0].ID, AIModelConfigID: configs[0].ID, OperationType: "text", Cost: 7},
	}
	for i := range logs {
		if err := db.Create(&logs[i]).Error; err != nil {
			t.Fatalf("create usage log: %v", err)
		}
		createdAt := now.AddDate(0, 0, -i*10)
		if err := db.Model(&logs[i]).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
			t.Fatalf("set usage timestamp: %v", err)
		}
	}
	resources := []persistencemodel.RawResource{
		{OwnerID: users[0].ID, Type: "image", Name: "a", FilePath: "a.png", Size: 100},
		{OwnerID: users[0].ID, Type: "video", Name: "b", FilePath: "b.mp4", Size: 200},
	}
	for i := range resources {
		if err := db.Create(&resources[i]).Error; err != nil {
			t.Fatalf("create resource: %v", err)
		}
	}
	audit := persistencemodel.AuditLog{Action: "project.admin_deleted", TargetType: "project", TargetID: "1"}
	if err := db.Create(&audit).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}
}
