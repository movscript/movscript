package modelgateway

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPolicyServiceCanCallChatRejectsWrongModel(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &model.GatewayAPIKey{
		AllowedScopes:   `["model:chat"]`,
		AllowedModelIDs: `[2]`,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, 3, nil, 0)
	if err == nil || err != ErrModelNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrModelNotAllowed", err)
	}
}

func TestPolicyServiceCanCallChatRejectsWrongProject(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	projectID := uint(9)
	key := &model.GatewayAPIKey{
		AllowedScopes: `["model:chat"]`,
		ProjectID:     &projectID,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, 2, nil, 0)
	if err == nil || err != ErrProjectNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrProjectNotAllowed", err)
	}
}

func TestPolicyServiceEnforceKeyLimitsHonorsBudget(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &model.GatewayAPIKey{
		MonthlyBudget: 10,
	}

	err := policy.EnforceKeyLimits(context.Background(), key, 11)
	if err == nil || err.Error() == "" {
		t.Fatal("expected monthly budget error")
	}
}

func openModelGatewayPolicyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.GatewayAPIKey{}, &model.GatewayRateLimitCounter{}, &model.UsageLog{}, &model.Project{}, &model.Organization{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}
