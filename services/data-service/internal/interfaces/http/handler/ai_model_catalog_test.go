package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestCreateModelCatalogEntryReturnsCatalogErrorCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-catalog.db", &persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{})
	h := NewAIHandler(db, testHandlerEncryptionKeyHex, ai.NewRegistry(db, nil))
	router := gin.New()
	router.POST("/admin/model-catalog", h.CreateModelCatalogEntry)

	req := httptest.NewRequest(http.MethodPost, "/admin/model-catalog", strings.NewReader(`{"public_model_id":"","provider_model_id":""}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusBadRequest, res.Body.String())
	}
	var body struct {
		Code  string `json:"code"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Code != "INVALID_MODEL_CATALOG" {
		t.Fatalf("code = %q, want INVALID_MODEL_CATALOG; body=%s", body.Code, res.Body.String())
	}
	if !strings.Contains(body.Error, "invalid ai model catalog") {
		t.Fatalf("error = %q, want invalid catalog detail", body.Error)
	}
}

func TestListModelCatalogTemplatesReturnsDefaultPublicModelID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-catalog-templates.db", &persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{})
	h := NewAIHandler(db, testHandlerEncryptionKeyHex, ai.NewRegistry(db, nil))
	router := gin.New()
	router.GET("/admin/model-catalog/templates", h.ListModelCatalogTemplates)

	req := httptest.NewRequest(http.MethodGet, "/admin/model-catalog/templates", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusOK, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "adapter_type") || strings.Contains(res.Body.String(), "route_adapter_hint") {
		t.Fatalf("catalog template response must not expose adapter fields: %s", res.Body.String())
	}
	var body []struct {
		ID                   string `json:"id"`
		Lab                  string `json:"lab"`
		DefaultPublicModelID string `json:"default_public_model_id"`
		ModelID              string `json:"model_id"`
		SourceStatus         string `json:"source_status"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("expected templates")
	}
	for _, template := range body {
		if template.Lab == "" {
			t.Fatalf("template %s has empty lab", template.ID)
		}
		if template.DefaultPublicModelID == "" {
			t.Fatalf("template %s has empty default public id", template.ID)
		}
		if strings.Contains(template.DefaultPublicModelID, ":") {
			t.Fatalf("template %s exposes provider namespace in default public id %q", template.ID, template.DefaultPublicModelID)
		}
		if template.ModelID == "" {
			t.Fatalf("template %s has empty model_id", template.ID)
		}
		if template.SourceStatus == "" {
			t.Fatalf("template %s has empty source_status", template.ID)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/admin/model-catalog/templates?lab=seed", nil)
	res = httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("filtered status = %d, want %d: %s", res.Code, http.StatusOK, res.Body.String())
	}
	body = nil
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode filtered response: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("expected filtered seed templates")
	}
	for _, template := range body {
		if template.Lab != "seed" {
			t.Fatalf("seed filter returned template %s with lab %q", template.ID, template.Lab)
		}
	}
}

func TestListModelCatalogEntriesReturnsProviderFirstRouteBindings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-catalog-provider-first-routes.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
	)
	entry := persistencemodel.AIModelCatalogEntry{PublicModelID: "video-fast", DisplayName: "Video Fast", Capabilities: "video_generation", IsEnabled: true}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	credentialID := uint(77)
	providerID := "openai_compat_gateway:77"
	if err := db.Create(&persistencemodel.AIProvider{
		ProviderID:       providerID,
		ProviderKind:     persistencemodel.AIProviderKindOpenAICompatGateway,
		ProviderCategory: persistencemodel.AIProviderCategoryAggregatorGateway,
		AdapterKey:       ai.AdapterOpenAICompat,
		DisplayName:      "Gateway",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if err := db.Create(&persistencemodel.AIProviderCredential{
		ProviderID:      providerID,
		CredentialKey:   "primary",
		CredentialKind:  "api_key",
		PlainConfigJSON: `{"legacy_credential_id":77}`,
		Status:          persistencemodel.AIProviderCredentialStatusActive,
		IsPrimary:       true,
	}).Error; err != nil {
		t.Fatalf("create provider credential: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:    &credentialID,
		ProviderModelID: "provider-video",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	h := NewAIHandler(db, testHandlerEncryptionKeyHex, ai.NewRegistry(db, nil))
	router := gin.New()
	router.GET("/admin/model-catalog", h.ListModelCatalogEntries)

	req := httptest.NewRequest(http.MethodGet, "/admin/model-catalog", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusOK, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "credential_id") {
		t.Fatalf("body = %s, want no credential_id", res.Body.String())
	}
	var body []struct {
		RouteBindings []struct {
			ProviderID string `json:"provider_id"`
		} `json:"route_bindings"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body) != 1 || len(body[0].RouteBindings) != 1 {
		t.Fatalf("body = %#v, want one route binding", body)
	}
	if body[0].RouteBindings[0].ProviderID != providerID {
		t.Fatalf("provider_id = %q, want stable provider id mapped from credential", body[0].RouteBindings[0].ProviderID)
	}
}

func TestDiagnoseModelRouteExplainsStructuredRouteSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-route-diagnose.db",
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
	imageOnlyRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
		ProviderID:      persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:     ai.AdapterVolcen,
		ProviderModelID: "provider-image-video",
		IsEnabled:       false,
		Priority:        20,
		CapacityWeight:  1,
	}
	firstLastRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:     entry.ID,
		SourceType:         persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:         "default",
		ProviderID:         persistencemodel.ModelRouteSourceRelayGateway,
		AdapterType:        ai.AdapterVolcen,
		ProviderModelID:    "provider-first-last-video",
		IsEnabled:          true,
		Priority:           10,
		CapacityWeight:     1,
		EndpointPathPrefix: "/v1/video/create",
		EndpointMode:       ai.RouteEndpointModeReplacePath,
	}
	if err := db.Create(&imageOnlyRoute).Error; err != nil {
		t.Fatalf("create image-only route: %v", err)
	}
	if err := db.Model(&imageOnlyRoute).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable image-only route: %v", err)
	}
	if err := db.Create(&firstLastRoute).Error; err != nil {
		t.Fatalf("create first-last route: %v", err)
	}
	h := NewAIHandler(db, testHandlerEncryptionKeyHex, ai.NewRegistry(db, nil))
	router := gin.New()
	router.POST("/admin/model-routes/diagnose", h.DiagnoseModelRoute)

	body := `{
		"public_model_id": "story-video",
		"route_group": "default",
		"capability": "video_generation",
		"intent": {
			"operation": "first_last_frame_to_video",
			"reference_assets": [
				{"role":"first_frame","media_type":"image"},
				{"role":"last_frame","media_type":"image"}
			]
		}
	}`
	req := httptest.NewRequest(http.MethodPost, "/admin/model-routes/diagnose", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusOK, res.Body.String())
	}
	var out struct {
		SelectedRouteID uint `json:"selected_route_id"`
		Candidates      []struct {
			RouteBindingID    uint     `json:"route_binding_id"`
			Status            string   `json:"status"`
			Reasons           []string `json:"reasons"`
			EffectiveEndpoint *struct {
				PathPrefix string `json:"path_prefix"`
				Mode       string `json:"mode"`
			} `json:"effective_endpoint"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.SelectedRouteID != firstLastRoute.ID {
		t.Fatalf("selected route id = %d, want %d; body=%s", out.SelectedRouteID, firstLastRoute.ID, res.Body.String())
	}
	var sawSelectedEndpoint bool
	for _, candidate := range out.Candidates {
		if candidate.RouteBindingID == firstLastRoute.ID && candidate.Status == ai.ModelRouteDiagnosticStatusSelected && candidate.EffectiveEndpoint != nil {
			sawSelectedEndpoint = candidate.EffectiveEndpoint.PathPrefix == "/v1/video/create" && candidate.EffectiveEndpoint.Mode == ai.RouteEndpointModeReplacePath
		}
	}
	if !sawSelectedEndpoint {
		t.Fatalf("body=%s, want selected endpoint diagnostics", res.Body.String())
	}
}

func TestRouteBindingRejectsLegacySourceAndCredentialInputs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-route-input.db", &persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{})
	entry := persistencemodel.AIModelCatalogEntry{PublicModelID: "video-fast", DisplayName: "Video Fast", Capabilities: "video_generation", IsEnabled: true}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	h := NewAIHandler(db, testHandlerEncryptionKeyHex, ai.NewRegistry(db, nil))
	router := gin.New()
	router.POST("/admin/model-catalog/:id/route-bindings", h.CreateModelRouteBinding)

	tests := []struct {
		name string
		body string
		want string
	}{
		{
			name: "source type",
			body: `{"source_type":"local_provider","provider_id":"local_provider:1","provider_model_id":"provider-video"}`,
			want: "source_type",
		},
		{
			name: "credential id",
			body: `{"credential_id":1,"provider_id":"local_provider:1","provider_model_id":"provider-video"}`,
			want: "credential_id",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/admin/model-catalog/1/route-bindings", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()

			router.ServeHTTP(res, req)

			if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), tt.want) {
				t.Fatalf("status/body = %d %s, want 400 containing %q", res.Code, res.Body.String(), tt.want)
			}
		})
	}
}
