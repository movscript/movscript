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
		Capabilities:  "video",
	}); err != nil {
		t.Fatalf("CreateModelCatalogEntry() first error = %v", err)
	}
	_, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Duplicate",
		Capabilities:  "video",
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "catalog entry already exists") {
		t.Fatalf("duplicate catalog entry error = %v, want ErrInvalidModelCatalog with already exists", err)
	}

	other, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() other error = %v", err)
	}
	_, err = service.UpdateModelCatalogEntry(ctx, strconvID(other.ID), ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image",
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
	if result.Models[0].Status != "new" || !result.Models[0].Recommended || strings.Join(result.Models[0].Capabilities, ",") != "text" {
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

	assertImportPlan("gpt-4.1-2025-04-14", "text", "openai:gpt-4.1")
	assertImportPlan("gpt-4o-transcribe", "audio_transcribe", "openai:gpt-4o-transcribe")
	assertImportPlan("gpt-image-1.5", "image,image_edit", "")
	assertImportPlan("veo-3.1-fast-generate-preview", "video", "")
	qwenOmni := assertImportPlan("qwen3-omni-flash-2025-09-15", "audio_chat", "dashscope:qwen3-omni-flash-2025-09-15")
	if !qwenOmni.Recommended || qwenOmni.TemplateStatus != "verified" || len(qwenOmni.Diagnostics) != 0 {
		t.Fatalf("qwen omni plan = %+v, want verified recommended without diagnostics", qwenOmni)
	}
	musicgen := assertImportPlan("musicgen", "audio_music", "open-source-audio:musicgen")
	if musicgen.Recommended || musicgen.TemplateStatus != "verified" || len(musicgen.Diagnostics) == 0 {
		t.Fatalf("musicgen plan = %+v, want verified local-runtime template not recommended for gateway import", musicgen)
	}
	assertImportPlan("deepseek-r1-0528", "text,reasoning", "")
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
			Capabilities:    []string{"text"},
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
			Capabilities:    []string{"text"},
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
			Capabilities:    []string{"audio_transcribe"},
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

func TestModelCatalogNormalizesCapabilitiesAndRejectsInvalidEntryContracts(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "gpt-5.2",
		Capabilities:    " text,reasoning,text ",
		SupportedParams: `{"allow":["temperature"]}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() valid error = %v", err)
	}
	if entry.Capabilities != "text,reasoning" {
		t.Fatalf("capabilities = %q, want normalized text,reasoning", entry.Capabilities)
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
				Capabilities:  "text,unknown",
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
				Capabilities:    "video",
				SupportedParams: `{"allow":`,
			},
			want: "custom_supported_params",
		},
		{
			name: "invalid image input limit",
			input: ModelCatalogEntryInput{
				PublicModelID:  "bad-limit",
				Capabilities:   "image_edit",
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
		Capabilities:    "video,video_i2v,video_v2v",
		SupportedParams: `{"allow":["web_search"],"override":{"web_search":{"default":true}}}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	var params []infraai.ParamDef
	if err := json.Unmarshal([]byte(entry.SupportedParams), &params); err != nil {
		t.Fatalf("decode supported params: %v; raw=%s", err, entry.SupportedParams)
	}
	if len(params) != 1 || params[0].Key != "web_search" || params[0].Default != true {
		t.Fatalf("supported params = %#v, want materialized Seedance template web_search param", params)
	}
}

func TestModelCatalogUpdatePreservesCapabilitiesWhenOmitted(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-public",
		Capabilities:  "video,video_i2v",
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
	if updated.Capabilities != "video,video_i2v" {
		t.Fatalf("capabilities after partial update = %q, want video,video_i2v", updated.Capabilities)
	}
}

func TestModelCatalogRejectsDuplicateRouteBindingForSameProviderModelAndGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "video-fast",
		DisplayName:   "Video Fast",
		Capabilities:  "video",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if supportsRelayGatewayRouteBindings() {
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-video-priority",
			Priority:        1,
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() first error = %v", err)
		}

		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
			ProviderModelID: "provider-video-priority-2",
			Priority:        2,
			CapacityWeight:  1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() same provider different model error = %v", err)
		}

		_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			RouteGroup:      "priority",
			ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
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
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential A error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-b",
		ProviderID:      localProviderTestProviderID(credentialB),
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential B error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-a2",
		ProviderID:      localProviderTestProviderID(credentialA),
		CapacityWeight:  1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() same provider different model error = %v", err)
	}
	_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderModelID: "provider-video-a",
		ProviderID:      localProviderTestProviderID(credentialA),
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
		Capabilities:  "text",
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

func TestModelCatalogInfersRouteSourceFromProviderID(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "provider-first-video",
		DisplayName:   "Provider First Video",
		Capabilities:  "video",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	binding, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		ProviderID:      localProviderTestProviderID(161),
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
		PublicModelID: "video-contract",
		Capabilities:  "video",
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
			want: "commercial edition",
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

func TestModelCatalogRejectsUpdatingRouteBindingIntoDuplicateGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		Capabilities:  "image",
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
		Capabilities:  "audio_tts",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), validTestModelRouteBindingInput(301, "delete-route")); err != nil {
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
