package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCredentialAdminWritesAuditAndDeleteNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"openai_compat",
		"display_name":"OpenAI",
		"credentials":{"api_key":"sk-test","base_url":"https://api.example.com/v1?token=base-query-secret"},
		"files_api_enabled":true,
		"files_api_key":"files-secret"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected credential to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "sk-test")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "files-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "base-query-secret")

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/credentials/1", strings.NewReader(`{
		"display_name":"OpenAI Updated",
		"is_enabled":false
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()

	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected credential to be updated, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_updated") != 1 {
		t.Fatalf("expected update audit log")
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1", nil)
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected credential to be deleted, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1", nil)
	missingRes := httptest.NewRecorder()

	router.ServeHTTP(missingRes, missingReq)

	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing credential delete, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func TestCredentialExternalAdminActionsWriteAuditWithoutSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"anthropic",
		"display_name":"Anthropic",
		"credentials":{"api_key":"sk-remote-secret"}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected credential to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	remoteReq := httptest.NewRequest(http.MethodGet, "/admin/credentials/1/remote-models", nil)
	remoteRes := httptest.NewRecorder()

	router.ServeHTTP(remoteRes, remoteReq)

	if remoteRes.Code != http.StatusBadRequest {
		t.Fatalf("expected unsupported remote models response, got %d: %s", remoteRes.Code, remoteRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.remote_models.admin_listed") != 1 {
		t.Fatalf("expected remote models audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.remote_models.admin_listed", "sk-remote-secret")

	broken := persistencemodel.AICredential{
		AdapterType:  "openai_compat",
		DisplayName:  "Broken",
		BaseURL:      "https://api.example.com/v1",
		EncryptedKey: "not-cipher",
		MaskedKey:    "***",
		IsEnabled:    true,
	}
	if err := db.Create(&broken).Error; err != nil {
		t.Fatalf("create broken credential: %v", err)
	}

	testReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/2/test", nil)
	testRes := httptest.NewRecorder()

	router.ServeHTTP(testRes, testReq)

	if testRes.Code != http.StatusOK {
		t.Fatalf("expected credential test response, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_tested") != 1 {
		t.Fatalf("expected credential test audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_tested", "not-cipher")
}

func newTestAICredentialRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-ai-credentials.db", &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}, &persistencemodel.AuditLog{})
	db = db.Session(&gorm.Session{SkipHooks: true})
	registry := ai.NewRegistry(db, nil)
	h := NewAIHandler(db, "746573742d656e6372797074696f6e2d6b65792d33322d62797465732d2d2d2d2d", registry)

	router := gin.New()
	router.POST("/admin/credentials", h.CreateCredential)
	router.PUT("/admin/credentials/:id", h.UpdateCredential)
	router.DELETE("/admin/credentials/:id", h.DeleteCredential)
	router.GET("/admin/credentials/:id/remote-models", h.ListRemoteModels)
	router.POST("/admin/credentials/:id/test", h.TestCredential)
	return router, db
}

func countAuditAction(t *testing.T, db *gorm.DB, action string) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&persistencemodel.AuditLog{}).Where("action = ?", action).Count(&count).Error; err != nil {
		t.Fatalf("count audit logs for %s: %v", action, err)
	}
	return count
}
