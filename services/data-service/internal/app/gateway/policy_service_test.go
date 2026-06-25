package gateway

import (
	"context"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
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
	if got := routeAllowedCatalogEntryID(providercontract.AIGatewayModelRoute{}); got != 0 {
		t.Fatalf("routeAllowedCatalogEntryID without catalog entry = %d, want 0", got)
	}
	if got := routeAllowedCatalogEntryID(providercontract.AIGatewayModelRoute{CatalogEntryID: 7}); got != 7 {
		t.Fatalf("routeAllowedCatalogEntryID with catalog entry = %d, want 7", got)
	}
}

func TestPolicyServiceUsesAuthIdentityForPersonalOrg(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	orgID := uint(17)
	policy := NewPolicyServiceWithIdentity(db, fakeGatewayOrgIdentity{
		orgs: map[uint]authidentity.Organization{
			orgID: {ID: orgID, Name: "Personal", Slug: "personal", IsPersonal: true, Status: "active"},
		},
	})

	if !policy.IsPersonalOrg(context.Background(), orgID) {
		t.Fatalf("IsPersonalOrg(%d) = false, want true from AuthIdentity", orgID)
	}
}

func openModelGatewayPolicyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "modelgateway_policy.db", &model.GatewayAPIKey{}, &model.UsageLog{}, &model.Project{})
}

type fakeGatewayOrgIdentity struct {
	orgs map[uint]authidentity.Organization
}

func (f fakeGatewayOrgIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}
