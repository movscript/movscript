package gateway

import (
	"context"
	"testing"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestPolicyServiceCanCallChatRejectsWrongModel(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &domaingateway.APIKey{
		AllowedScopes:          `["model:chat"]`,
		AllowedCatalogEntryIDs: `[2]`,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, nil, 0, 3)
	if err == nil || err != ErrCatalogEntryNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrCatalogEntryNotAllowed", err)
	}
}

func TestPolicyServiceCanCallChatRejectsWrongProject(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	projectID := uint(9)
	key := &domaingateway.APIKey{
		AllowedScopes: `["model:chat"]`,
		ProjectID:     &projectID,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, nil, 0, 2)
	if err == nil || err != ErrProjectNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrProjectNotAllowed", err)
	}
}

func TestPolicyServiceCanCallChatRejectsLocalModelConfigID(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &domaingateway.APIKey{
		AllowedScopes:          `["model:chat"]`,
		AllowedCatalogEntryIDs: `[99]`,
	}

	err := policy.CanCallChat(context.Background(), Principal{Key: key}, nil, 0, 42)
	if err == nil || err != ErrCatalogEntryNotAllowed {
		t.Fatalf("CanCallChat error = %v, want ErrCatalogEntryNotAllowed for non-catalog route id", err)
	}
}

func TestRouteAllowedCatalogEntryIDDoesNotFallbackToLegacyRouteID(t *testing.T) {
	if got := routeAllowedCatalogEntryID(providercontract.AIGatewayModelRoute{ModelConfigID: 99}); got != 0 {
		t.Fatalf("routeAllowedCatalogEntryID without catalog entry = %d, want 0", got)
	}
	if got := routeAllowedCatalogEntryID(providercontract.AIGatewayModelRoute{ModelConfigID: 99, CatalogEntryID: 7}); got != 7 {
		t.Fatalf("routeAllowedCatalogEntryID with catalog entry = %d, want 7", got)
	}
}

func openModelGatewayPolicyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "modelgateway_policy.db", &model.GatewayAPIKey{}, &model.UsageLog{}, &model.Project{}, &model.Organization{})
}
