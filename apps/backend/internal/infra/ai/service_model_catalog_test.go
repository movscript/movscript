package ai

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
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
		&persistencemodel.AIModelConfig{},
	)
	createTextProviderVariant(t, db, 1, "Busy provider")
	createTextProviderVariant(t, db, 2, "Healthy provider")
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("ListModels() count = %d, want 1: %#v", len(models), models)
	}
	if models[0].ModelID != "gpt-5.2" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("logical model descriptor = %#v, want merged gpt-5.2 without provider name", models[0])
	}

	variants, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText, ProviderVariants: true})
	if err != nil {
		t.Fatalf("ListModels(provider variants) error = %v", err)
	}
	if len(variants) != 2 || variants[0].ProviderName == "" || variants[0].ModelConfigID == 0 {
		t.Fatalf("provider variant descriptors = %#v, want per-provider entries", variants)
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
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariant(t, db, 1, "Align provider", "align-model", 10, CapabilitySubAlign)
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

func TestAIServiceModelCatalogContractResolvesProviderBinding(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-binding-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariant(t, db, 1, "Primary provider", "gpt-5.2", 10, CapabilityText)
	createProviderVariant(t, db, 2, "Image provider", "gpt-image-1", 10, CapabilityImage)
	if err := db.Model(&persistencemodel.AIModelConfig{}).Where("id = ?", 1).Update("model_id_override", "provider-gpt-5.2").Error; err != nil {
		t.Fatalf("set model override: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "provider-gpt-5.2",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if binding.ModelConfigID != 1 || binding.ProviderModelID != "provider-gpt-5.2" || binding.AdapterType != AdapterOpenAICompat || binding.ProviderName != "Primary provider" {
		t.Fatalf("binding = %#v, want provider-backed text route", binding)
	}

	if _, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "provider-gpt-5.2",
		Capability: CapabilityImage,
	}); err == nil {
		t.Fatal("ResolveModel() for unsupported capability succeeded, want error")
	}
}

func TestAIServiceModelCatalogContractCanResolveLocalModelConfigID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-binding-legacy-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 7},
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Legacy provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:        gorm.Model{ID: 9},
		CredentialID: cred.ID,
		ModelDefID:   "gpt-5.2",
		IsEnabled:    true,
		Priority:     10,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelConfigID: cfg.ID,
		Capability:    CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel(legacy id) error = %v", err)
	}
	if binding.ModelID != "gpt-5.2" || binding.ModelConfigID != cfg.ID || binding.SelectionReason != "local_provider" {
		t.Fatalf("local provider binding = %#v, want logical gpt-5.2", binding)
	}
}
