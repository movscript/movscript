package usageadmin

import (
	"context"
	"testing"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSummaryAggregatesFilteredUsage(t *testing.T) {
	db := testutil.OpenSQLite(t, "usageadmin.db", &persistencemodel.User{}, &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}, &persistencemodel.UsageLog{})
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	userA := createUsageUser(t, db, "alice")
	userB := createUsageUser(t, db, "bob")
	credA := createUsageCredential(t, db, "openai")
	credB := createUsageCredential(t, db, "gemini")
	modelA := createUsageModel(t, db, credA.ID, "gpt-4o")
	modelB := createUsageModel(t, db, credB.ID, "gemini")
	createUsageLog(t, db, userA.ID, modelA.ID, "text", 100, 200, 0, 0, 1.5, now.Add(-time.Hour))
	createUsageLog(t, db, userA.ID, modelA.ID, "image", 0, 0, 0, 2, 4, now.Add(-2*time.Hour))
	createUsageLog(t, db, userB.ID, modelB.ID, "video", 0, 0, 8, 0, 9, now.Add(-3*time.Hour))
	createUsageLog(t, db, userA.ID, modelA.ID, "text", 10, 20, 0, 0, 0.5, now.AddDate(0, 0, -40))

	service := NewService(db)
	since := now.AddDate(0, 0, -7)
	summary, err := service.Summary(context.Background(), ListFilter{ProviderID: "1", Since: &since})
	if err != nil {
		t.Fatalf("Summary returned error: %v", err)
	}
	if summary.Totals.Records != 2 || summary.Totals.Cost != 5.5 || summary.Totals.InputTokens != 100 || summary.Totals.OutputTokens != 200 || summary.Totals.ImageCount != 2 {
		t.Fatalf("unexpected totals: %+v", summary.Totals)
	}
	if len(summary.Operations) != 2 || summary.Operations[0].OperationType != "image" || summary.Operations[0].Cost != 4 {
		t.Fatalf("unexpected operations: %+v", summary.Operations)
	}
	if len(summary.TopModels) != 1 || summary.TopModels[0].AIModelConfig == nil || summary.TopModels[0].AIModelConfig.ModelDefID != "gpt-4o" {
		t.Fatalf("unexpected top models: %+v", summary.TopModels)
	}
	if len(summary.TopUsers) != 1 || summary.TopUsers[0].User == nil || summary.TopUsers[0].User.Username != "alice" {
		t.Fatalf("unexpected top users: %+v", summary.TopUsers)
	}
	if summary.GeneratedAt.IsZero() {
		t.Fatalf("GeneratedAt was not set")
	}
}

func createUsageUser(t *testing.T, db *gorm.DB, username string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, PasswordHash: "hash", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return user
}

func createUsageCredential(t *testing.T, db *gorm.DB, name string) persistencemodel.AICredential {
	t.Helper()
	credential := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: name, IsEnabled: true}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential %q: %v", name, err)
	}
	return credential
}

func createUsageModel(t *testing.T, db *gorm.DB, credentialID uint, modelDefID string) persistencemodel.AIModelConfig {
	t.Helper()
	model := persistencemodel.AIModelConfig{CredentialID: credentialID, ModelDefID: modelDefID, IsEnabled: true}
	if err := db.Create(&model).Error; err != nil {
		t.Fatalf("create model %q: %v", modelDefID, err)
	}
	return model
}

func createUsageLog(t *testing.T, db *gorm.DB, userID uint, modelConfigID uint, operation string, inputTokens int, outputTokens int, durationSec int, imageCount int, cost float64, createdAt time.Time) {
	t.Helper()
	log := persistencemodel.UsageLog{
		UserID:          userID,
		AIModelConfigID: modelConfigID,
		OperationType:   operation,
		InputTokens:     inputTokens,
		OutputTokens:    outputTokens,
		DurationSec:     durationSec,
		ImageCount:      imageCount,
		Cost:            cost,
	}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Model(&log).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
		t.Fatalf("set usage timestamp: %v", err)
	}
}
