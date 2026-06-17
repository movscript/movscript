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
