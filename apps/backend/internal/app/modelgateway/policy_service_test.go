package modelgateway

import (
	"context"
	"testing"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestPolicyServiceCanCallChatRejectsWrongModel(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &domainmodelgateway.APIKey{
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
	key := &domainmodelgateway.APIKey{
		AllowedScopes: `["model:chat"]`,
		ProjectID:     &projectID,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, 2, nil, 0)
	if err == nil || err != ErrProjectNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrProjectNotAllowed", err)
	}
}

func openModelGatewayPolicyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "modelgateway_policy.db", &model.GatewayAPIKey{}, &model.UsageLog{}, &model.Project{}, &model.Organization{})
}
