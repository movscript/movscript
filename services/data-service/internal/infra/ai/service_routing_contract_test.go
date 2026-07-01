package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAIServiceRoutingPolicyContractResolvesProviderBackedRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-policy-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Primary provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-primary", 20, CapabilityFamilyTextGeneration)
	createCatalogRouteVariant(t, db, 2, "Secondary provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-secondary", 10, CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.ModelID != "gpt-5.2" || route.ProviderID != "local_provider:1" || route.ProviderModelID != "gpt-5.2-primary" || route.Capability != CapabilityFamilyTextGeneration || route.SourceType != persistencemodel.ModelRouteSourceLocalProvider {
		t.Fatalf("route = %#v, want catalog-backed text route", route)
	}
	if route.SelectionReason != "catalog_model_id" {
		t.Fatalf("selection reason = %q, want catalog_model_id", route.SelectionReason)
	}
}

func TestAIServiceRoutingPolicyContractResolvesGenerationRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-generation-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Image provider", AdapterOpenAICompat, "gpt-image-1", "gpt-image-provider", 10, CapabilityFamilyImageGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayGenerationModelRoute(context.Background(), "gpt-image-1", CapabilityFamilyImageGeneration)
	if err != nil {
		t.Fatalf("ResolveGatewayGenerationModelRoute() error = %v", err)
	}
	if route.ModelID != "gpt-image-1" || route.ProviderID != "local_provider:1" || route.ProviderModelID != "gpt-image-provider" || route.Capability != CapabilityFamilyImageGeneration || route.SourceType != persistencemodel.ModelRouteSourceLocalProvider {
		t.Fatalf("route = %#v, want image route through catalog binding", route)
	}
}

func TestAIServiceRoutingPolicyContractRoutesStructuredOperation(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-routing-structured-operation-contract.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "story-video",
		DisplayName:   "Story Video",
		IsEnabled:     true,
		ModelCapabilitiesJSON: `{
			"video_generation": {
				"operations": ["image_to_video", "first_last_frame_to_video"],
				"reference_assets": {
					"min": 1,
					"max": 2,
					"modalities": ["image"],
					"roles": ["generic", "first_frame", "last_frame"]
				}
			}
		}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	firstLastRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     AdapterVolcen,
		ProviderModelID: "provider-first-last-video",
		IsEnabled:       true,
		Priority:        1,
		CapacityWeight:  1,
	}
	if err := db.Create(&firstLastRoute).Error; err != nil {
		t.Fatalf("create route: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.RouteBindingID != firstLastRoute.ID || route.Operation != VideoOperationFirstLastFrameToVideo {
		t.Fatalf("route = %#v, want first-last structured operation route", route)
	}
}

func TestAIServiceRoutingPolicyContractRoutesOmniReferenceVideoOperation(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-routing-omni-reference-video-contract.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "story-reference-video",
		DisplayName:   "Story Reference Video",
		IsEnabled:     true,
		ModelCapabilitiesJSON: `{
			"video_generation": {
				"operations": ["reference_to_video"],
				"reference_assets": {
					"min": 1,
					"max": 8,
					"modalities": ["image", "video", "audio"],
					"roles": ["generic", "reference_image", "reference_video", "reference_audio"]
				}
			}
		}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	omniRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     AdapterVolcen,
		ProviderModelID: "provider-omni-reference-video",
		IsEnabled:       true,
		Priority:        1,
		CapacityWeight:  1,
	}
	if err := db.Create(&omniRoute).Error; err != nil {
		t.Fatalf("create route: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "story-reference-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationReferenceToVideo,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "reference_image", MediaType: "image"},
			{Role: "reference_video", MediaType: "video"},
			{Role: "reference_audio", MediaType: "audio"},
		},
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.RouteBindingID != omniRoute.ID || route.Operation != VideoOperationReferenceToVideo {
		t.Fatalf("route = %#v, want omni reference video route", route)
	}
}

func TestAIServiceRoutingPolicyContractExposesFallbackRoutePlan(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-fallback-plan-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 30, "Primary provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-primary", 20, CapabilityFamilyTextGeneration)
	createCatalogRouteVariant(t, db, 31, "Fallback provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-fallback", 10, CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	plan, err := service.ResolveGatewayModelRoutePlan(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoutePlan() error = %v", err)
	}
	if !plan.FallbackEnabled || len(plan.Routes) != 2 {
		t.Fatalf("plan = %#v, want two fallback routes", plan)
	}
	if plan.ModelID != "gpt-5.2" || plan.Capability != CapabilityFamilyTextGeneration || plan.SelectionReason != "catalog_model_id" {
		t.Fatalf("plan metadata = %#v, want text route plan", plan)
	}
	if plan.Routes[0].ProviderModelID != "gpt-5.2-primary" || plan.Routes[0].SelectionReason != "catalog_model_id" {
		t.Fatalf("first route = %#v, want primary route", plan.Routes[0])
	}
	if plan.Routes[1].ProviderModelID != "gpt-5.2-fallback" || plan.Routes[1].SelectionReason != "fallback_candidate" {
		t.Fatalf("fallback route = %#v, want fallback route", plan.Routes[1])
	}
}

func TestAIServiceRoutingPolicyContractUsesRouteGroup(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-preferred-adapter-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariantWithGroup(t, db, 10, "Default provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-default", 20, "default", CapabilityFamilyTextGeneration)
	createCatalogRouteVariantWithGroup(t, db, 11, "Batch provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-batch", 1, "batch", CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	ctx := WithProviderRouteGroup(context.Background(), "batch")
	route, err := service.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.ProviderModelID != "gpt-5.2-batch" || route.SelectionReason != "catalog_route_group" {
		t.Fatalf("route = %#v, want route-group selected provider", route)
	}
}

func TestAIServiceRoutingPolicyContractFiltersRoutesByEstimatedBudget(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-budget-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariantWithCost(t, db, 40, "Expensive provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-expensive", 20, 10, 0, CapabilityFamilyTextGeneration)
	createCatalogRouteVariantWithCost(t, db, 41, "Budget provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-budget", 1, 1, 0, CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	plan, err := service.ResolveGatewayModelRoutePlan(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityFamilyTextGeneration,
		EstimatedUsage: providercontract.AIUsageEstimate{
			OperationType: CapabilityFamilyTextGeneration,
			InputTokens:   1_000_000,
		},
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoutePlan() error = %v", err)
	}
	if !plan.FallbackEnabled || len(plan.Routes) != 2 {
		t.Fatalf("plan = %#v, want fallback route plan", plan)
	}
	if plan.Routes[0].ProviderModelID != "gpt-5.2-expensive" || plan.Routes[0].SelectionReason != "catalog_model_id" {
		t.Fatalf("route = %#v, want highest-priority provider route", plan.Routes[0])
	}
}

func createCatalogRouteVariant(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, publicModelID string, providerModelID string, priority int, capabilities ...string) {
	createCatalogRouteVariantWithGroupAndCost(t, db, id, providerName, adapterType, publicModelID, providerModelID, priority, "", 0, 0, capabilities...)
}

func createCatalogRouteVariantWithGroup(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, publicModelID string, providerModelID string, priority int, routeGroup string, capabilities ...string) {
	createCatalogRouteVariantWithGroupAndCost(t, db, id, providerName, adapterType, publicModelID, providerModelID, priority, routeGroup, 0, 0, capabilities...)
}

func createCatalogRouteVariantWithCost(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, publicModelID string, providerModelID string, priority int, creditsInputPer1M float64, creditsOutputPer1M float64, capabilities ...string) {
	createCatalogRouteVariantWithGroupAndCost(t, db, id, providerName, adapterType, publicModelID, providerModelID, priority, "", creditsInputPer1M, creditsOutputPer1M, capabilities...)
}

func createCatalogRouteVariantWithGroupAndCost(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, publicModelID string, providerModelID string, priority int, routeGroup string, creditsInputPer1M float64, creditsOutputPer1M float64, capabilities ...string) {
	t.Helper()
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: id},
		AdapterType: adapterType,
		DisplayName: providerName,
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		Model:                 gorm.Model{ID: id},
		PublicModelID:         publicModelID,
		DisplayName:           publicModelID,
		IsEnabled:             true,
		Capabilities:          strings.Join(capabilities, ","),
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(capabilities...),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	credentialID := cred.ID
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		CredentialID:    &credentialID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		RouteGroup:      routeGroup,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, credentialID),
		AdapterType:     adapterType,
		ProviderModelID: providerModelID,
		IsEnabled:       true,
		Priority:        priority,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
}

func testStructuredCapabilitiesJSON(capabilities ...string) string {
	domains := map[string]map[string][]string{}
	add := func(capability string, operations ...string) {
		domains[capability] = map[string][]string{"operations": operations}
	}
	for _, capability := range capabilities {
		switch strings.TrimSpace(capability) {
		case CapabilityFamilyTextGeneration:
			add(CapabilityFamilyTextGeneration, "chat", "responses")
		case CapabilityFamilyImageGeneration:
			add(CapabilityFamilyImageGeneration, ImageOperationTextToImage, ImageOperationReferenceToImage, ImageOperationEditImage)
		case CapabilityFamilyVideoGeneration:
			add(CapabilityFamilyVideoGeneration,
				VideoOperationPromptToVideo,
				VideoOperationImageToVideo,
				VideoOperationFirstFrameToVideo,
				VideoOperationFirstLastFrameToVideo,
				VideoOperationReferenceToVideo,
				VideoOperationEditVideo,
				VideoOperationExtendVideo,
				VideoOperationUpscaleVideo,
			)
		case CapabilityFamilyAudioGeneration:
			add(CapabilityFamilyAudioGeneration,
				AudioOperationTextToSpeech,
				AudioOperationSpeechToText,
				AudioOperationSpeechTranslate,
				AudioOperationSpeechToSpeech,
				AudioOperationVoiceClone,
				AudioOperationVoiceDesign,
				AudioOperationDubbing,
				AudioOperationMusicGeneration,
				AudioOperationSoundEffectGeneration,
				AudioOperationVoiceIsolation,
				AudioOperationForcedAlignment,
			)
		}
	}
	if len(domains) == 0 {
		return ""
	}
	raw, _ := json.Marshal(domains)
	return string(raw)
}
