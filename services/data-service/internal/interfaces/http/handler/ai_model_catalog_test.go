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
	entry := persistencemodel.AIModelCatalogEntry{PublicModelID: "video-fast", DisplayName: "Video Fast", Capabilities: "video", IsEnabled: true}
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

func TestRouteBindingRejectsLegacySourceAndCredentialInputs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-ai-model-route-input.db", &persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{})
	entry := persistencemodel.AIModelCatalogEntry{PublicModelID: "video-fast", DisplayName: "Video Fast", Capabilities: "video", IsEnabled: true}
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
