package ai

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
)

type catalogRuntimeProbeProvider struct {
	seenModel      string
	seenImageModel string
	seenVideoModel string
	seenTTSModel   string
}

func (p *catalogRuntimeProbeProvider) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	p.seenModel = req.Model
	return TextResponse{Content: "ok", Usage: TokenUsage{InputTokens: 1, OutputTokens: 1}}, nil
}

func (p *catalogRuntimeProbeProvider) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	p.seenImageModel = req.Model
	return ImageResponse{URLs: []string{"https://example.test/image.png"}}, nil
}

func (p *catalogRuntimeProbeProvider) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	p.seenVideoModel = req.Model
	return VideoResponse{URL: "https://example.test/video.mp4", DurationSec: 1}, nil
}

func (p *catalogRuntimeProbeProvider) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	p.seenTTSModel = req.Model
	return media.TTSResponse{Audio: []byte("mp3"), MimeType: "audio/mpeg"}, nil
}

func (p *catalogRuntimeProbeProvider) Ping(ctx context.Context) error {
	return nil
}

func TestAIServiceModelCatalogContractMergesLogicalModels(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-catalog-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Busy provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-busy", 10, CapabilityFamilyTextGeneration)
	createCatalogRouteVariant(t, db, 2, "Healthy provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-healthy", 20, CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyTextGeneration})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("ListModels() count = %d, want 1: %#v", len(models), models)
	}
	if models[0].ModelID != "gpt-5.2" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("catalog model descriptor = %#v, want merged gpt-5.2 without provider name", models[0])
	}

	variants, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyTextGeneration, ProviderVariants: true})
	if err != nil {
		t.Fatalf("ListModels(provider variants) error = %v", err)
	}
	if len(variants) != 2 || variants[0].ProviderName == "" || variants[0].ProviderID == "" || variants[0].ProviderModelID == "" {
		t.Fatalf("provider variant descriptors = %#v, want per-provider target metadata without legacy runtime model id", variants)
	}
}

func TestAIServiceModelCatalogFiltersRoutesByAPIKind(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-catalog-api-kind-filter.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "OpenAI provider", AdapterOpenAICompat, "agent-writer", "openai-writer", 10, CapabilityFamilyTextGeneration)
	createCatalogRouteVariant(t, db, 2, "Anthropic provider", AdapterAnthropic, "agent-writer", "claude-writer", 20, CapabilityFamilyTextGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	allModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyTextGeneration})
	if err != nil {
		t.Fatalf("ListModels(all) error = %v", err)
	}
	if len(allModels) != 1 || allModels[0].ProviderVariants != 2 {
		t.Fatalf("all models = %#v, want one merged model with two route variants", allModels)
	}
	if !hasString(allModels[0].SupportedAPIKinds, ModelAPIKindOpenAIResponses) || !hasString(allModels[0].SupportedAPIKinds, ModelAPIKindAnthropicMessages) {
		t.Fatalf("supported api kinds = %#v, want OpenAI and Anthropic kinds merged", allModels[0].SupportedAPIKinds)
	}

	claudeModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyTextGeneration,
		APIKind:    ModelAPIKindAnthropicMessages,
	})
	if err != nil {
		t.Fatalf("ListModels(anthropic) error = %v", err)
	}
	if len(claudeModels) != 1 || claudeModels[0].ProviderVariants != 1 || !hasString(claudeModels[0].SupportedAPIKinds, ModelAPIKindAnthropicMessages) || hasString(claudeModels[0].SupportedAPIKinds, ModelAPIKindOpenAIResponses) {
		t.Fatalf("anthropic models = %#v, want only Anthropic route support", claudeModels)
	}

	responsesModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyTextGeneration,
		APIKind:    ModelAPIKindOpenAIResponses,
	})
	if err != nil {
		t.Fatalf("ListModels(responses) error = %v", err)
	}
	if len(responsesModels) != 1 || responsesModels[0].ProviderVariants != 1 || !hasString(responsesModels[0].SupportedAPIKinds, ModelAPIKindOpenAIResponses) || hasString(responsesModels[0].SupportedAPIKinds, ModelAPIKindAnthropicMessages) {
		t.Fatalf("responses models = %#v, want only OpenAI-compatible route support", responsesModels)
	}

	anthropicRoute, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "agent-writer",
		Capability: CapabilityFamilyTextGeneration,
		APIKind:    ModelAPIKindAnthropicMessages,
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute(anthropic) error = %v", err)
	}
	if anthropicRoute.ProviderModelID != "claude-writer" || anthropicRoute.APIKind != ModelAPIKindAnthropicMessages {
		t.Fatalf("anthropic route = %#v, want Anthropic provider route", anthropicRoute)
	}

	responsesRoute, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "agent-writer",
		Capability: CapabilityFamilyTextGeneration,
		APIKind:    ModelAPIKindOpenAIResponses,
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute(responses) error = %v", err)
	}
	if responsesRoute.ProviderModelID != "openai-writer" || responsesRoute.APIKind != ModelAPIKindOpenAIResponses {
		t.Fatalf("responses route = %#v, want OpenAI-compatible provider route", responsesRoute)
	}
}

func TestAIServiceModelCatalogUsesCatalogEntriesAndRouteBindings(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-entry-contract.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	videoParamProfile := `{"version":2,"common":{"allow":["duration"],"override":{"duration":{"key":"duration","label":"Duration","type":"number","min":1,"max":10,"step":1,"default":5}}}}`
	defaultEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "video-fast",
		DisplayName:           "Video Fast",
		ShortName:             "Fast",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyVideoGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyVideoGeneration),
		SupportedParams:       videoParamProfile,
	}
	if err := db.Create(&defaultEntry).Error; err != nil {
		t.Fatalf("create default catalog entry: %v", err)
	}
	priorityEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "video-fast",
		DisplayName:           "Video Fast",
		ShortName:             "Fast",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyVideoGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyVideoGeneration),
		SupportedParams:       videoParamProfile,
	}
	if err := db.Create(&priorityEntry).Error; err != nil {
		t.Fatalf("create priority catalog entry: %v", err)
	}
	bindings := []persistencemodel.AIModelRouteBinding{
		{CatalogEntryID: defaultEntry.ID, SourceType: persistencemodel.ModelRouteSourceRelayGateway, RouteGroup: "default", ProviderID: persistencemodel.ModelRouteSourceRelayGateway, AdapterType: AdapterVolcen, ProviderModelID: "kling-v2", IsEnabled: true, Priority: 1, CapacityWeight: 1},
		{CatalogEntryID: priorityEntry.ID, SourceType: persistencemodel.ModelRouteSourceRelayGateway, RouteGroup: "priority", ProviderID: persistencemodel.ModelRouteSourceRelayGateway, AdapterType: AdapterVolcen, ProviderModelID: "kling-v2-master", IsEnabled: true, Priority: 10, CapacityWeight: 2},
	}
	if err := db.Create(&bindings).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	allModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyVideoGeneration})
	if err != nil {
		t.Fatalf("ListModels(all route groups) error = %v", err)
	}
	if len(allModels) != 1 || allModels[0].ModelID != "video-fast" || allModels[0].ProviderVariants != 2 {
		t.Fatalf("merged catalog models = %#v, want one public model with two provider variants", allModels)
	}

	defaultModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyVideoGeneration, RouteGroup: "default"})
	if err != nil {
		t.Fatalf("ListModels(default route group) error = %v", err)
	}
	if len(defaultModels) != 1 {
		t.Fatalf("default models = %#v, want one default model", defaultModels)
	}
	if defaultModels[0].ModelID != "video-fast" || defaultModels[0].CatalogEntryID != defaultEntry.ID || defaultModels[0].ProviderModelID != "kling-v2" {
		t.Fatalf("default model alias = %#v, want stable public id with default provider id", defaultModels[0])
	}

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyVideoGeneration, RouteGroup: "priority"})
	if err != nil {
		t.Fatalf("ListModels(route group) error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("models = %#v, want one priority model", models)
	}
	model := models[0]
	if model.ModelID != "video-fast" || model.CatalogEntryID != priorityEntry.ID || model.ProviderModelID != "kling-v2-master" || model.ModelIDOverride != "kling-v2-master" {
		t.Fatalf("model alias = %#v, want stable MovScript id with priority provider id", model)
	}
	if model.ContractVersion != 2 {
		t.Fatalf("contract version = %d, want 2", model.ContractVersion)
	}
	if !containsTrimmed(model.Operations, VideoOperationPromptToVideo) || !containsTrimmed(model.Operations, VideoOperationImageToVideo) {
		t.Fatalf("operations = %#v, want video operation contract", model.Operations)
	}
	promptParams := model.SupportedParamsByOperation[VideoOperationPromptToVideo]
	if len(promptParams) != 1 || promptParams[0]["key"] != "duration" {
		t.Fatalf("supported params by operation = %#v, want params for %s", model.SupportedParamsByOperation, VideoOperationPromptToVideo)
	}
	if schema := model.ParamsSchemaByOperation[VideoOperationPromptToVideo]; schema["type"] != "object" {
		t.Fatalf("params schema by operation = %#v, want object schema for %s", model.ParamsSchemaByOperation, VideoOperationPromptToVideo)
	}
	operationModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationPromptToVideo,
		RouteGroup: "priority",
	})
	if err != nil {
		t.Fatalf("ListModels(operation) error = %v", err)
	}
	if len(operationModels) != 1 {
		t.Fatalf("operation models = %#v, want one model", operationModels)
	}
	if len(operationModels[0].SupportedParams) != 1 || operationModels[0].SupportedParams[0]["key"] != "duration" {
		t.Fatalf("operation supported params = %#v, want top-level duration compatibility params", operationModels[0].SupportedParams)
	}
	if schema := operationModels[0].ParamsSchema; schema["type"] != "object" {
		t.Fatalf("operation params schema = %#v, want top-level object schema compatibility", schema)
	}

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "video-fast", Capability: CapabilityFamilyVideoGeneration, RouteGroup: "priority"})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog route group) error = %v", err)
	}
	if route.ModelID != "video-fast" || route.ProviderModelID != "kling-v2-master" || route.SelectionReason != "catalog_route_group" {
		t.Fatalf("catalog route = %#v, want public id resolved to priority provider id", route)
	}
	anyGroupRoute, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "video-fast", Capability: CapabilityFamilyVideoGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog public id) error = %v", err)
	}
	if anyGroupRoute.ProviderModelID != "kling-v2-master" {
		t.Fatalf("catalog public-id route = %#v, want highest-priority provider id", anyGroupRoute)
	}
	if _, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "kling-v2-master", Capability: CapabilityFamilyVideoGeneration, RouteGroup: "priority"}); err == nil {
		t.Fatal("ResolveModelRoute(provider model id) succeeded, want provider_model_id hidden behind public model id")
	}
	routeByEntryID, err := service.ResolveModelRoute(ModelRouteRequest{CatalogEntryID: priorityEntry.ID, Capability: CapabilityFamilyVideoGeneration, RouteGroup: "priority"})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog entry id) error = %v", err)
	}
	if routeByEntryID.CatalogEntryID != priorityEntry.ID || routeByEntryID.SourceType != persistencemodel.ModelRouteSourceRelayGateway || routeByEntryID.ProviderModelID != "kling-v2-master" {
		t.Fatalf("catalog entry route = %#v, want relay gateway binding route by catalog entry id", routeByEntryID)
	}
}

func TestAIServiceListModelsDoesNotFallbackToLegacyConfigsWhenCatalogExists(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-first-over-legacy.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "catalog-writer",
		DisplayName:           "Catalog Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:     "default",
		IsEnabled:      true,
		CapacityWeight: 1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyTextGeneration})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 || models[0].ModelID != "catalog-writer" || models[0].CatalogEntryID != entry.ID {
		t.Fatalf("models = %#v, want only catalog entry model", models)
	}
	if models[0].ProviderModelID == "legacy-writer" || models[0].ModelID == "legacy-writer" {
		t.Fatalf("models = %#v, leaked legacy ai_model_configs fallback", models)
	}

	imageModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyImageGeneration})
	if err != nil {
		t.Fatalf("ListModels(image) error = %v", err)
	}
	if len(imageModels) != 0 {
		t.Fatalf("image models = %#v, want no legacy fallback when catalog owns model listing", imageModels)
	}
}

func TestAIServiceGetAnyTextModelUsesCatalogRoutesWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-get-any-text-catalog-only.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog-only get-any-text test should not create legacy ai_model_configs")
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "catalog-writer",
		DisplayName:           "Catalog Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:     "default",
		IsEnabled:      true,
		Priority:       10,
		CapacityWeight: 1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	runtimeModelID, modelID, err := service.GetAnyTextModel()
	if err != nil {
		t.Fatalf("GetAnyTextModel() error = %v", err)
	}
	if runtimeModelID != entry.ID || modelID != "catalog-writer" {
		t.Fatalf("GetAnyTextModel() = id:%d model:%q, want catalog entry id %d public model id", runtimeModelID, modelID, entry.ID)
	}
}

func TestAIServiceGetAnyTextModelDoesNotFallbackToLegacyConfigsWhenCatalogExists(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-get-any-text-catalog-over-legacy.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "catalog-writer",
		DisplayName:           "Catalog Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:     "default",
		IsEnabled:      true,
		Priority:       1,
		CapacityWeight: 1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	runtimeModelID, modelID, err := service.GetAnyTextModel()
	if err != nil {
		t.Fatalf("GetAnyTextModel() error = %v", err)
	}
	if runtimeModelID != entry.ID || modelID != "catalog-writer" {
		t.Fatalf("GetAnyTextModel() = id:%d model:%q, want catalog entry over legacy config id %d", runtimeModelID, modelID, entry.ID)
	}
}

func TestAIServiceResolveModelRouteByRouteBindingID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-route-binding-resolve.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	cred := persistencemodel.AICredential{AdapterType: AdapterOpenAICompat, DisplayName: "Provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "image-fast",
		DisplayName:           "Image Fast",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyImageGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyImageGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		RouteGroup:      "priority",
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-image-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		Priority:        1,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	service := NewAIService(db, NewRegistry(db, nil))
	route, err := service.ResolveModelRoute(ModelRouteRequest{RouteBindingID: binding.ID, Capability: CapabilityFamilyImageGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute(route binding) error = %v", err)
	}
	if route.RouteBindingID != binding.ID || route.CatalogEntryID != entry.ID || route.CredentialID != cred.ID || route.SelectionReason != "route_binding_id" {
		t.Fatalf("route = %#v, want fixed route binding/catalog/credential", route)
	}
	if route.ModelID != "image-fast" || route.ProviderModelID != "provider-image-v2" || route.RouteGroup != "priority" {
		t.Fatalf("route model fields = %#v", route)
	}
}

func TestAIServiceLocalProviderRouteResolvesCredentialFromProviderMirror(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-provider-mirror-resolve.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	providerID := "provider:primary-openai-compatible"
	if err := db.Create(&persistencemodel.AIProvider{
		ProviderID:       providerID,
		ProviderKind:     persistencemodel.AIProviderKindOpenAICompatGateway,
		ProviderCategory: persistencemodel.AIProviderCategoryAggregatorGateway,
		AdapterKey:       AdapterOpenAICompat,
		DisplayName:      "Primary OpenAI Compatible",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if err := db.Create(&persistencemodel.AIProviderCredential{
		ProviderID:      providerID,
		CredentialKey:   "primary",
		CredentialKind:  "api_key",
		PlainConfigJSON: fmt.Sprintf(`{"legacy_credential_id":%d}`, cred.ID),
		Status:          persistencemodel.AIProviderCredentialStatusActive,
		IsPrimary:       true,
	}).Error; err != nil {
		t.Fatalf("create provider credential: %v", err)
	}

	service := NewAIService(db, NewRegistry(db, nil))
	resolved, err := service.localProviderCredentialForRoute(context.Background(), ModelRoute{
		SourceType: persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID: providerID,
	})
	if err != nil {
		t.Fatalf("localProviderCredentialForRoute() error = %v", err)
	}
	if resolved.ID != cred.ID {
		t.Fatalf("resolved credential id = %d, want %d", resolved.ID, cred.ID)
	}
}

func TestAIServiceResolveModelRouteIncludesProviderFacts(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-provider-facts.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.AIProvider{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "seedance-2-0",
		DisplayName:           "Seedance 2.0",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyVideoGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyVideoGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	providerID := "volc-ark-main"
	if err := db.Create(&persistencemodel.AIProvider{
		ProviderID:       providerID,
		ProviderKind:     persistencemodel.AIProviderKindVolcengineArk,
		ProviderCategory: persistencemodel.AIProviderCategoryOfficialPlatform,
		AdapterKey:       AdapterVolcen,
		DisplayName:      "Ark main",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      providerID,
		AdapterType:     AdapterVolcen,
		ProviderModelID: "doubao-seedance-2-0-260128",
		APIKinds:        "video,async_task",
		IsEnabled:       true,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	route, err := NewAIService(db, NewRegistry(db, nil)).ResolveModelRoute(ModelRouteRequest{
		CatalogEntryID: entry.ID,
		Capability:     CapabilityFamilyVideoGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if route.ProviderID != providerID ||
		route.ProviderKind != persistencemodel.AIProviderKindVolcengineArk ||
		route.AdapterKey != AdapterVolcen {
		t.Fatalf("route provider facts = %#v", route)
	}
}

func TestAIServiceCatalogRouteUsesCredentialAdapterForVolcenVideoTasks(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-volcen-video-runtime-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterVolcen,
		DisplayName: "Volcen Ark",
		BaseURL:     "https://ark.cn-beijing.volces.com/api/v3",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "seedance-2-0",
		DisplayName:           "Seedance 2.0",
		IsEnabled:             true,
		Capabilities:          strings.Join([]string{CapabilityFamilyVideoGeneration}, ","),
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyVideoGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyVideoGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "doubao-seedance-2-0-260128",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveModelRoute(ModelRouteRequest{RouteBindingID: binding.ID, Capability: CapabilityFamilyVideoGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if !service.SupportsVideoTasksRoute(context.Background(), 1, route) {
		t.Fatal("SupportsVideoTasksRoute() = false, want true for Volcen credential-backed route")
	}
}

func TestCatalogRouteDefinitionUsesCatalogRuntimeModel(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-runtime-model.db",
		&persistencemodel.AIModelCatalogEntry{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "writer",
		DisplayName:     "Writer",
		ShortName:       "write",
		IsEnabled:       true,
		Capabilities:    CapabilityFamilyTextGeneration,
		SupportedParams: `[{"key":"temperature","type":"number"}]`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	definition, handled, err := service.catalogRouteDefinition(context.Background(), ModelRoute{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		ProviderModelID: "provider-writer-v2",
	}, CapabilityFamilyTextGeneration)
	if err != nil {
		t.Fatalf("catalogRouteDefinition() error = %v", err)
	}
	if !handled {
		t.Fatal("catalogRouteDefinition() handled = false, want true")
	}
	if definition.model.ID != entry.ID || definition.model.ProviderModelID != "writer" || definition.model.DisplayName != "Writer" {
		t.Fatalf("catalog runtime model = %#v, want fields copied from catalog entry", definition.model)
	}
}

func TestAIServiceCatalogRouteCanCallLocalProviderWithProviderModelID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-runtime-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Catalog provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "writer",
		DisplayName:           "Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-writer-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return probe, nil
	}
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "writer", Capability: CapabilityFamilyTextGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if route.CatalogEntryID != entry.ID || route.ProviderID == "" || route.CredentialID != cred.ID || route.ProviderModelID != "provider-writer-v2" {
		t.Fatalf("route = %#v, want catalog local-provider route", route)
	}
	req := TextRequest{Messages: []Message{{Role: "user", Content: "hello"}}}
	if _, err := service.PreflightTextRoute(context.Background(), 1, route, &req); err != nil {
		t.Fatalf("PreflightTextRoute() error = %v", err)
	}
	resp, err := service.CallTextWithRouteUsage(context.Background(), 1, route, req, UsageContext{})
	if err != nil {
		t.Fatalf("CallTextWithRouteUsage() error = %v", err)
	}
	if resp.Content != "ok" || probe.seenModel != "provider-writer-v2" {
		t.Fatalf("response=%#v seenModel=%q, want provider model id", resp, probe.seenModel)
	}
	var usageLog persistencemodel.UsageLog
	if err := db.First(&usageLog).Error; err != nil {
		t.Fatalf("load usage log: %v", err)
	}
	if usageLog.AIModelCatalogEntryID == nil || *usageLog.AIModelCatalogEntryID != entry.ID {
		t.Fatalf("usage log catalog entry id = %v, want %d", usageLog.AIModelCatalogEntryID, entry.ID)
	}
	if usageLog.RouteBindingID == nil || *usageLog.RouteBindingID != binding.ID {
		t.Fatalf("usage log route binding id = %v, want %d", usageLog.RouteBindingID, binding.ID)
	}
	var reservation persistencemodel.UsageReservation
	if err := db.First(&reservation).Error; err != nil {
		t.Fatalf("load usage reservation: %v", err)
	}
	if reservation.AIModelCatalogEntryID == nil || *reservation.AIModelCatalogEntryID != entry.ID {
		t.Fatalf("usage reservation catalog entry id = %v, want %d", reservation.AIModelCatalogEntryID, entry.ID)
	}
	if reservation.RouteBindingID == nil || *reservation.RouteBindingID != binding.ID {
		t.Fatalf("usage reservation route binding id = %v, want %d", reservation.RouteBindingID, binding.ID)
	}
}

func TestAIServiceCatalogRouteAppliesEndpointOverrideToProviderCredential(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-route-endpoint-runtime.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterDashScope,
		DisplayName: "Yunwu DashScope route",
		BaseURL:     "https://yunwu.ai/v1",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "video-ali",
		DisplayName:           "Video Ali",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyVideoGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyVideoGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyVideoGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:     entry.ID,
		SourceType:         persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:         fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:        AdapterDashScope,
		ProviderModelID:    "wan-video-v1",
		EndpointPathPrefix: "/alibailian/api/v1",
		EndpointMode:       RouteEndpointModeReplacePath,
		CredentialID:       &cred.ID,
		IsEnabled:          true,
		CapacityWeight:     1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	seenBaseURL := ""
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		seenBaseURL = cred.BaseURL
		return probe, nil
	}
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "video-ali", Capability: CapabilityFamilyVideoGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if route.EndpointPathPrefix != "/alibailian/api/v1" || route.EndpointMode != RouteEndpointModeReplacePath {
		t.Fatalf("route endpoint fields = %#v, want binding endpoint strategy", route)
	}
	if _, err := service.CallVideoWithRouteUsage(context.Background(), 1, route, VideoRequest{Prompt: "move"}, UsageContext{}); err != nil {
		t.Fatalf("CallVideoWithRouteUsage() error = %v", err)
	}
	if seenBaseURL != "https://yunwu.ai/alibailian/api/v1" {
		t.Fatalf("provider credential base url = %q, want route-effective yunwu alibaba prefix", seenBaseURL)
	}
	if probe.seenVideoModel != "wan-video-v1" {
		t.Fatalf("seen video model = %q, want provider model id", probe.seenVideoModel)
	}
}

func TestAIServiceCatalogRouteEndpointCanBeLoadedFromRouteBindingID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-route-endpoint-binding-id.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "OpenAI compatible router",
		BaseURL:     "https://router.example.test/v1",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "writer",
		DisplayName:           "Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:     entry.ID,
		SourceType:         persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:         fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		ProviderModelID:    "provider-writer",
		EndpointPathPrefix: "/gateway/openai/v1",
		EndpointMode:       RouteEndpointModeReplacePath,
		CredentialID:       &cred.ID,
		IsEnabled:          true,
		CapacityWeight:     1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	seenBaseURL := ""
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(cred persistencemodel.AICredential, _ *ModelDef) (Provider, error) {
		seenBaseURL = cred.BaseURL
		return &catalogRuntimeProbeProvider{}, nil
	}
	service := NewAIService(db, registry)

	route := ModelRoute{
		ModelID:         "writer",
		RuntimeModelID:  entry.ID,
		CatalogEntryID:  entry.ID,
		RouteBindingID:  binding.ID,
		CredentialID:    cred.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		ProviderModelID: "provider-writer",
	}
	if _, err := service.CallTextWithRouteUsage(context.Background(), 1, route, TextRequest{Messages: []Message{{Role: "user", Content: "hello"}}}, UsageContext{}); err != nil {
		t.Fatalf("CallTextWithRouteUsage() error = %v", err)
	}
	if seenBaseURL != "https://router.example.test/gateway/openai/v1" {
		t.Fatalf("provider credential base url = %q, want endpoint loaded from route binding id", seenBaseURL)
	}
}

func TestAIServiceStructuredCapabilityInfersOperation(t *testing.T) {
	service := NewAIService(nil, nil)

	_, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
	})
	if err == nil || strings.Contains(err.Error(), "missing_operation_intent") {
		t.Fatalf("ResolveModelRoute() error = %v, want later catalog/model error after inferred operation", err)
	}
}

func TestAIServiceStructuredCapabilityRoutesByOperationAndInputRoles(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-structured-video-route.db",
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
	routeBinding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     AdapterVolcen,
		ProviderModelID: "provider-structured-video",
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  1,
	}
	if err := db.Create(&routeBinding).Error; err != nil {
		t.Fatalf("create structured route: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityFamilyVideoGeneration})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 || models[0].ModelID != "story-video" {
		t.Fatalf("models = %#v, want structured video catalog model", models)
	}

	firstLastModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
	})
	if err != nil {
		t.Fatalf("ListModels(first-last operation) error = %v", err)
	}
	if len(firstLastModels) != 1 || firstLastModels[0].ProviderModelID != "provider-structured-video" {
		t.Fatalf("first-last models = %#v, want structured provider route", firstLastModels)
	}

	imageToVideoModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationImageToVideo,
	})
	if err != nil {
		t.Fatalf("ListModels(image-to-video operation) error = %v", err)
	}
	if len(imageToVideoModels) != 1 || imageToVideoModels[0].ProviderModelID != "provider-structured-video" {
		t.Fatalf("image-to-video models = %#v, want structured provider route", imageToVideoModels)
	}

	inferredFirstLastModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability:    CapabilityFamilyVideoGeneration,
		TargetOutput:  "video",
		ResolveIntent: true,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ListModels(inferred first-last intent) error = %v", err)
	}
	if len(inferredFirstLastModels) != 1 ||
		inferredFirstLastModels[0].ProviderModelID != "provider-structured-video" ||
		inferredFirstLastModels[0].InferredOperation != VideoOperationFirstLastFrameToVideo {
		t.Fatalf("inferred first-last models = %#v, want structured provider route", inferredFirstLastModels)
	}

	inferredImageModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability:    CapabilityFamilyVideoGeneration,
		TargetOutput:  "video",
		ResolveIntent: true,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "generic", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ListModels(inferred image-to-video intent) error = %v", err)
	}
	if len(inferredImageModels) != 1 ||
		inferredImageModels[0].ProviderModelID != "provider-structured-video" ||
		inferredImageModels[0].InferredOperation != VideoOperationImageToVideo {
		t.Fatalf("inferred image models = %#v, want structured provider route", inferredImageModels)
	}

	missingRoleModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "generic", MediaType: "image"},
			{Role: "generic", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ListModels(first-last missing roles) error = %v", err)
	}
	if len(missingRoleModels) != 0 {
		t.Fatalf("missing-role models = %#v, want none", missingRoleModels)
	}

	route, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if route.RouteBindingID != routeBinding.ID || route.ProviderModelID != "provider-structured-video" {
		t.Fatalf("route = %#v, want structured route", route)
	}

	inferredRoute, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute(inferred operation) error = %v", err)
	}
	if inferredRoute.RouteBindingID != routeBinding.ID || inferredRoute.Operation != VideoOperationFirstLastFrameToVideo {
		t.Fatalf("inferred route = %#v, want first-last route and operation", inferredRoute)
	}

	diagnosis, err := service.DiagnoseModelRoute(context.Background(), ModelRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("DiagnoseModelRoute() error = %v", err)
	}
	if diagnosis.SelectedRouteID != routeBinding.ID {
		t.Fatalf("selected route id = %d, want %d", diagnosis.SelectedRouteID, routeBinding.ID)
	}
	if diagnosis.SelectedRoute == nil ||
		diagnosis.SelectedRoute.ResourceAccess == nil ||
		!diagnosis.SelectedRoute.ResourceAccess.Required ||
		diagnosis.SelectedRoute.ResourceAccess.Transport != "public_url" ||
		diagnosis.SelectedRoute.ResourceAccess.DependsOn != "ResourceAccessProfile" ||
		!hasString(diagnosis.SelectedRoute.ResourceAccess.InputMedia, "image") {
		t.Fatalf("selected route resource access = %#v, want ResourceAccessProfile public URL dependency", diagnosis.SelectedRoute)
	}
	_, err = service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "story-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{MediaType: "image"},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "missing_input_role") {
		t.Fatalf("ResolveModelRoute(missing role) error = %v, want missing_input_role", err)
	}
}

func TestAIServiceStructuredCapabilityUsesOperationSlotSchema(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-operation-slots.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	capabilitiesJSON := `{
		"video_generation": {
			"operations": [
				{
					"id": "first_last_frame_to_video",
					"input_slots": [
						{"id": "first_frame", "required": true, "max": 1, "roles": ["first_frame"], "modalities": ["image"]},
						{"id": "last_frame", "required": true, "max": 1, "roles": ["last_frame"], "modalities": ["image"]}
					]
				}
			],
			"reference_assets": {
				"min": 1,
				"max": 2,
				"modalities": ["image"],
				"roles": ["reference_image", "first_frame", "last_frame"]
			}
		}
	}`
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "slot-video",
		DisplayName:           "Slot Video",
		IsEnabled:             true,
		ModelCapabilitiesJSON: capabilitiesJSON,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	route := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     AdapterVolcen,
		ProviderModelID: "provider-slot-video",
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  1}
	if err := db.Create(&route).Error; err != nil {
		t.Fatalf("create route: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		ReferenceAssets: []providercontract.AIReferenceAssetIntent{
			{Role: "reference_image", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 0 {
		t.Fatalf("ordinary reference for first-last slot models = %#v, want none", models)
	}

	resolved, err := service.ResolveModelRoute(ModelRouteRequest{
		ModelID:    "slot-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "first_frame", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if resolved.RouteBindingID != route.ID || resolved.ProviderModelID != "provider-slot-video" {
		t.Fatalf("resolved route = %#v", resolved)
	}

	diagnosis, err := service.DiagnoseModelRoute(context.Background(), ModelRouteRequest{
		ModelID:    "slot-video",
		Capability: CapabilityFamilyVideoGeneration,
		Operation:  VideoOperationFirstLastFrameToVideo,
		RouteGroup: "default",
		ReferenceAssets: []RouteReferenceAssetIntent{
			{Role: "reference_image", MediaType: "image"},
			{Role: "last_frame", MediaType: "image"},
		},
	})
	if err != nil {
		t.Fatalf("DiagnoseModelRoute() error = %v", err)
	}
	if len(diagnosis.Candidates) != 1 ||
		!hasString(diagnosis.Candidates[0].Reasons, "missing_model_capability:unsupported_operation_input:reference_image:image") {
		t.Fatalf("diagnosis = %#v, want operation slot reasons", diagnosis.Candidates)
	}
}

func TestAIServiceCatalogRouteRejectsUnsupportedSourceWithoutLegacyFallback(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-route-no-legacy-fallback.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "writer",
		DisplayName:   "Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityFamilyTextGeneration,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	called := false
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		called = true
		return &catalogRuntimeProbeProvider{}, nil
	}
	service := NewAIService(db, registry)

	_, err := service.CallTextWithRouteUsage(context.Background(), 1, ModelRoute{
		ModelID:         "writer",
		RuntimeModelID:  99,
		CatalogEntryID:  entry.ID,
		SourceType:      "unknown_source",
		ProviderModelID: "provider-writer-v2",
	}, TextRequest{Messages: []Message{{Role: "user", Content: "hello"}}}, UsageContext{})
	if err == nil {
		t.Fatal("CallTextWithRouteUsage() succeeded through legacy fallback, want unsupported source error")
	}
	if called {
		t.Fatal("legacy provider was called after catalog route source failed")
	}
}

func TestAIServiceCatalogRouteCanCallImageProviderWithProviderModelID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-image-runtime-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{AdapterType: AdapterOpenAICompat, DisplayName: "Catalog image provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "image-fast",
		DisplayName:           "Image Fast",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyImageGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyImageGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyImageGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-image-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) { return probe, nil }
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "image-fast", Capability: CapabilityFamilyImageGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallImageWithRouteUsage(context.Background(), 1, route, ImageRequest{Prompt: "draw"}, UsageContext{})
	if err != nil {
		t.Fatalf("CallImageWithRouteUsage() error = %v", err)
	}
	if len(resp.URLs) != 1 || probe.seenImageModel != "provider-image-v2" {
		t.Fatalf("response=%#v seenImageModel=%q, want provider model id", resp, probe.seenImageModel)
	}
}

func TestAIServiceCatalogRouteCanCallTTSProviderWithProviderModelID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-tts-runtime-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{AdapterType: AdapterOpenAICompat, DisplayName: "Catalog TTS provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "voice-main",
		DisplayName:           "Voice Main",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyAudioGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyAudioGeneration),
		SupportedParams:       testSupportedParamsProfile(CapabilityFamilyAudioGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-voice-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) { return probe, nil }
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "voice-main", Capability: CapabilityFamilyAudioGeneration})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	resp, err := service.CallTTSWithRouteUsage(context.Background(), 1, route, media.TTSRequest{Text: "hello", Voice: "narrator"}, UsageContext{})
	if err != nil {
		t.Fatalf("CallTTSWithRouteUsage() error = %v", err)
	}
	if string(resp.Audio) != "mp3" || probe.seenTTSModel != "provider-voice-v2" {
		t.Fatalf("response=%#v seenTTSModel=%q, want provider model id", resp, probe.seenTTSModel)
	}
}

func TestAIServiceModelCatalogDefaultFilterIncludesSubtitleAlign(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-align-default.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Align provider", AdapterOpenAICompat, "align-model", "provider-align-model", 10, CapabilityFamilyAudioGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	for _, model := range models {
		if model.ModelID == "align-model" {
			return
		}
	}
	t.Fatalf("ListModels(default) = %#v, want forced-alignment audio_generation model", models)
}

func TestAIServiceModelCatalogContractResolvesCatalogProviderBinding(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-binding-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Primary provider", AdapterOpenAICompat, "writer", "provider-gpt-5.2", 10, CapabilityFamilyTextGeneration)
	createCatalogRouteVariant(t, db, 2, "Image provider", AdapterOpenAICompat, "image-main", "provider-image-1", 10, CapabilityFamilyImageGeneration)
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if binding.ProviderModelID != "provider-gpt-5.2" || binding.AdapterType != AdapterOpenAICompat || binding.ProviderName != "Primary provider" {
		t.Fatalf("binding = %#v, want provider-backed text route", binding)
	}

	if _, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityFamilyImageGeneration,
	}); err == nil {
		t.Fatal("ResolveModel() for unsupported capability succeeded, want error")
	}
}

func TestAIServiceResolveModelUsesCatalogRouteWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-binding-catalog-only.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog-only resolve test should not create legacy ai_model_configs")
	}
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Catalog provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	localEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "writer",
		DisplayName:           "Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
	}
	relayGatewayEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "priority-writer",
		DisplayName:           "Priority Writer",
		IsEnabled:             true,
		Capabilities:          CapabilityFamilyTextGeneration,
		ModelCapabilitiesJSON: testStructuredCapabilitiesJSON(CapabilityFamilyTextGeneration),
	}
	if err := db.Create(&localEntry).Error; err != nil {
		t.Fatalf("create local catalog entry: %v", err)
	}
	if err := db.Create(&relayGatewayEntry).Error; err != nil {
		t.Fatalf("create relay gateway catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  localEntry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, cred.ID),
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-writer-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}).Error; err != nil {
		t.Fatalf("create local route binding: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  relayGatewayEntry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "priority",
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     AdapterOpenAICompat,
		ProviderModelID: "relay-writer-v2",
		IsEnabled:       true,
		CapacityWeight:  1}).Error; err != nil {
		t.Fatalf("create relay gateway route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	localBinding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveModel(local catalog route) error = %v", err)
	}
	if localBinding.CatalogEntryID != localEntry.ID || localBinding.ProviderModelID != "provider-writer-v2" || localBinding.AdapterType != AdapterOpenAICompat || localBinding.ProviderName != "Catalog provider" {
		t.Fatalf("local catalog binding = %#v, want provider metadata from credential without legacy config", localBinding)
	}

	relayGatewayBinding, err := service.ResolveModel(WithProviderRouteGroup(context.Background(), "priority"), providercontract.AIModelResolveRequest{
		ModelID:    "priority-writer",
		Capability: CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("ResolveModel(relay gateway catalog route) error = %v", err)
	}
	if relayGatewayBinding.CatalogEntryID != relayGatewayEntry.ID || relayGatewayBinding.ProviderModelID != "relay-writer-v2" || relayGatewayBinding.AdapterType != AdapterOpenAICompat || relayGatewayBinding.ProviderName != "priority" {
		t.Fatalf("relay gateway catalog binding = %#v, want route source/group without legacy config", relayGatewayBinding)
	}
}
