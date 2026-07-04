package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestModelCatalogRejectsDuplicateEntryForSamePublicID(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	if _, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Video Fast",
		Capabilities:  "video_generation",
	}); err != nil {
		t.Fatalf("CreateModelCatalogEntry() first error = %v", err)
	}
	_, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Duplicate",
		Capabilities:  "video_generation",
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "catalog entry already exists") {
		t.Fatalf("duplicate catalog entry error = %v, want ErrInvalidModelCatalog with already exists", err)
	}

	other, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() other error = %v", err)
	}
	_, err = service.UpdateModelCatalogEntry(ctx, strconvID(other.ID), ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image_generation",
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "catalog entry already exists") {
		t.Fatalf("duplicate catalog entry update error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestListModelCatalogTemplatesReturnsDisplaySafeDefaults(t *testing.T) {
	service := newTestService(t)
	templates := service.ListModelCatalogTemplates(context.Background(), "")
	if len(templates) == 0 {
		t.Fatal("expected catalog templates")
	}
	for _, template := range templates {
		if strings.TrimSpace(template.Lab) == "" {
			t.Fatalf("template %s has empty lab", template.ID)
		}
		if strings.TrimSpace(template.DefaultPublicModelID) == "" {
			t.Fatalf("template %s has empty default_public_model_id", template.ID)
		}
		if strings.TrimSpace(template.SourceStatus) == "" {
			t.Fatalf("template %s has empty source_status", template.ID)
		}
		if strings.Contains(template.DefaultPublicModelID, ":") {
			t.Fatalf("template %s exposes provider namespace in default_public_model_id %q", template.ID, template.DefaultPublicModelID)
		}
	}

	seedTemplates := service.ListModelCatalogTemplates(context.Background(), "seed")
	if len(seedTemplates) == 0 {
		t.Fatal("expected seed templates")
	}
	for _, template := range seedTemplates {
		if template.Lab != "seed" {
			t.Fatalf("seed filter returned template %s with lab %q", template.ID, template.Lab)
		}
	}
	if got := service.ListModelCatalogTemplates(context.Background(), "volcengine"); len(got) != 0 {
		t.Fatalf("volcengine is a provider/route family, not a lab; got %#v", got)
	}
}

func TestEnableComboTemplateCreatesCatalogEntryAndRoute(t *testing.T) {
	service := newTestService(t)
	if err := service.db.AutoMigrate(&persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}); err != nil {
		t.Fatalf("migrate provider tables: %v", err)
	}
	ctx := context.Background()
	comboKey := "volcengine:seedance-2-0@volcengine_ark_official"

	result, err := service.EnableComboTemplate(ctx, comboKey, EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate() error = %v", err)
	}
	if !result.CreatedCatalogEntry || !result.CreatedRouteBinding {
		t.Fatalf("created flags = catalog:%v route:%v, want both true", result.CreatedCatalogEntry, result.CreatedRouteBinding)
	}
	if result.Provider.ProviderKind != persistencemodel.AIProviderKindVolcengineArk {
		t.Fatalf("provider kind = %q, want Ark official", result.Provider.ProviderKind)
	}
	if result.Provider.ProviderType != persistencemodel.AIProviderTypeVolcen || result.Provider.Profile != persistencemodel.AIProviderProfileArk {
		t.Fatalf("provider type/profile = %q/%q, want volcen/ark", result.Provider.ProviderType, result.Provider.Profile)
	}
	if result.CatalogEntry.PublicModelID != "seedance-2-0" ||
		result.CatalogEntry.ModelTemplateKey != "volcengine:seedance-2-0" ||
		result.CatalogEntry.TemplateVersion != "builtin.v1" ||
		result.RouteBinding.ProviderID != result.Provider.ProviderID ||
		result.RouteBinding.ComboTemplateKey != comboKey ||
		result.RouteBinding.TemplateVersion != "builtin.v1" ||
		result.RouteBinding.AdapterType != "volcen" ||
		result.RouteBinding.ProviderModelID != "doubao-seedance-2-0-260128" ||
		result.RouteBinding.SourceType != persistencemodel.ModelRouteSourceLocalProvider {
		t.Fatalf("unexpected combo result: %#v", result)
	}

	second, err := service.EnableComboTemplate(ctx, comboKey, EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate() second error = %v", err)
	}
	if second.CreatedCatalogEntry || second.CreatedRouteBinding {
		t.Fatalf("second enable created catalog:%v route:%v, want reuse", second.CreatedCatalogEntry, second.CreatedRouteBinding)
	}
	if second.CatalogEntry.ID != result.CatalogEntry.ID || second.RouteBinding.ID != result.RouteBinding.ID {
		t.Fatalf("second enable returned entry/route %#v, want existing ids entry=%d route=%d", second, result.CatalogEntry.ID, result.RouteBinding.ID)
	}
}

func TestEnableComboTemplateUsesComboAdapterForSeedream45Params(t *testing.T) {
	service := newTestService(t)
	if err := service.db.AutoMigrate(&persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}); err != nil {
		t.Fatalf("migrate provider tables: %v", err)
	}

	result, err := service.EnableComboTemplate(context.Background(), "volcengine:seedream-4-5@volcengine_ark_official", EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate(seedream 4.5) error = %v", err)
	}
	if result.RouteBinding.AdapterType != infraai.AdapterVolcen {
		t.Fatalf("route adapter = %q, want volcen", result.RouteBinding.AdapterType)
	}

	paramsByOperation, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterVolcen,
		infraai.SplitCapabilities(result.CatalogEntry.Capabilities),
		result.CatalogEntry.ModelCapabilitiesJSON,
		result.CatalogEntry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("supported params profile should be explicit, raw=%s", result.CatalogEntry.SupportedParams)
	}
	imageParams := paramsByOperation[infraai.ImageOperationTextToImage]
	if !adminParamDefsContain(imageParams, "image_size") {
		t.Fatalf("seedream 4.5 params = %#v, want image_size", imageParams)
	}
	if adminParamDefsContain(imageParams, "output_format") {
		t.Fatalf("seedream 4.5 params = %#v, must not expose output_format", imageParams)
	}
}

func TestEnableComboTemplateDerivesSeedanceVideoSupportedParamsFromTemplate(t *testing.T) {
	service := newTestService(t)
	if err := service.db.AutoMigrate(&persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}); err != nil {
		t.Fatalf("migrate provider tables: %v", err)
	}

	seedance20, err := service.EnableComboTemplate(context.Background(), "volcengine:seedance-2-0@volcengine_ark_official", EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate(seedance 2.0) error = %v", err)
	}
	params20, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterVolcen,
		infraai.SplitCapabilities(seedance20.CatalogEntry.Capabilities),
		seedance20.CatalogEntry.ModelCapabilitiesJSON,
		seedance20.CatalogEntry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("Seedance 2.0 supported params profile should be explicit, raw=%s", seedance20.CatalogEntry.SupportedParams)
	}
	promptParams := params20[infraai.VideoOperationPromptToVideo]
	for _, key := range []string{"duration", "aspect_ratio", "resolution", "audio", "watermark", "return_last_frame", "web_search", "execution_expires_after", "priority"} {
		if !adminParamDefsContain(promptParams, key) {
			t.Fatalf("Seedance 2.0 prompt params missing %s: %#v", key, promptParams)
		}
	}
	if adminParamDefsContain(promptParams, "seed") || adminParamDefsContain(promptParams, "frames") || adminParamDefsContain(promptParams, "fixed_camera") || adminParamDefsContain(promptParams, "service_tier") || adminParamDefsContain(promptParams, "workspace") {
		t.Fatalf("Seedance 2.0 prompt params include unsupported fields: %#v", promptParams)
	}
	resolution, ok := adminFindParam(promptParams, "resolution")
	if !ok || !adminParamOptionsContain(resolution, "4k") {
		t.Fatalf("Seedance 2.0 prompt resolution = %#v, want 4k", resolution)
	}

	seedance15, err := service.EnableComboTemplate(context.Background(), "volcengine:seedance-1-5-pro@volcengine_ark_official", EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate(seedance 1.5) error = %v", err)
	}
	params15, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterVolcen,
		infraai.SplitCapabilities(seedance15.CatalogEntry.Capabilities),
		seedance15.CatalogEntry.ModelCapabilitiesJSON,
		seedance15.CatalogEntry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("Seedance 1.5 supported params profile should be explicit, raw=%s", seedance15.CatalogEntry.SupportedParams)
	}
	if !adminParamDefsContain(params15[infraai.VideoOperationPromptToVideo], "fixed_camera") {
		t.Fatalf("Seedance 1.5 prompt params should include fixed_camera: %#v", params15[infraai.VideoOperationPromptToVideo])
	}
	for _, operation := range []string{infraai.VideoOperationImageToVideo, infraai.VideoOperationFirstFrameToVideo, infraai.VideoOperationFirstLastFrameToVideo} {
		if adminParamDefsContain(params15[operation], "fixed_camera") {
			t.Fatalf("Seedance 1.5 %s params must omit fixed_camera: %#v", operation, params15[operation])
		}
	}
}

func TestEnableComboTemplateCreates83ziSeedance20CatalogEntryAndRoute(t *testing.T) {
	service := newTestService(t)
	if err := service.db.AutoMigrate(&persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}); err != nil {
		t.Fatalf("migrate provider tables: %v", err)
	}
	if err := service.db.Create(&persistencemodel.AIProvider{
		ProviderID:               "83zi_sd2_gateway:1",
		ProviderType:             "83zi",
		Profile:                  "sd2",
		ProviderKind:             "83zi_sd2_gateway",
		ProviderCategory:         persistencemodel.AIProviderCategoryAggregatorGateway,
		DefaultAdapterType:       infraai.AdapterVyroSeedance,
		AdapterKey:               infraai.AdapterVyroSeedance,
		TemplateVersion:          "builtin.v1",
		DisplayName:              "83zi Seedance 2.0",
		BaseURLPrefix:            "http://115.190.186.95:3002/v1",
		AssetLibraryStateJSON:    "{}",
		TrustedResourceStateJSON: "{}",
		HealthJSON:               "{}",
		IsEnabled:                true,
	}).Error; err != nil {
		t.Fatalf("seed 83zi provider: %v", err)
	}

	result, err := service.EnableComboTemplate(context.Background(), "83zi:83zi-seedance-2-0@83zi_sd2_gateway", EnableComboTemplateInput{})
	if err != nil {
		t.Fatalf("EnableComboTemplate(83zi seedance 2.0) error = %v", err)
	}
	if result.Provider.ProviderKind != "83zi_sd2_gateway" ||
		result.RouteBinding.AdapterType != infraai.AdapterVyroSeedance ||
		result.RouteBinding.ProviderModelID != "Seedance-2.0" {
		t.Fatalf("unexpected 83zi combo result: %#v", result)
	}
	if result.CatalogEntry.PublicModelID != "83zi-seedance-2-0" ||
		result.CatalogEntry.ModelTemplateKey != "83zi:83zi-seedance-2-0" ||
		strings.Contains(result.CatalogEntry.ModelCapabilitiesJSON, infraai.VideoOperationFirstLastFrameToVideo) {
		t.Fatalf("unexpected 83zi catalog entry: %#v", result.CatalogEntry)
	}
	paramsByOperation, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterVyroSeedance,
		infraai.SplitCapabilities(result.CatalogEntry.Capabilities),
		result.CatalogEntry.ModelCapabilitiesJSON,
		result.CatalogEntry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("83zi Seedance 2.0 supported params profile should be explicit, raw=%s", result.CatalogEntry.SupportedParams)
	}
	promptParams := paramsByOperation[infraai.VideoOperationPromptToVideo]
	for _, key := range []string{"duration", "aspect_ratio", "resolution", "audio"} {
		if !adminParamDefsContain(promptParams, key) {
			t.Fatalf("83zi Seedance 2.0 prompt params missing %s: %#v", key, promptParams)
		}
	}
	for _, key := range []string{"watermark", "return_last_frame", "web_search", "priority", "execution_expires_after", "generate_audio"} {
		if adminParamDefsContain(promptParams, key) {
			t.Fatalf("83zi Seedance 2.0 prompt params include unsupported %s: %#v", key, promptParams)
		}
	}
}

func adminParamDefsContain(params []infraai.ParamDef, key string) bool {
	for _, param := range params {
		if param.Key == key {
			return true
		}
	}
	return false
}

func adminFindParam(params []infraai.ParamDef, key string) (infraai.ParamDef, bool) {
	for _, param := range params {
		if param.Key == key {
			return param, true
		}
	}
	return infraai.ParamDef{}, false
}

func adminParamOptionsContain(param infraai.ParamDef, option string) bool {
	for _, candidate := range param.Options {
		if candidate == option {
			return true
		}
	}
	return false
}

func TestProviderRemoteModelDiscoveryDoesNotMutateCatalogOrRoutes(t *testing.T) {
	service := newTestService(t)
	service.registry = infraai.NewRegistry(service.db, nil)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"gpt-provider-a"},{"id":"gpt-provider-b"}]}`))
	}))
	defer upstream.Close()

	credential := persistencemodel.AICredential{
		AdapterType: "openai_compat",
		DisplayName: "OpenAI compatible",
		BaseURL:     upstream.URL,
		IsEnabled:   true,
	}
	if err := service.db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}

	ids, err := service.ListRemoteModels(ctx, strconvID(credential.ID))
	if err != nil {
		t.Fatalf("ListRemoteModels() error = %v", err)
	}
	if strings.Join(ids, ",") != "gpt-provider-a,gpt-provider-b" {
		t.Fatalf("remote model ids = %#v, want provider ids only", ids)
	}

	var catalogCount int64
	if err := service.db.Model(&persistencemodel.AIModelCatalogEntry{}).Count(&catalogCount).Error; err != nil {
		t.Fatalf("count catalog entries: %v", err)
	}
	if catalogCount != 0 {
		t.Fatalf("catalog entry count = %d, want Provider discovery to leave Catalog unchanged", catalogCount)
	}
	var routeCount int64
	if err := service.db.Model(&persistencemodel.AIModelRouteBinding{}).Count(&routeCount).Error; err != nil {
		t.Fatalf("count route bindings: %v", err)
	}
	if routeCount != 0 {
		t.Fatalf("route binding count = %d, want Provider discovery to leave Route unchanged", routeCount)
	}
}

func TestPreviewModelImportFetchesOpenAICompatibleModelsWithoutMutating(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-import-preview" {
			t.Fatalf("authorization = %q, want bearer key", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"zeta-model"},{"id":"alpha-model"},{"id":"alpha-model"}]}`))
	}))
	defer upstream.Close()

	result, err := service.PreviewModelImport(ctx, ModelImportPreviewInput{
		Provider: ModelImportProviderInput{
			DisplayName:   "Preview Gateway",
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-import-preview",
		},
	})
	if err != nil {
		t.Fatalf("PreviewModelImport() error = %v", err)
	}
	if result.ProviderKind != persistencemodel.AIProviderKindOpenAICompatGateway || result.RouteGroup != "default" {
		t.Fatalf("unexpected preview metadata: %+v", result)
	}
	if len(result.Models) != 2 || result.Models[0].ProviderModelID != "alpha-model" || result.Models[1].ProviderModelID != "zeta-model" {
		t.Fatalf("preview models = %#v, want sorted unique ids", result.Models)
	}
	if result.Models[0].Status != "new" || !result.Models[0].Recommended || strings.Join(result.Models[0].Capabilities, ",") != "text_generation" {
		t.Fatalf("unexpected model plan: %+v", result.Models[0])
	}
	var providerCount int64
	if err := service.db.Model(&persistencemodel.AIProvider{}).Count(&providerCount).Error; err != nil {
		t.Fatalf("count providers: %v", err)
	}
	if providerCount != 0 {
		t.Fatalf("provider count = %d, want preview to avoid writes", providerCount)
	}
}

func TestPreviewModelImportInfersGatewayModelCapabilities(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[
			{"id":"gpt-4.1-2025-04-14"},
			{"id":"gpt-image-1.5"},
			{"id":"veo-3.1-fast-generate-preview"},
			{"id":"qwen3-omni-flash-2025-09-15"},
			{"id":"musicgen"},
			{"id":"deepseek-r1-0528"},
			{"id":"gpt-4o-transcribe"}
		]}`))
	}))
	defer upstream.Close()

	result, err := service.PreviewModelImport(ctx, ModelImportPreviewInput{
		Provider: ModelImportProviderInput{
			DisplayName:   "APIyi Gateway",
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-import-preview",
		},
	})
	if err != nil {
		t.Fatalf("PreviewModelImport() error = %v", err)
	}

	assertImportPlan := func(providerModelID string, capabilities string, templateID string) ModelImportModelPlan {
		t.Helper()
		for _, plan := range result.Models {
			if plan.ProviderModelID != providerModelID {
				continue
			}
			if got := strings.Join(plan.Capabilities, ","); got != capabilities {
				t.Fatalf("%s capabilities = %q, want %q", providerModelID, got, capabilities)
			}
			if plan.TemplateID != templateID {
				t.Fatalf("%s template_id = %q, want %q", providerModelID, plan.TemplateID, templateID)
			}
			return plan
		}
		t.Fatalf("missing import plan for %s in %#v", providerModelID, result.Models)
		return ModelImportModelPlan{}
	}

	assertImportPlan("gpt-4.1-2025-04-14", "text_generation", "openai:gpt-4.1")
	assertImportPlan("gpt-4o-transcribe", "audio_generation", "openai:gpt-4o-transcribe")
	assertImportPlan("gpt-image-1.5", "image_generation", "")
	assertImportPlan("veo-3.1-fast-generate-preview", "video_generation", "")
	qwenOmni := assertImportPlan("qwen3-omni-flash-2025-09-15", "audio_generation", "dashscope:qwen3-omni-flash-2025-09-15")
	if !qwenOmni.Recommended || qwenOmni.TemplateStatus != "verified" || len(qwenOmni.Diagnostics) != 0 {
		t.Fatalf("qwen omni plan = %+v, want verified recommended without diagnostics", qwenOmni)
	}
	musicgen := assertImportPlan("musicgen", "audio_generation", "open-source-audio:musicgen")
	if musicgen.Recommended || musicgen.TemplateStatus != "verified" || len(musicgen.Diagnostics) == 0 {
		t.Fatalf("musicgen plan = %+v, want verified local-runtime template not recommended for gateway import", musicgen)
	}
	assertImportPlan("deepseek-r1-0528", "text_generation,reasoning", "")
}

func TestApplyModelImportSkipsGatewayRouteForLocalRuntimeTemplate(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	result, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			BaseURLPrefix: "https://api.apiyi.com/v1",
			APIKey:        "sk-import-template-only",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "musicgen",
			PublicModelID:   "musicgen",
			TemplateID:      "open-source-audio:musicgen",
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if result.Summary.CreatedCatalogEntries != 1 || result.Summary.CreatedRouteBindings != 0 || result.Summary.SkippedRouteBindings != 1 {
		t.Fatalf("summary = %+v, want catalog-only import with skipped route", result.Summary)
	}
	if len(result.Items) != 1 || !result.Items[0].SkippedRouteBinding || result.Items[0].RouteBindingID != 0 {
		t.Fatalf("items = %+v, want skipped route without route id", result.Items)
	}
	if result.Items[0].TemplateStatus != "verified" || result.Items[0].Recommended || len(result.Items[0].Diagnostics) == 0 {
		t.Fatalf("item = %+v, want verified local-runtime template skipped for gateway route", result.Items[0])
	}
	var routeCount int64
	if err := service.db.Model(&persistencemodel.AIModelRouteBinding{}).Count(&routeCount).Error; err != nil {
		t.Fatalf("count route bindings: %v", err)
	}
	if routeCount != 0 {
		t.Fatalf("route count = %d, want no route binding for template-only import", routeCount)
	}
}

func TestApplyModelImportCreatesProviderCatalogAndRouteIdempotently(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	first, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			DisplayName:   "Import Gateway",
			BaseURLPrefix: "https://gateway.example.test/v1",
			APIKey:        "sk-import-apply",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "provider-alpha",
			PublicModelID:   "alpha",
			Capabilities:    []string{infraai.CapabilityFamilyTextGeneration},
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if first.Provider.ProviderID == "" || first.Provider.ProviderKind != persistencemodel.AIProviderKindOpenAICompatGateway {
		t.Fatalf("unexpected provider: %+v", first.Provider)
	}
	if first.Summary.CreatedCatalogEntries != 1 || first.Summary.CreatedRouteBindings != 1 || first.Summary.SkippedRouteBindings != 0 {
		t.Fatalf("first summary = %+v, want one catalog and one route", first.Summary)
	}
	if len(first.Items) != 1 || !first.Items[0].CreatedCatalogEntry || !first.Items[0].CreatedRouteBinding {
		t.Fatalf("first items = %+v, want created catalog and route", first.Items)
	}

	var entry persistencemodel.AIModelCatalogEntry
	if err := service.db.Where("public_model_id = ?", "alpha").First(&entry).Error; err != nil {
		t.Fatalf("load catalog entry: %v", err)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("catalog_entry_id = ?", entry.ID).First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.ProviderID != first.Provider.ProviderID || binding.ProviderModelID != "provider-alpha" || binding.RouteGroup != "default" || binding.AdapterType != infraai.AdapterOpenAICompat {
		t.Fatalf("unexpected route binding: %+v", binding)
	}

	second, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderID: first.Provider.ProviderID,
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "provider-alpha",
			PublicModelID:   "alpha",
			Capabilities:    []string{infraai.CapabilityFamilyTextGeneration},
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() second error = %v", err)
	}
	if second.Summary.CreatedCatalogEntries != 0 || second.Summary.CreatedRouteBindings != 0 || second.Summary.SkippedRouteBindings != 1 {
		t.Fatalf("second summary = %+v, want idempotent route skip", second.Summary)
	}
	var routeCount int64
	if err := service.db.Model(&persistencemodel.AIModelRouteBinding{}).Count(&routeCount).Error; err != nil {
		t.Fatalf("count route bindings: %v", err)
	}
	if routeCount != 1 {
		t.Fatalf("route count = %d, want one", routeCount)
	}
}

func TestApplyModelImportInfersAPIyiGatewayProviderFromBaseURL(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	result, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			BaseURLPrefix: "https://api.apiyi.com/v1/",
			APIKey:        "sk-import-apiyi",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "gpt-4o-transcribe",
			PublicModelID:   "gpt-4o-transcribe",
			Capabilities:    []string{"audio_generation"},
			TemplateID:      "openai:gpt-4o-transcribe",
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if result.Provider.ProviderKind != "apiyi_gateway" ||
		result.Provider.ProviderType != "apiyi" ||
		result.Provider.Profile != "gateway" ||
		result.Provider.DisplayName != "APIyi 聚合网关" ||
		result.Provider.BaseURLPrefix != "https://api.apiyi.com/v1" {
		t.Fatalf("unexpected APIyi provider: %+v", result.Provider)
	}
}

func TestNormalizeModelImportProviderInputDefaultsYunwuGatewayBaseURL(t *testing.T) {
	input := normalizeModelImportProviderInput(ModelImportProviderInput{
		ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
		APIKey:       "sk-yunwu",
	})
	if input.BaseURLPrefix != "https://yunwu.ai/v1" {
		t.Fatalf("base_url_prefix = %q, want Yunwu default /v1", input.BaseURLPrefix)
	}
	if input.Credentials["api_key"] != "sk-yunwu" || input.Credentials["base_url"] != "https://yunwu.ai/v1" {
		t.Fatalf("credentials = %#v, want api key and default base url", input.Credentials)
	}

	inferred := normalizeModelImportProviderInput(ModelImportProviderInput{
		BaseURLPrefix: "https://yunwu.ai/v1/",
		APIKey:        "sk-yunwu",
	})
	if inferred.ProviderKind != persistencemodel.AIProviderKindYunwuGateway {
		t.Fatalf("provider_kind = %q, want yunwu_gateway", inferred.ProviderKind)
	}
}

func TestNormalizeModelImportProviderInputDefaultsNewAPIGatewayBaseURL(t *testing.T) {
	input := normalizeModelImportProviderInput(ModelImportProviderInput{
		ProviderKind: persistencemodel.AIProviderKindNewAPIGateway,
		APIKey:       "sk-newapi",
	})
	if input.BaseURLPrefix != "https://api.newapi.pro/v1" {
		t.Fatalf("base_url_prefix = %q, want New API default /v1", input.BaseURLPrefix)
	}
	if input.DisplayName != "New API 中转站" {
		t.Fatalf("display_name = %q, want New API default display name", input.DisplayName)
	}
	if input.Credentials["api_key"] != "sk-newapi" || input.Credentials["base_url"] != "https://api.newapi.pro/v1" {
		t.Fatalf("credentials = %#v, want api key and New API default base url", input.Credentials)
	}
}

func TestNormalizeModelImportProviderInputInfersNewAPIGateway(t *testing.T) {
	input := normalizeModelImportProviderInput(ModelImportProviderInput{
		BaseURLPrefix: "https://api.newapi.pro/v1/",
		APIKey:        "sk-newapi",
	})
	if input.ProviderKind != persistencemodel.AIProviderKindNewAPIGateway {
		t.Fatalf("provider_kind = %q, want new_api_gateway", input.ProviderKind)
	}
	if input.BaseURLPrefix != "https://api.newapi.pro/v1" {
		t.Fatalf("base_url_prefix = %q, want trimmed New API /v1", input.BaseURLPrefix)
	}
	if input.Credentials["api_key"] != "sk-newapi" || input.Credentials["base_url"] != "https://api.newapi.pro/v1" {
		t.Fatalf("credentials = %#v, want api key and New API base url", input.Credentials)
	}
}

func TestPreviewAndApplyModelImportCreatesNewAPIProtocolProfiles(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-newapi-import" {
			t.Fatalf("authorization = %q, want bearer key", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[
			{"id":"claude-3-5-sonnet"},
			{"id":"gemini-2.5-flash"},
			{"id":"gpt-5.2"},
			{"id":"gpt-image-2"},
			{"id":"qwen-image-plus"},
			{"id":"gemini-embedding-001"},
			{"id":"kling-video-test"},
			{"id":"seedance-2.0-pro"},
			{"id":"sora-video-test"}
		]}`))
	}))
	defer upstream.Close()

	preview, err := service.PreviewModelImport(ctx, ModelImportPreviewInput{
		Provider: ModelImportProviderInput{
			ProviderKind:  persistencemodel.AIProviderKindNewAPIGateway,
			DisplayName:   "New API Import",
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-newapi-import",
		},
	})
	if err != nil {
		t.Fatalf("PreviewModelImport() error = %v", err)
	}
	wantProfiles := map[string]string{
		"claude-3-5-sonnet":    infraai.NewAPIProfileClaudeMessages,
		"gemini-2.5-flash":     infraai.NewAPIProfileGeminiGenerateContent,
		"gpt-5.2":              infraai.NewAPIProfileOpenAIChatCompletions,
		"gpt-image-2":          infraai.NewAPIProfileOpenAIImages,
		"qwen-image-plus":      infraai.NewAPIProfileQwenImages,
		"gemini-embedding-001": infraai.NewAPIProfileGeminiEngineEmbeddings,
		"kling-video-test":     infraai.NewAPIProfileKlingVideo,
		"seedance-2.0-pro":     infraai.NewAPIProfileJimengAction,
		"sora-video-test":      infraai.NewAPIProfileSoraVideoMultipart,
	}
	modelInputs := make([]ModelImportModelInput, 0, len(preview.Models)+1)
	for _, plan := range preview.Models {
		if plan.AdapterType != infraai.AdapterNewAPI {
			t.Fatalf("%s adapter_type = %q, want new_api", plan.ProviderModelID, plan.AdapterType)
		}
		if got := plan.ProtocolProfile; got != wantProfiles[plan.ProviderModelID] {
			t.Fatalf("%s protocol_profile = %q, want %q", plan.ProviderModelID, got, wantProfiles[plan.ProviderModelID])
		}
		modelInputs = append(modelInputs, ModelImportModelInput{
			ProviderModelID: plan.ProviderModelID,
			PublicModelID:   plan.PublicModelID,
			DisplayName:     plan.DisplayName,
			Capabilities:    plan.Capabilities,
			TemplateID:      plan.TemplateID,
			ProtocolProfile: plan.ProtocolProfile,
		})
	}
	modelInputs = append(modelInputs, ModelImportModelInput{
		ProviderModelID: "seedance-override",
		PublicModelID:   "seedance-override",
		DisplayName:     "seedance-override",
		Capabilities:    []string{infraai.CapabilityFamilyVideoGeneration},
		ProtocolProfile: infraai.NewAPIProfileVideoGenerations,
	})

	applied, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind:  persistencemodel.AIProviderKindNewAPIGateway,
			DisplayName:   "New API Import",
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-newapi-import",
		},
		Models: modelInputs,
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if applied.Provider.ProviderKind != persistencemodel.AIProviderKindNewAPIGateway || applied.Summary.CreatedRouteBindings != len(modelInputs) {
		t.Fatalf("apply result = %+v, want New API provider and one route per model", applied)
	}
	wantProfiles["seedance-override"] = infraai.NewAPIProfileVideoGenerations
	var bindings []persistencemodel.AIModelRouteBinding
	if err := service.db.Find(&bindings).Error; err != nil {
		t.Fatalf("list route bindings: %v", err)
	}
	if len(bindings) != len(modelInputs) {
		t.Fatalf("route bindings = %d, want %d", len(bindings), len(modelInputs))
	}
	for _, binding := range bindings {
		if binding.AdapterType != infraai.AdapterNewAPI {
			t.Fatalf("%s adapter_type = %q, want new_api", binding.ProviderModelID, binding.AdapterType)
		}
		if got := binding.ProtocolProfile; got != wantProfiles[binding.ProviderModelID] {
			t.Fatalf("%s protocol_profile = %q, want %q", binding.ProviderModelID, got, wantProfiles[binding.ProviderModelID])
		}
	}
}

func TestApplyModelImportCreatesYunwuUnifiedVideoRouteProfile(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	result, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
			APIKey:       "sk-yunwu",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "grok-video-3",
			PublicModelID:   "grok-video-3",
			Capabilities:    []string{infraai.CapabilityFamilyVideoGeneration},
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if result.Provider.ProviderKind != persistencemodel.AIProviderKindYunwuGateway ||
		result.Provider.BaseURLPrefix != "https://yunwu.ai/v1" {
		t.Fatalf("unexpected Yunwu provider: %+v", result.Provider)
	}

	var entry persistencemodel.AIModelCatalogEntry
	if err := service.db.Where("public_model_id = ?", "grok-video-3").First(&entry).Error; err != nil {
		t.Fatalf("load catalog entry: %v", err)
	}
	if entry.Capabilities != infraai.CapabilityFamilyVideoGeneration ||
		!strings.Contains(entry.ModelCapabilitiesJSON, `"image_to_video"`) {
		t.Fatalf("entry capabilities/json = %q / %s, want Yunwu image-to-video contract", entry.Capabilities, entry.ModelCapabilitiesJSON)
	}

	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("catalog_entry_id = ?", entry.ID).First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.AdapterType != infraai.AdapterYunwuUnifiedVideo ||
		binding.EndpointPathPrefix != "/v1" ||
		binding.EndpointMode != "replace_path" ||
		!strings.Contains(entry.ModelCapabilitiesJSON, `"image_to_video"`) {
		t.Fatalf("unexpected Yunwu unified route binding: %+v", binding)
	}
}

func TestApplyModelImportCreatesYunwuAlibailianVideoRouteProfile(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	_, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
			APIKey:       "sk-yunwu",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "wan2.2-i2v",
			PublicModelID:   "wan2.2-i2v",
			Capabilities:    []string{infraai.CapabilityFamilyVideoGeneration},
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}

	var entry persistencemodel.AIModelCatalogEntry
	if err := service.db.Where("public_model_id = ?", "wan2.2-i2v").First(&entry).Error; err != nil {
		t.Fatalf("load catalog entry: %v", err)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("catalog_entry_id = ?", entry.ID).First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.AdapterType != infraai.AdapterDashScope ||
		binding.EndpointPathPrefix != "/alibailian/api/v1" ||
		binding.EndpointMode != "replace_path" ||
		!strings.Contains(entry.ModelCapabilitiesJSON, `"reference_to_video"`) {
		t.Fatalf("unexpected Yunwu AliBailian route binding: %+v", binding)
	}
}

func TestApplyModelImportCreatesYunwuOfficialVideoGenerationsRouteProfile(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	_, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
			APIKey:       "sk-yunwu",
		},
		Models: []ModelImportModelInput{{ProviderModelID: "grok-imagine-video"}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("provider_model_id = ?", "grok-imagine-video").First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.AdapterType != infraai.AdapterOfficialVideoGenerations ||
		binding.EndpointPathPrefix != "/v1" ||
		binding.EndpointMode != "replace_path" {
		t.Fatalf("unexpected Yunwu official video route binding: %+v", binding)
	}
}

func TestApplyModelImportCreatesYunwuOpenAIVideoMultipartRouteProfile(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	_, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
			APIKey:       "sk-yunwu",
		},
		Models: []ModelImportModelInput{{ProviderModelID: "grok-imagine-video-1.5"}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("provider_model_id = ?", "grok-imagine-video-1.5").First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.AdapterType != infraai.AdapterOpenAIVideoMultipart ||
		binding.EndpointPathPrefix != "/v1" ||
		binding.EndpointMode != "replace_path" {
		t.Fatalf("unexpected Yunwu multipart video route binding: %+v", binding)
	}
}

func TestApplyModelImportAutoDiscoversYunwuRoutesAndDisablesMissingMappings(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-yunwu-sync" {
			t.Fatalf("authorization = %q, want bearer key", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[
			{"id":"gpt-4.1"},
			{"id":"grok-video-3"},
			{"id":"grok-imagine-video"},
			{"id":"grok-imagine-video-1.5"},
			{"id":"wan2.1-i2v"},
			{"id":"musicgen"}
		]}`))
	}))
	defer upstream.Close()

	result, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind:  persistencemodel.AIProviderKindYunwuGateway,
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-yunwu-sync",
		},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if result.Provider.ProviderKind != persistencemodel.AIProviderKindYunwuGateway {
		t.Fatalf("provider kind = %q, want Yunwu", result.Provider.ProviderKind)
	}
	if result.Summary.CreatedCatalogEntries != 6 || result.Summary.CreatedRouteBindings != 6 || result.Summary.SkippedRouteBindings != 0 {
		t.Fatalf("summary = %+v, want all discovered models visible as routes", result.Summary)
	}
	if len(result.Items) != 6 {
		t.Fatalf("items = %d, want 6", len(result.Items))
	}

	routes := map[string]persistencemodel.AIModelRouteBinding{}
	var bindings []persistencemodel.AIModelRouteBinding
	if err := service.db.Find(&bindings).Error; err != nil {
		t.Fatalf("list route bindings: %v", err)
	}
	for _, binding := range bindings {
		routes[binding.ProviderModelID] = binding
	}
	if route := routes["grok-video-3"]; route.AdapterType != infraai.AdapterYunwuUnifiedVideo || !route.IsEnabled || route.EndpointPathPrefix != "/v1" {
		t.Fatalf("grok-video-3 route = %+v, want enabled Yunwu unified route", route)
	}
	if route := routes["grok-imagine-video"]; route.AdapterType != infraai.AdapterOfficialVideoGenerations || !route.IsEnabled || route.EndpointPathPrefix != "/v1" {
		t.Fatalf("grok-imagine-video route = %+v, want enabled official video generations route", route)
	}
	if route := routes["grok-imagine-video-1.5"]; route.AdapterType != infraai.AdapterOpenAIVideoMultipart || !route.IsEnabled || route.EndpointPathPrefix != "/v1" {
		t.Fatalf("grok-imagine-video-1.5 route = %+v, want enabled multipart video route", route)
	}
	if route := routes["wan2.1-i2v"]; route.AdapterType != infraai.AdapterDashScope || !route.IsEnabled || route.EndpointPathPrefix != "/alibailian/api/v1" {
		t.Fatalf("wan2.1-i2v route = %+v, want enabled Yunwu AliBailian route", route)
	}
	if route := routes["gpt-4.1"]; route.AdapterType != infraai.AdapterOpenAICompat || !route.IsEnabled {
		t.Fatalf("gpt-4.1 route = %+v, want enabled OpenAI-compatible route", route)
	}
	musicRoute := routes["musicgen"]
	if musicRoute.IsEnabled || musicRoute.AdapterType != infraai.AdapterOpenAICompat {
		t.Fatalf("musicgen route = %+v, want disabled diagnostic route with gateway-safe adapter", musicRoute)
	}
	var musicItem *ModelImportApplyItem
	for i := range result.Items {
		if result.Items[i].ProviderModelID == "musicgen" {
			musicItem = &result.Items[i]
			break
		}
	}
	if musicItem == nil || musicItem.Recommended || len(musicItem.Diagnostics) == 0 || !strings.Contains(strings.Join(musicItem.Diagnostics, " "), "disabled") {
		t.Fatalf("musicgen item = %+v, want disabled diagnostic", musicItem)
	}
}

func TestPreviewModelImportMarksYunwuMissingMappingsAsDisabledDiagnostics(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/models") {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"musicgen"}]}`))
	}))
	defer upstream.Close()

	result, err := service.PreviewModelImport(ctx, ModelImportPreviewInput{
		Provider: ModelImportProviderInput{
			ProviderKind:  persistencemodel.AIProviderKindYunwuGateway,
			BaseURLPrefix: upstream.URL,
			APIKey:        "sk-yunwu-preview",
		},
	})
	if err != nil {
		t.Fatalf("PreviewModelImport() error = %v", err)
	}
	if len(result.Models) != 1 {
		t.Fatalf("models = %d, want 1", len(result.Models))
	}
	model := result.Models[0]
	if model.ProviderModelID != "musicgen" || model.Recommended || model.AdapterType != infraai.AdapterOpenAICompat || model.ModelCapabilitiesJSON == "" {
		t.Fatalf("preview model = %+v, want disabled diagnostic route preview", model)
	}
	if !strings.Contains(strings.Join(model.Diagnostics, " "), "disabled") {
		t.Fatalf("preview diagnostics = %#v, want disabled route explanation", model.Diagnostics)
	}
}

func TestApplyModelImportCreatesYunwuDisabledDiagnosticRouteFromExplicitPreviewSelection(t *testing.T) {
	service := newModelImportTestService(t)
	ctx := context.Background()

	result, err := service.ApplyModelImport(ctx, ModelImportApplyInput{
		Provider: ModelImportProviderInput{
			ProviderKind: persistencemodel.AIProviderKindYunwuGateway,
			APIKey:       "sk-yunwu",
		},
		Models: []ModelImportModelInput{{
			ProviderModelID: "musicgen",
			PublicModelID:   "musicgen",
			DisplayName:     "musicgen",
			Capabilities:    []string{infraai.CapabilityFamilyAudioGeneration},
			TemplateID:      "open-source-audio:musicgen",
		}},
	})
	if err != nil {
		t.Fatalf("ApplyModelImport() error = %v", err)
	}
	if result.Summary.CreatedRouteBindings != 1 || result.Summary.SkippedRouteBindings != 0 {
		t.Fatalf("summary = %+v, want disabled route binding created", result.Summary)
	}
	item := result.Items[0]
	if item.Recommended || len(item.Diagnostics) == 0 || !strings.Contains(strings.Join(item.Diagnostics, " "), "disabled") {
		t.Fatalf("item = %+v, want disabled diagnostic", item)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := service.db.Where("provider_model_id = ?", "musicgen").First(&binding).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if binding.IsEnabled || binding.AdapterType != infraai.AdapterOpenAICompat {
		t.Fatalf("binding = %+v, want disabled OpenAI-compatible diagnostic route", binding)
	}
}

func TestModelCatalogNormalizesCapabilitiesAndRejectsInvalidEntryContracts(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "gpt-5.2",
		Capabilities:    " text_generation,reasoning,text_generation ",
		SupportedParams: `{"version":2,"by_operation":{"chat":{"allow":["temperature"]}}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() valid error = %v", err)
	}
	if entry.Capabilities != "text_generation,reasoning" {
		t.Fatalf("capabilities = %q, want normalized text_generation,reasoning", entry.Capabilities)
	}

	tests := []struct {
		name  string
		input ModelCatalogEntryInput
		want  string
	}{
		{
			name: "unknown capability",
			input: ModelCatalogEntryInput{
				PublicModelID: "bad-cap",
				Capabilities:  "text_generation,unknown",
			},
			want: "capability",
		},
		{
			name: "renderer capability is not a generation model capability",
			input: ModelCatalogEntryInput{
				PublicModelID: "bad-render",
				Capabilities:  "render_video",
			},
			want: "capability",
		},
		{
			name: "invalid supported params json",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-json",
				Capabilities:    "video_generation",
				SupportedParams: `{"allow":`,
			},
			want: "custom_supported_params",
		},
		{
			name: "invalid model capabilities json",
			input: ModelCatalogEntryInput{
				PublicModelID:         "bad-capabilities-json",
				Capabilities:          "video_generation",
				ModelCapabilitiesJSON: `{"video_generation":`,
			},
			want: "model_capabilities_json",
		},
		{
			name: "invalid image input limit",
			input: ModelCatalogEntryInput{
				PublicModelID:  "bad-limit",
				Capabilities:   "image_generation",
				MaxInputImages: -2,
			},
			want: "max_input_images",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.CreateModelCatalogEntry(ctx, tt.input)
			if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("CreateModelCatalogEntry() error = %v, want ErrInvalidModelCatalog containing %q", err, tt.want)
			}
		})
	}
}

func TestModelCatalogEntryParamProfileUsesMatchedTemplateParams(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "seedance-2-0",
		Capabilities:    "video_generation",
		SupportedParams: `{"version":2,"by_operation":{"prompt_to_video":{"allow":["web_search"],"override":{"web_search":{"key":"web_search","label":"Web Search","type":"boolean","default":true}}}}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	var profile infraai.ModelOperationParamProfile
	if err := json.Unmarshal([]byte(entry.SupportedParams), &profile); err != nil {
		t.Fatalf("decode supported params: %v; raw=%s", err, entry.SupportedParams)
	}
	param := profile.ByOperation[infraai.VideoOperationPromptToVideo].Override["web_search"]
	if param.Key != "web_search" || param.Default != true {
		t.Fatalf("supported params = %#v, want operation-scoped web_search override", profile)
	}
}

func TestCreateModelCatalogEntryHydratesSupportedParamsFromMatchedTemplate(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "seedance-2-0",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if entry.ModelTemplateKey != "volcengine:seedance-2-0" ||
		entry.Capabilities != infraai.CapabilityFamilyVideoGeneration ||
		entry.MaxInputImages != 9 ||
		entry.MaxInputVideos != 3 ||
		!strings.Contains(entry.ModelCapabilitiesJSON, infraai.VideoOperationReferenceToVideo) {
		t.Fatalf("entry was not hydrated from template: %#v", entry)
	}
	paramsByOperation, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterVolcen,
		infraai.SplitCapabilities(entry.Capabilities),
		entry.ModelCapabilitiesJSON,
		entry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("supported params should be generated from template, raw=%s", entry.SupportedParams)
	}
	promptParams := paramsByOperation[infraai.VideoOperationPromptToVideo]
	if !adminParamDefsContain(promptParams, "priority") || !adminParamDefsContain(promptParams, "execution_expires_after") {
		t.Fatalf("prompt params = %#v, want template advanced params", promptParams)
	}
	if adminParamDefsContain(promptParams, "seed") || adminParamDefsContain(promptParams, "service_tier") {
		t.Fatalf("prompt params = %#v, should not require manual cleanup", promptParams)
	}
}

func TestCreateModelCatalogEntryHydratesSeedreamImageSupportedParamsFromTemplate(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "seedream-5-0-lite",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if entry.ModelTemplateKey != "volcengine:seedream-5-0-lite" ||
		entry.Capabilities != infraai.CapabilityFamilyImageGeneration ||
		!entry.AcceptsImage ||
		entry.MaxInputImages != 14 {
		t.Fatalf("entry was not hydrated from Seedream image template: %#v", entry)
	}
	paramsByOperation, explicit := infraai.ResolveEffectiveParamsByOperation(
		infraai.AdapterOpenAICompat,
		infraai.SplitCapabilities(entry.Capabilities),
		entry.ModelCapabilitiesJSON,
		entry.SupportedParams,
	)
	if !explicit {
		t.Fatalf("supported params should be generated from image template, raw=%s", entry.SupportedParams)
	}
	imageParams := paramsByOperation[infraai.ImageOperationTextToImage]
	for _, key := range []string{"image_size", "watermark", "sequential_image_generation", "image_count", "optimize_prompt_mode", "output_format", "web_search"} {
		if !adminParamDefsContain(imageParams, key) {
			t.Fatalf("Seedream 5.0 Lite image params missing %s: %#v", key, imageParams)
		}
	}
	for _, key := range []string{"seed", "prompt_strength", "response_format", "stream"} {
		if adminParamDefsContain(imageParams, key) {
			t.Fatalf("Seedream 5.0 Lite image params include unsupported %s: %#v", key, imageParams)
		}
	}
	optimize, ok := adminFindParam(imageParams, "optimize_prompt_mode")
	if !ok || adminParamOptionsContain(optimize, "fast") {
		t.Fatalf("Seedream 5.0 Lite optimize_prompt_mode = %#v, want standard only", optimize)
	}
	outputFormat, ok := adminFindParam(imageParams, "output_format")
	if !ok || !adminParamOptionsContain(outputFormat, "jpeg") || !adminParamOptionsContain(outputFormat, "png") {
		t.Fatalf("Seedream 5.0 Lite output_format = %#v, want jpeg/png", outputFormat)
	}
}

func TestModelCatalogUpdatePreservesCapabilitiesWhenOmitted(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-public",
		Capabilities:  "video_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	updated, err := service.UpdateModelCatalogEntry(ctx, strconvID(entry.ID), ModelCatalogEntryInput{
		DisplayName: "Renamed Video",
	})
	if err != nil {
		t.Fatalf("UpdateModelCatalogEntry() error = %v", err)
	}
	if updated.Capabilities != "video_generation" {
		t.Fatalf("capabilities after partial update = %q, want video_generation", updated.Capabilities)
	}
}

func TestModelCatalogRejectsDuplicateRouteBindingForSameProviderModelAndGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Video Fast",
		Capabilities:  "video_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if supportsRelayGatewayRouteBindings() {
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			AdapterType:     infraai.AdapterOpenAIVideoMultipart,
			ProviderModelID: "provider-video-priority",
			Priority:        1,
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() first error = %v", err)
		}

		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			AdapterType:     infraai.AdapterOpenAIVideoMultipart,
			ProviderModelID: "provider-video-priority-2",
			Priority:        2,
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() same provider different model error = %v", err)
		}

		_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			AdapterType:     infraai.AdapterOpenAIVideoMultipart,
			ProviderModelID: "provider-video-priority",
			Priority:        4,
			CapacityWeight:  1,
		})
		if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
			t.Fatalf("duplicate binding error = %v, want ErrInvalidModelCatalog with already exists", err)
		}

		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "economy",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			AdapterType:     infraai.AdapterOpenAIVideoMultipart,
			ProviderModelID: "provider-video-economy",
			Priority:        3,
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() different group error = %v", err)
		}
	}

	if !supportsLocalProviderRouteBindings() {
		return
	}

	credentialA := uint(101)
	credentialB := uint(102)
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-a",
		ProviderID:      localProviderTestProviderID(credentialA),
		AdapterType:     infraai.AdapterOpenAIVideoMultipart,
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential A error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-b",
		ProviderID:      localProviderTestProviderID(credentialB),
		AdapterType:     infraai.AdapterOpenAIVideoMultipart,
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential B error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-a2",
		ProviderID:      localProviderTestProviderID(credentialA),
		AdapterType:     infraai.AdapterOpenAIVideoMultipart,
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() same provider different model error = %v", err)
	}
	_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-a",
		ProviderID:      localProviderTestProviderID(credentialA),
		AdapterType:     infraai.AdapterOpenAIVideoMultipart,
		CapacityWeight:  1,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("duplicate credential binding error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestModelCatalogNormalizesRouteBindingAPIKinds(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "writer-api-kind",
		DisplayName:   "Writer API Kind",
		Capabilities:  infraai.CapabilityFamilyTextGeneration,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	input := validTestModelRouteBindingInput(151, "api-kind")
	input.APIKinds = " openai_responses,anthropic_messages,openai_responses "
	binding, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), input)
	if err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}
	if binding.APIKinds != "openai_responses,anthropic_messages" {
		t.Fatalf("api kinds = %q, want normalized values", binding.APIKinds)
	}
}

func TestModelCatalogRouteBindingPersistsEndpoint(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "grok-video-public",
		DisplayName:           "Grok Video Public",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video"]}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if entry.ModelCapabilitiesJSON != `{"video_generation":{"operations":["image_to_video"]}}` {
		t.Fatalf("model_capabilities_json = %q", entry.ModelCapabilitiesJSON)
	}

	input := validTestModelRouteBindingInput(151, "yunwu")
	input.AdapterType = infraai.AdapterYunwuUnifiedVideo
	input.EndpointBaseURL = "https://yunwu.ai/"
	input.EndpointPathPrefix = "v1"
	input.EndpointMode = "replace_path"
	binding, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), input)
	if err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}
	if binding.EndpointBaseURL != "https://yunwu.ai" ||
		binding.EndpointPathPrefix != "/v1" ||
		binding.EndpointMode != "replace_path" {
		t.Fatalf("route endpoint fields = %+v", binding)
	}

	listed, err := service.ListModelCatalogEntries(ctx)
	if err != nil {
		t.Fatalf("ListModelCatalogEntries() error = %v", err)
	}
	if len(listed) != 1 || len(listed[0].RouteBindings) != 1 {
		t.Fatalf("listed catalog = %+v", listed)
	}
	listedRoute := listed[0].RouteBindings[0]
	if listed[0].ModelCapabilitiesJSON != entry.ModelCapabilitiesJSON ||
		listedRoute.EndpointPathPrefix != "/v1" {
		t.Fatalf("listed endpoint fields entry=%+v route=%+v", listed[0], listedRoute)
	}
}

func TestModelCatalogRouteBindingAcceptsOperationSlotCapabilities(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	capabilitiesJSON := `{"video_generation":{"operations":[{"id":"first_last_frame_to_video","input_slots":[{"id":"first_frame","required":true,"max":1,"roles":["first_frame"],"modalities":["image"]},{"id":"last_frame","required":true,"max":1,"roles":["last_frame"],"modalities":["image"]}]}],"reference_assets":{"min":2,"max":2,"roles":["first_frame","last_frame"],"modalities":["image"]}}}`

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "slot-video-public",
		DisplayName:           "Slot Video Public",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: capabilitiesJSON,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}

	input := validTestModelRouteBindingInput(152, "slot-route")
	input.AdapterType = infraai.AdapterOpenAIVideoMultipart
	binding, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), input)
	if err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}
	if binding.ID == 0 {
		t.Fatalf("expected persisted route binding, got %+v", binding)
	}

	listed, err := service.ListModelCatalogEntries(ctx)
	if err != nil {
		t.Fatalf("ListModelCatalogEntries() error = %v", err)
	}
	if len(listed) != 1 || listed[0].ModelCapabilitiesJSON != capabilitiesJSON ||
		len(listed[0].RouteBindings) != 1 {
		t.Fatalf("listed catalog with operation slots = %+v", listed)
	}
}

func TestModelCatalogInfersRouteSourceFromProviderID(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "provider-first-video",
		DisplayName:   "Provider First Video",
		Capabilities:  "video_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	binding, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(161),
		AdapterType:     infraai.AdapterOpenAIVideoMultipart,
		ProviderModelID: "provider-video",
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}
	if binding.SourceType != persistencemodel.ModelRouteSourceLocalProvider {
		t.Fatalf("source type = %q, want local_provider", binding.SourceType)
	}
	if binding.CredentialID == nil || *binding.CredentialID != 161 {
		t.Fatalf("credential id = %v, want derived legacy credential 161", binding.CredentialID)
	}
}

func TestModelCatalogRejectsInvalidRouteBindingContracts(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "video-contract",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: routeCapabilityPromptVideoJSON,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}

	negativeCapacityInput := validTestModelRouteBindingInput(1, "invalid-capacity")
	negativeCapacityInput.CapacityWeight = -1
	negativeMaxConcurrencyInput := validTestModelRouteBindingInput(2, "invalid-concurrency")
	negativeMaxConcurrencyInput.MaxConcurrency = -1
	invalidAPIKindInput := validTestModelRouteBindingInput(3, "invalid-api-kind")
	invalidAPIKindInput.APIKinds = "openai_responses,claude-ish"
	invalidEndpointModeInput := validTestModelRouteBindingInput(4, "invalid-endpoint-mode")
	invalidEndpointModeInput.EndpointMode = "guess"
	unsupportedAdapterInput := validTestModelRouteBindingInput(5, "unsupported-adapter")
	unsupportedAdapterInput.AdapterType = infraai.AdapterMiniMax

	tests := []struct {
		name  string
		input ModelRouteBindingInput
		want  string
	}{
		{
			name:  "negative capacity weight",
			input: negativeCapacityInput,
			want:  "capacity_weight",
		},
		{
			name:  "negative max concurrency",
			input: negativeMaxConcurrencyInput,
			want:  "max_concurrency",
		},
		{
			name:  "invalid api kind",
			input: invalidAPIKindInput,
			want:  "api_kind",
		},
		{
			name:  "invalid endpoint mode",
			input: invalidEndpointModeInput,
			want:  "endpoint_mode",
		},
		{
			name:  "adapter must satisfy catalog contract",
			input: unsupportedAdapterInput,
			want:  "does not support",
		},
	}
	if supportsRelayGatewayRouteBindings() {
		tests = append(tests, struct {
			name  string
			input ModelRouteBindingInput
			want  string
		}{
			name: "relay gateway missing route group",
			input: ModelRouteBindingInput{
				ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
				ProviderModelID: "provider-video-contract",
				CapacityWeight:  1,
			},
			want: "route_group",
		})
	} else {
		tests = append(tests, struct {
			name  string
			input ModelRouteBindingInput
			want  string
		}{
			name: "community rejects relay gateway route",
			input: ModelRouteBindingInput{
				RouteGroup:      "priority",
				ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
				ProviderModelID: "provider-video-contract",
				CapacityWeight:  1,
			},
			want: "external relay gateway profile",
		})
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), tt.input)
			if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("CreateModelRouteBinding() error = %v, want ErrInvalidModelCatalog containing %q", err, tt.want)
			}
		})
	}
}

func TestModelCatalogValidatesNewAPIProtocolProfile(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	newAPICred := persistencemodel.AICredential{
		AdapterType: infraai.AdapterNewAPI,
		DisplayName: "New API",
		BaseURL:     "https://newapi.test/v1",
		MaskedKey:   "sk-***",
		IsEnabled:   true,
	}
	if err := service.db.Create(&newAPICred).Error; err != nil {
		t.Fatalf("create New API credential: %v", err)
	}
	openAICred := persistencemodel.AICredential{
		AdapterType: infraai.AdapterOpenAICompat,
		DisplayName: "OpenAI-compatible",
		BaseURL:     "https://gateway.test/v1",
		MaskedKey:   "sk-***",
		IsEnabled:   true,
	}
	if err := service.db.Create(&openAICred).Error; err != nil {
		t.Fatalf("create OpenAI-compatible credential: %v", err)
	}
	videoEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-video-profile",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: routeCapabilityPromptVideoJSON,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(video) error = %v", err)
	}
	nativeParamVideoEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-native-param-video-profile",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video"]}}`,
		SupportedParams:       `{"version":2,"by_operation":{"image_to_video":{"add":[{"key":"aspect_ratio","label":"Ratio","type":"select","options":["16:9"],"default":"16:9"},{"key":"native_only","label":"Native Only","type":"string"}]}}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(native param video) error = %v", err)
	}
	wideVideoEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-wide-video-profile",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["prompt_to_video","first_last_frame_to_video"]}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(wide video) error = %v", err)
	}
	firstLastOnlyEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-jimeng-first-last-profile",
		Capabilities:          "video_generation",
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["first_last_frame_to_video"]}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(first/last video) error = %v", err)
	}
	multiCapabilityEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "newapi-multi-capability-profile",
		Capabilities:  "video_generation,image_generation",
		ModelCapabilitiesJSON: `{
			"video_generation":{"operations":["prompt_to_video","first_last_frame_to_video"]},
			"image_generation":{"operations":["text_to_image"]}
		}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(multi capability) error = %v", err)
	}
	imageEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-image-profile",
		Capabilities:          "image_generation",
		ModelCapabilitiesJSON: routeCapabilityImageJSON,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(image) error = %v", err)
	}
	responsesEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-responses-profile",
		Capabilities:          "text_generation",
		ModelCapabilitiesJSON: `{"text_generation":{"operations":["responses"]}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(responses) error = %v", err)
	}
	embeddingEntry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:         "newapi-embedding-profile",
		Capabilities:          "embedding",
		ModelCapabilitiesJSON: `{"embedding":{"operations":["create_embedding"]}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry(embedding) error = %v", err)
	}

	binding, err := service.CreateModelRouteBinding(ctx, strconvID(videoEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "seedance-2.0-480p",
		ProtocolProfile: infraai.NewAPIProfileVideoGenerations,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(video_generations_json) error = %v", err)
	}
	if binding.ProtocolProfile != infraai.NewAPIProfileVideoGenerations {
		t.Fatalf("protocol_profile = %q, want %q", binding.ProtocolProfile, infraai.NewAPIProfileVideoGenerations)
	}

	nativeParamBinding, err := service.CreateModelRouteBinding(ctx, strconvID(nativeParamVideoEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "seedance-native-param",
		ProtocolProfile: infraai.NewAPIProfileJimengAction,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(native params via New API profile) error = %v", err)
	}
	if nativeParamBinding.ProtocolProfile != infraai.NewAPIProfileJimengAction {
		t.Fatalf("native param protocol_profile = %q, want %q", nativeParamBinding.ProtocolProfile, infraai.NewAPIProfileJimengAction)
	}

	wideBinding, err := service.CreateModelRouteBinding(ctx, strconvID(wideVideoEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "wide-seedance-2.0",
		ProtocolProfile: infraai.NewAPIProfileVideoGenerations,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(wide video with narrow profile) error = %v", err)
	}
	if wideBinding.ProtocolProfile != infraai.NewAPIProfileVideoGenerations {
		t.Fatalf("wide protocol_profile = %q, want %q", wideBinding.ProtocolProfile, infraai.NewAPIProfileVideoGenerations)
	}

	_, err = service.CreateModelRouteBinding(ctx, strconvID(firstLastOnlyEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "jimeng-first-last",
		ProtocolProfile: infraai.NewAPIProfileVideoGenerations,
		CapacityWeight:  1,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "does not support any declared operation") {
		t.Fatalf("CreateModelRouteBinding(first/last with generic profile) error = %v, want operation mismatch", err)
	}

	firstLastBinding, err := service.CreateModelRouteBinding(ctx, strconvID(firstLastOnlyEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "jimeng-first-last",
		ProtocolProfile: infraai.NewAPIProfileJimengAction,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(first/last with Jimeng profile) error = %v", err)
	}
	if firstLastBinding.ProtocolProfile != infraai.NewAPIProfileJimengAction {
		t.Fatalf("first/last protocol_profile = %q, want %q", firstLastBinding.ProtocolProfile, infraai.NewAPIProfileJimengAction)
	}

	multiBinding, err := service.CreateModelRouteBinding(ctx, strconvID(multiCapabilityEntry.ID), ModelRouteBindingInput{
		RouteGroup:      "multi-video",
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "seedance-multi",
		ProtocolProfile: infraai.NewAPIProfileJimengAction,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(multi capability with video profile) error = %v", err)
	}
	if multiBinding.ProtocolProfile != infraai.NewAPIProfileJimengAction {
		t.Fatalf("multi capability protocol_profile = %q, want %q", multiBinding.ProtocolProfile, infraai.NewAPIProfileJimengAction)
	}

	klingBinding, err := service.CreateModelRouteBinding(ctx, strconvID(videoEntry.ID), ModelRouteBindingInput{
		RouteGroup:      "kling",
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "kling-test",
		ProtocolProfile: infraai.NewAPIProfileKlingVideo,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(kling_video_json) error = %v", err)
	}
	if klingBinding.ProtocolProfile != infraai.NewAPIProfileKlingVideo {
		t.Fatalf("kling protocol_profile = %q, want %q", klingBinding.ProtocolProfile, infraai.NewAPIProfileKlingVideo)
	}

	_, err = service.CreateModelRouteBinding(ctx, strconvID(imageEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "gpt-image-2",
		ProtocolProfile: infraai.NewAPIProfileVideoGenerations,
		CapacityWeight:  1,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "requires capability") {
		t.Fatalf("CreateModelRouteBinding(image with video profile) error = %v, want capability mismatch", err)
	}

	_, err = service.CreateModelRouteBinding(ctx, strconvID(responsesEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "gpt-5.2",
		ProtocolProfile: infraai.NewAPIProfileOpenAIChatCompletions,
		CapacityWeight:  1,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "does not support any declared operation") {
		t.Fatalf("CreateModelRouteBinding(responses with chat profile) error = %v, want operation mismatch", err)
	}

	responsesBinding, err := service.CreateModelRouteBinding(ctx, strconvID(responsesEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "gpt-5.2",
		ProtocolProfile: infraai.NewAPIProfileOpenAIResponses,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(openai_responses_json) error = %v", err)
	}
	if responsesBinding.ProtocolProfile != infraai.NewAPIProfileOpenAIResponses {
		t.Fatalf("responses protocol_profile = %q, want %q", responsesBinding.ProtocolProfile, infraai.NewAPIProfileOpenAIResponses)
	}

	embeddingBinding, err := service.CreateModelRouteBinding(ctx, strconvID(embeddingEntry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "embed-test",
		ProtocolProfile: infraai.NewAPIProfileOpenAIEmbeddings,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(openai_embeddings_json) error = %v", err)
	}
	if embeddingBinding.ProtocolProfile != infraai.NewAPIProfileOpenAIEmbeddings {
		t.Fatalf("embedding protocol_profile = %q, want %q", embeddingBinding.ProtocolProfile, infraai.NewAPIProfileOpenAIEmbeddings)
	}

	geminiEmbeddingBinding, err := service.CreateModelRouteBinding(ctx, strconvID(embeddingEntry.ID), ModelRouteBindingInput{
		RouteGroup:      "gemini",
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "gemini-embedding-001",
		ProtocolProfile: infraai.NewAPIProfileGeminiEngineEmbeddings,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(gemini_engine_embeddings_json) error = %v", err)
	}
	if geminiEmbeddingBinding.ProtocolProfile != infraai.NewAPIProfileGeminiEngineEmbeddings {
		t.Fatalf("gemini embedding protocol_profile = %q, want %q", geminiEmbeddingBinding.ProtocolProfile, infraai.NewAPIProfileGeminiEngineEmbeddings)
	}

	jimengBinding, err := service.CreateModelRouteBinding(ctx, strconvID(videoEntry.ID), ModelRouteBindingInput{
		RouteGroup:      "jimeng",
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "jimeng-test",
		ProtocolProfile: infraai.NewAPIProfileJimengAction,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(jimeng_action_json) error = %v", err)
	}
	if jimengBinding.ProtocolProfile != infraai.NewAPIProfileJimengAction {
		t.Fatalf("jimeng protocol_profile = %q, want %q", jimengBinding.ProtocolProfile, infraai.NewAPIProfileJimengAction)
	}

	imageBinding, err := service.CreateModelRouteBinding(ctx, strconvID(imageEntry.ID), ModelRouteBindingInput{
		RouteGroup:      "clear-profile",
		ProviderID:      localProviderTestProviderID(newAPICred.ID),
		AdapterType:     infraai.AdapterNewAPI,
		ProviderModelID: "gpt-image-2",
		ProtocolProfile: infraai.NewAPIProfileOpenAIImages,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("CreateModelRouteBinding(openai_images_json_multipart) error = %v", err)
	}
	updated, err := service.UpdateModelRouteBinding(ctx, strconvID(imageBinding.ID), ModelRouteBindingInput{
		RouteGroup:      "clear-profile",
		ProviderID:      localProviderTestProviderID(openAICred.ID),
		AdapterType:     infraai.AdapterOpenAICompat,
		ProviderModelID: "gpt-image-compatible",
		ProtocolProfile: infraai.NewAPIProfileOpenAIImages,
		CapacityWeight:  1,
	})
	if err != nil {
		t.Fatalf("UpdateModelRouteBinding(non-NewAPI) error = %v", err)
	}
	if updated.ProtocolProfile != "" {
		t.Fatalf("protocol_profile after non-NewAPI update = %q, want empty", updated.ProtocolProfile)
	}
}

func TestModelCatalogRejectsUpdatingRouteBindingIntoDuplicateGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	var duplicateTarget ModelRouteBinding
	if supportsRelayGatewayRouteBindings() {
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-image-priority",
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() priority error = %v", err)
		}
		duplicateTarget, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "economy",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-image-economy",
			CapacityWeight:  1,
		})
		if err != nil {
			t.Fatalf("CreateModelRouteBinding() economy error = %v", err)
		}
		_, err = service.UpdateModelRouteBinding(ctx, strconvID(duplicateTarget.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-image-priority",
			CapacityWeight:  1,
		})
	} else {
		credentialA := uint(201)
		credentialB := uint(202)
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			ProviderModelID: "provider-image-a",
			ProviderID:      localProviderTestProviderID(credentialA),
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() credential A error = %v", err)
		}
		duplicateTarget, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			ProviderModelID: "provider-image-b",
			ProviderID:      localProviderTestProviderID(credentialB),
			CapacityWeight:  1,
		})
		if err != nil {
			t.Fatalf("CreateModelRouteBinding() credential B error = %v", err)
		}
		_, err = service.UpdateModelRouteBinding(ctx, strconvID(duplicateTarget.ID), ModelRouteBindingInput{
			ProviderModelID: "provider-image-a",
			ProviderID:      localProviderTestProviderID(credentialA),
			CapacityWeight:  1,
		})
	}
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("duplicate update error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestModelCatalogRejectsBindingForMissingCatalogEntry(t *testing.T) {
	service := newTestService(t)

	_, err := service.CreateModelRouteBinding(context.Background(), "9999", ModelRouteBindingInput{
		ProviderID:     localProviderTestProviderID(999),
		CapacityWeight: 1,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("CreateModelRouteBinding() error = %v, want ErrNotFound", err)
	}
}

func TestModelCatalogDeleteRemovesRouteBindings(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "audio-fast",
		DisplayName:   "Audio Fast",
		Capabilities:  "audio_generation",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	input := validTestModelRouteBindingInput(301, "delete-route")
	input.AdapterType = infraai.AdapterOpenAICompat
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), input); err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}

	if err := service.DeleteModelCatalogEntry(ctx, strconvID(entry.ID)); err != nil {
		t.Fatalf("DeleteModelCatalogEntry() error = %v", err)
	}
	var bindingCount int64
	if err := service.db.Model(&persistencemodel.AIModelRouteBinding{}).Where("catalog_entry_id = ?", entry.ID).Count(&bindingCount).Error; err != nil {
		t.Fatalf("count route bindings: %v", err)
	}
	if bindingCount != 0 {
		t.Fatalf("active route binding count after catalog delete = %d, want 0", bindingCount)
	}
	if err := service.DeleteModelCatalogEntry(ctx, strconvID(entry.ID)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteModelCatalogEntry() missing error = %v, want ErrNotFound", err)
	}
}

func validTestModelRouteBindingInput(credentialID uint, routeGroup string) ModelRouteBindingInput {
	if supportsRelayGatewayRouteBindings() {
		return ModelRouteBindingInput{
			RouteGroup:      routeGroup,
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-" + routeGroup,
			CapacityWeight:  1,
		}
	}
	return ModelRouteBindingInput{
		ProviderModelID: "provider-" + routeGroup,
		ProviderID:      localProviderTestProviderID(credentialID),
		CapacityWeight:  1,
	}
}

const (
	routeCapabilityTextJSON                  = `{"text_generation":{"operations":["chat"]}}`
	routeCapabilityImageJSON                 = `{"image_generation":{"operations":["text_to_image"]}}`
	routeCapabilityPromptVideoJSON           = `{"video_generation":{"operations":["prompt_to_video"]}}`
	routeCapabilityFamilyAudioGenerationJSON = `{"audio_generation":{"operations":["text_to_speech"]}}`
)

func localProviderTestProviderID(credentialID uint) string {
	return persistencemodel.ModelRouteSourceLocalProvider + ":" + strconvID(credentialID)
}

func newModelImportTestService(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenSQLite(t, "admin-ai-model-import.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	db = db.Session(&gorm.Session{SkipHooks: true})
	key := []byte("test-encryption-key-32-bytes----")
	return NewService(db, key, infraai.NewRegistry(db, key))
}
