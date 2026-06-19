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
		DefaultPublicModelID string `json:"default_public_model_id"`
		ModelID              string `json:"model_id"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("expected templates")
	}
	for _, template := range body {
		if template.DefaultPublicModelID == "" {
			t.Fatalf("template %s has empty default public id", template.ID)
		}
		if strings.Contains(template.DefaultPublicModelID, ":") {
			t.Fatalf("template %s exposes provider namespace in default public id %q", template.ID, template.DefaultPublicModelID)
		}
		if template.ModelID == "" {
			t.Fatalf("template %s has empty model_id", template.ID)
		}
	}
}
