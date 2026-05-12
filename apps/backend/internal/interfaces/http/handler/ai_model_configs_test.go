package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreateModelConfigReturnsBadRequestForInvalidParamContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	req := httptest.NewRequest(http.MethodPost, "/admin/ai/credentials/1/models", strings.NewReader(`{
		"model_def_id":"bad-video",
		"custom_capabilities":"video",
		"custom_supported_params":"[{\"key\":\"duration\",\"type\":\"select\"}]"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid model param contract, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "invalid ai model config") {
		t.Fatalf("expected invalid model config error body, got %s", res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "INVALID_MODEL_CONFIG" {
		t.Fatalf("expected stable INVALID_MODEL_CONFIG code, got %#v", body)
	}
	if body["message"] == "" || body["error"] == "" {
		t.Fatalf("expected message and legacy error fields, got %#v", body)
	}
}

func TestCreateModelConfigReturnsNotFoundForMissingCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, false)

	req := httptest.NewRequest(http.MethodPost, "/admin/ai/credentials/999/models", strings.NewReader(`{
		"model_def_id":"video-model",
		"custom_capabilities":"video",
		"custom_supported_params":""
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing credential, got %d: %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "NOT_FOUND" {
		t.Fatalf("expected stable NOT_FOUND code, got %#v", body)
	}
	if !strings.Contains(body["message"].(string), "credential not found") {
		t.Fatalf("expected credential detail in message, got %#v", body)
	}
}

func newTestAIModelConfigRouter(t *testing.T, seedCredential bool) *gin.Engine {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "handler-aiadmin.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	if seedCredential {
		if err := db.Create(&persistencemodel.AICredential{
			AdapterType: "volcen",
			DisplayName: "Volcen",
			IsEnabled:   true,
		}).Error; err != nil {
			t.Fatalf("seed credential: %v", err)
		}
	}
	h := NewAIHandler(db.Session(&gorm.Session{SkipHooks: true}), "746573742d656e6372797074696f6e2d6b65792d33322d62797465732d2d2d2d2d", nil)
	router := gin.New()
	router.POST("/admin/ai/credentials/:id/models", h.CreateModelConfig)
	return router
}
