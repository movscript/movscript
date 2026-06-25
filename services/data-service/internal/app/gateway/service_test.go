package gateway

import (
	"context"
	"errors"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
)

type emptyCatalogRoutePolicy struct {
	routeRequest providercontract.AIGatewayRouteRequest
}

func (p *emptyCatalogRoutePolicy) ListModels(context.Context, providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	return nil, nil
}

func (p *emptyCatalogRoutePolicy) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayModelRoute(_ context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoute, error) {
	p.routeRequest = request
	if request.ModelID == "logical-chat" && request.Capability == ai.CapabilityText {
		return providercontract.AIGatewayModelRoute{
			ModelID:         "logical-chat",
			CatalogEntryID:  19,
			RouteBindingID:  29,
			ProviderModelID: "provider-chat",
			Capability:      ai.CapabilityText,
		}, nil
	}
	return providercontract.AIGatewayModelRoute{}, errors.New("route not found")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayModelRoutePlan(context.Context, providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoutePlan, error) {
	return providercontract.AIGatewayModelRoutePlan{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayTextModelRoute(context.Context, string) (providercontract.AIGatewayModelRoute, error) {
	return providercontract.AIGatewayModelRoute{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayGenerationModelRoute(context.Context, string, string) (providercontract.AIGatewayModelRoute, error) {
	return providercontract.AIGatewayModelRoute{}, errors.New("not implemented")
}

func TestResolveModelForCapabilityFallsBackToRoutingWhenCatalogIsEmpty(t *testing.T) {
	routes := &emptyCatalogRoutePolicy{}
	service := &Service{catalog: routes, routing: routes}

	id, responseModel, err := service.resolveModelForCapability(context.Background(), "logical-chat", ai.CapabilityText)

	if err != nil {
		t.Fatalf("resolveModelForCapability() error = %v", err)
	}
	if id != 19 || responseModel != "logical-chat" {
		t.Fatalf("resolved model = id %d response %q, want catalog entry id 19 and logical-chat", id, responseModel)
	}
	if routes.routeRequest.ModelID != "logical-chat" || routes.routeRequest.Capability != ai.CapabilityText {
		t.Fatalf("routing request = %#v, want logical-chat text lookup", routes.routeRequest)
	}
}

func TestListChatModelsFiltersGatewayKeyAllowedCatalogEntries(t *testing.T) {
	catalog := &fakeGatewayModelCatalog{
		models: []providercontract.AIModelDescriptor{
			{ModelID: "public-a", CatalogEntryID: 1, Capabilities: []string{ai.CapabilityText}},
			{ModelID: "public-b", CatalogEntryID: 2, Capabilities: []string{ai.CapabilityText}},
		},
	}
	service := &Service{catalog: catalog, policy: &PolicyService{}}
	key := &domaingateway.APIKey{
		AllowedScopes:          `["model:chat"]`,
		AllowedCatalogEntryIDs: `[2]`,
	}

	models, err := service.ListChatModels(context.Background(), Principal{Key: key})
	if err != nil {
		t.Fatalf("ListChatModels() error = %v", err)
	}
	if len(models) != 1 || models[0].CatalogEntryID != 2 || models[0].ModelID != "public-b" {
		t.Fatalf("models = %#v, want only allowed catalog entry 2", models)
	}
	if !containsString(catalog.lastFilter.APIKinds, ai.ModelAPIKindAnthropicMessages) {
		t.Fatalf("ListChatModels APIKinds = %#v, want Anthropic Messages included", catalog.lastFilter.APIKinds)
	}
}

func TestChatModelFromDescriptorUsesCatalogEntryIDAsVisibleID(t *testing.T) {
	model := chatModelFromDescriptor(providercontract.AIModelDescriptor{
		ModelID:        "public-chat",
		CatalogEntryID: 202,
	})

	if model.ID != 202 || model.CatalogEntryID != 202 {
		t.Fatalf("chat model = %#v, want visible id from catalog entry", model)
	}
}

func TestPrincipalForAPIKeyUsesAuthIdentityOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "modelgateway-principal-auth-identity.db", &persistencemodel.GatewayAPIKey{})
	identity := fakeGatewayIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			7: {ID: 7, Username: "gateway-owner", SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	}
	service := NewServiceWithIdentity(db, identity)
	created, err := service.CreateAPIKey(context.Background(), CreateAPIKeyInput{
		OwnerUserID:   7,
		Name:          "agent key",
		AllowedScopes: []string{"model:chat"},
	})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	principal, ok, err := service.PrincipalForAPIKey(context.Background(), created.RawKey)
	if err != nil {
		t.Fatalf("PrincipalForAPIKey() error = %v", err)
	}
	if !ok || principal.UserID != 7 || principal.Key == nil || principal.Key.ID != created.Key.ID {
		t.Fatalf("principal = %#v ok = %v, want active AuthIdentity owner accepted", principal, ok)
	}
}

func TestPrincipalForAPIKeyRejectsInactiveAuthIdentityOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "modelgateway-principal-auth-identity-inactive.db", &persistencemodel.GatewayAPIKey{})
	identity := fakeGatewayIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			7: {ID: 7, Username: "gateway-owner", SystemRole: domainidentity.SystemRoleUser, Status: "disabled"},
		},
	}
	service := NewServiceWithIdentity(db, identity)
	created, err := service.CreateAPIKey(context.Background(), CreateAPIKeyInput{
		OwnerUserID:   7,
		Name:          "agent key",
		AllowedScopes: []string{"model:chat"},
	})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	principal, ok, err := service.PrincipalForAPIKey(context.Background(), created.RawKey)
	if err != nil {
		t.Fatalf("PrincipalForAPIKey() error = %v", err)
	}
	if ok || principal.Key != nil || principal.UserID != 0 {
		t.Fatalf("principal = %#v ok = %v, want inactive AuthIdentity owner rejected", principal, ok)
	}
}

type fakeGatewayModelCatalog struct {
	models     []providercontract.AIModelDescriptor
	lastFilter providercontract.AIModelListFilter
}

func (f *fakeGatewayModelCatalog) ListModels(_ context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	f.lastFilter = filter
	return f.models, nil
}

func (f *fakeGatewayModelCatalog) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, errors.New("not implemented")
}

type fakeGatewayIdentity struct {
	profiles map[uint]domainidentity.UserProfile
	orgs     map[uint]authidentity.Organization
}

func (f fakeGatewayIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	profile, ok := f.profiles[userID]
	if !ok {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	return profile, nil
}

func (f fakeGatewayIdentity) OrgMemberships(_ context.Context, _ uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func (f fakeGatewayIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
