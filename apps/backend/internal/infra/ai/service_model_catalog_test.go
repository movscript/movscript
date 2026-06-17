package ai

import (
	"context"
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
	createCatalogRouteVariant(t, db, 1, "Busy provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-busy", 10, CapabilityText)
	createCatalogRouteVariant(t, db, 2, "Healthy provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-healthy", 20, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("ListModels() count = %d, want 1: %#v", len(models), models)
	}
	if models[0].ModelID != "gpt-5.2" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("catalog model descriptor = %#v, want merged gpt-5.2 without provider name", models[0])
	}

	variants, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText, ProviderVariants: true})
	if err != nil {
		t.Fatalf("ListModels(provider variants) error = %v", err)
	}
	if len(variants) != 2 || variants[0].ProviderName == "" || variants[0].CredentialID == 0 || variants[0].ProviderModelID == "" {
		t.Fatalf("provider variant descriptors = %#v, want per-provider metadata without legacy runtime model id", variants)
	}
}

func TestAIServiceModelCatalogUsesCatalogEntriesAndRouteBindings(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-entry-contract.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	defaultEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "video-fast",
		ProviderModelID: "kling-v2",
		DisplayName:     "Video Fast",
		ShortName:       "Fast",
		IsEnabled:       true,
		Capabilities:    CapabilityVideo,
		PricingMode:     string(PricingPerSecond),
		SupportedParams: `[{"key":"duration","type":"number"}]`,
	}
	if err := db.Create(&defaultEntry).Error; err != nil {
		t.Fatalf("create default catalog entry: %v", err)
	}
	priorityEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "video-fast",
		ProviderModelID: "kling-v2-master",
		DisplayName:     "Video Fast",
		ShortName:       "Fast",
		IsEnabled:       true,
		Capabilities:    CapabilityVideo,
		PricingMode:     string(PricingPerSecond),
		SupportedParams: `[{"key":"duration","type":"number"}]`,
	}
	if err := db.Create(&priorityEntry).Error; err != nil {
		t.Fatalf("create priority catalog entry: %v", err)
	}
	bindings := []persistencemodel.AIModelRouteBinding{
		{CatalogEntryID: defaultEntry.ID, SourceType: persistencemodel.ModelRouteSourceNewAPI, RouteGroup: "default", IsEnabled: true, Priority: 1, CapacityWeight: 1},
		{CatalogEntryID: priorityEntry.ID, SourceType: persistencemodel.ModelRouteSourceNewAPI, RouteGroup: "priority", IsEnabled: true, Priority: 10, CapacityWeight: 2},
	}
	if err := db.Create(&bindings).Error; err != nil {
		t.Fatalf("create route bindings: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	allModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityVideo})
	if err != nil {
		t.Fatalf("ListModels(all route groups) error = %v", err)
	}
	if len(allModels) != 1 || allModels[0].ModelID != "video-fast" || allModels[0].ProviderVariants != 2 {
		t.Fatalf("merged catalog models = %#v, want one public model with two provider variants", allModels)
	}

	defaultModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityVideo, RouteGroup: "default"})
	if err != nil {
		t.Fatalf("ListModels(default route group) error = %v", err)
	}
	if len(defaultModels) != 1 {
		t.Fatalf("default models = %#v, want one default model", defaultModels)
	}
	if defaultModels[0].ModelID != "video-fast" || defaultModels[0].CatalogEntryID != defaultEntry.ID || defaultModels[0].ProviderModelID != "kling-v2" {
		t.Fatalf("default model alias = %#v, want stable public id with default provider id", defaultModels[0])
	}

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityVideo, RouteGroup: "priority"})
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
	if len(model.SupportedParams) != 1 || model.SupportedParams[0]["key"] != "duration" {
		t.Fatalf("supported params = %#v, want catalog params", model.SupportedParams)
	}

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "video-fast", Capability: CapabilityVideo, RouteGroup: "priority"})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog route group) error = %v", err)
	}
	if route.ModelID != "video-fast" || route.ProviderModelID != "kling-v2-master" || route.SelectionReason != "catalog_route_group" {
		t.Fatalf("catalog route = %#v, want public id resolved to priority provider id", route)
	}
	anyGroupRoute, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "video-fast", Capability: CapabilityVideo})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog public id) error = %v", err)
	}
	if anyGroupRoute.ProviderModelID != "kling-v2-master" {
		t.Fatalf("catalog public-id route = %#v, want highest-priority provider id", anyGroupRoute)
	}
	if _, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "kling-v2-master", Capability: CapabilityVideo, RouteGroup: "priority"}); err == nil {
		t.Fatal("ResolveModelRoute(provider model id) succeeded, want provider_model_id hidden behind public model id")
	}
	routeByEntryID, err := service.ResolveModelRoute(ModelRouteRequest{CatalogEntryID: priorityEntry.ID, Capability: CapabilityVideo, RouteGroup: "priority"})
	if err != nil {
		t.Fatalf("ResolveModelRoute(catalog entry id) error = %v", err)
	}
	if routeByEntryID.CatalogEntryID != priorityEntry.ID || routeByEntryID.SourceType != persistencemodel.ModelRouteSourceNewAPI || routeByEntryID.ProviderModelID != "kling-v2-master" {
		t.Fatalf("catalog entry route = %#v, want new-api binding route by catalog entry id", routeByEntryID)
	}
}

func TestAIServiceListModelsDoesNotFallbackToLegacyConfigsWhenCatalogExists(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-first-over-legacy.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "catalog-writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Catalog Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "default",
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 || models[0].ModelID != "catalog-writer" || models[0].CatalogEntryID != entry.ID {
		t.Fatalf("models = %#v, want only catalog entry model", models)
	}
	if models[0].ProviderModelID == "legacy-writer" || models[0].ModelID == "legacy-writer" {
		t.Fatalf("models = %#v, leaked legacy ai_model_configs fallback", models)
	}

	imageModels, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityImage})
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
		PublicModelID:   "catalog-writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Catalog Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "default",
		IsEnabled:      true,
		Priority:       10,
		CapacityWeight: 1,
	}).Error; err != nil {
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
		PublicModelID:   "catalog-writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Catalog Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "default",
		IsEnabled:      true,
		Priority:       1,
		CapacityWeight: 1,
	}).Error; err != nil {
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
		PublicModelID:   "image-fast",
		ProviderModelID: "provider-image-v2",
		DisplayName:     "Image Fast",
		IsEnabled:       true,
		Capabilities:    CapabilityImage,
		PricingMode:     string(PricingPerImage),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		RouteGroup:     "priority",
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		Priority:       1,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	service := NewAIService(db, NewRegistry(db, nil))
	route, err := service.ResolveModelRoute(ModelRouteRequest{RouteBindingID: binding.ID, Capability: CapabilityImage})
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

func TestCatalogRouteDefinitionUsesCatalogRuntimeModel(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-runtime-model.db",
		&persistencemodel.AIModelCatalogEntry{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:      "writer",
		ProviderModelID:    "provider-writer-v2",
		DisplayName:        "Writer",
		ShortName:          "write",
		IsEnabled:          true,
		Capabilities:       CapabilityText,
		PricingMode:        string(PricingPerToken),
		SupportedParams:    `[{"key":"temperature","type":"number"}]`,
		CreditsInputPer1M:  1.5,
		CreditsOutputPer1M: 2.5,
		CreditsPerCall:     0.25,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	definition, handled, err := service.catalogRouteDefinition(context.Background(), ModelRoute{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceNewAPI,
		ProviderModelID: "provider-writer-v2",
	}, CapabilityText)
	if err != nil {
		t.Fatalf("catalogRouteDefinition() error = %v", err)
	}
	if !handled {
		t.Fatal("catalogRouteDefinition() handled = false, want true")
	}
	if definition.model.ID != entry.ID || definition.model.ProviderModelID != "provider-writer-v2" || definition.model.DisplayName != "Writer" {
		t.Fatalf("catalog runtime model = %#v, want fields copied from catalog entry", definition.model)
	}
	if definition.model.CreditsInputPer1M != 1.5 || definition.model.CreditsOutputPer1M != 2.5 || definition.model.CreditsPerCall != 0.25 {
		t.Fatalf("catalog runtime pricing = %#v, want catalog pricing", definition.model)
	}
	pricing := definition.model.pricing()
	if pricing.CreditsInputPer1M != 1.5 || pricing.CreditsOutputPer1M != 2.5 || pricing.CreditsPerCall != 0.25 {
		t.Fatalf("pricing = %#v, want derived pricing from catalog runtime model", pricing)
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
		PublicModelID:   "writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) {
		return probe, nil
	}
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "writer", Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ResolveModelRoute() error = %v", err)
	}
	if route.CatalogEntryID != entry.ID || route.CredentialID != cred.ID || route.ProviderModelID != "provider-writer-v2" {
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

func TestAIServiceCatalogRouteRejectsUnsupportedSourceWithoutLegacyFallback(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-route-no-legacy-fallback.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
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
		ProviderModelID: entry.ProviderModelID,
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
		PublicModelID:   "image-fast",
		ProviderModelID: "provider-image-v2",
		DisplayName:     "Image Fast",
		IsEnabled:       true,
		Capabilities:    CapabilityImage,
		PricingMode:     string(PricingPerImage),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) { return probe, nil }
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "image-fast", Capability: CapabilityImage})
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
		PublicModelID:   "voice-main",
		ProviderModelID: "provider-voice-v2",
		DisplayName:     "Voice Main",
		IsEnabled:       true,
		Capabilities:    CapabilityAudioTTS,
		PricingMode:     string(PricingPerCall),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	probe := &catalogRuntimeProbeProvider{}
	registry := NewRegistry(db, nil)
	registry.providerFactory = func(persistencemodel.AICredential, *ModelDef) (Provider, error) { return probe, nil }
	service := NewAIService(db, registry)

	route, err := service.ResolveModelRoute(ModelRouteRequest{ModelID: "voice-main", Capability: CapabilityAudioTTS})
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
	createCatalogRouteVariant(t, db, 1, "Align provider", AdapterOpenAICompat, "align-model", "provider-align-model", 10, CapabilitySubAlign)
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
	t.Fatalf("ListModels(default) = %#v, want subtitle_align model", models)
}

func TestAIServiceModelCatalogContractResolvesCatalogProviderBinding(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-binding-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariant(t, db, 1, "Primary provider", AdapterOpenAICompat, "writer", "provider-gpt-5.2", 10, CapabilityText)
	createCatalogRouteVariant(t, db, 2, "Image provider", AdapterOpenAICompat, "image-main", "provider-image-1", 10, CapabilityImage)
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if binding.ProviderModelID != "provider-gpt-5.2" || binding.AdapterType != AdapterOpenAICompat || binding.ProviderName != "Primary provider" {
		t.Fatalf("binding = %#v, want provider-backed text route", binding)
	}

	if _, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityImage,
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
		PublicModelID:   "writer",
		ProviderModelID: "provider-writer-v2",
		DisplayName:     "Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	newAPIEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "priority-writer",
		ProviderModelID: "newapi-writer-v2",
		DisplayName:     "Priority Writer",
		IsEnabled:       true,
		Capabilities:    CapabilityText,
		PricingMode:     string(PricingPerToken),
	}
	if err := db.Create(&localEntry).Error; err != nil {
		t.Fatalf("create local catalog entry: %v", err)
	}
	if err := db.Create(&newAPIEntry).Error; err != nil {
		t.Fatalf("create new-api catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: localEntry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create local route binding: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: newAPIEntry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "priority",
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create new-api route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	localBinding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "writer",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel(local catalog route) error = %v", err)
	}
	if localBinding.CatalogEntryID != localEntry.ID || localBinding.ProviderModelID != "provider-writer-v2" || localBinding.AdapterType != AdapterOpenAICompat || localBinding.ProviderName != "Catalog provider" {
		t.Fatalf("local catalog binding = %#v, want provider metadata from credential without legacy config", localBinding)
	}

	newAPIBinding, err := service.ResolveModel(WithProviderRouteGroup(context.Background(), "priority"), providercontract.AIModelResolveRequest{
		ModelID:    "priority-writer",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel(new-api catalog route) error = %v", err)
	}
	if newAPIBinding.CatalogEntryID != newAPIEntry.ID || newAPIBinding.ProviderModelID != "newapi-writer-v2" || newAPIBinding.AdapterType != persistencemodel.ModelRouteSourceNewAPI || newAPIBinding.ProviderName != "priority" {
		t.Fatalf("new-api catalog binding = %#v, want route source/group without legacy config", newAPIBinding)
	}
}
