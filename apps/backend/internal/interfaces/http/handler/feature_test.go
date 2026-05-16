package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestFeatureAdminUpdatesWriteAuditLogs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestFeatureRouter(t)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/features/image-generation", strings.NewReader(`{
		"is_enabled":false,
		"allowed_model_ids":[1],
		"default_model_id":1,
		"allowed_roles":["director","generator"]
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()

	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected feature update to succeed, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "feature.admin_updated") != 1 {
		t.Fatalf("expected feature update audit log")
	}

	promptReq := httptest.NewRequest(http.MethodPut, "/admin/features/image-generation/prompt", strings.NewReader(`{
		"system_prompt_override":"Use a consistent visual style.",
		"max_tokens_override":2048
	}`))
	promptReq.Header.Set("Content-Type", "application/json")
	promptRes := httptest.NewRecorder()

	router.ServeHTTP(promptRes, promptReq)

	if promptRes.Code != http.StatusOK {
		t.Fatalf("expected feature prompt update to succeed, got %d: %s", promptRes.Code, promptRes.Body.String())
	}
	if countAuditAction(t, db, "feature.prompt.admin_updated") != 1 {
		t.Fatalf("expected feature prompt update audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "feature.prompt.admin_updated", "Use a consistent visual style.")
	var promptResp struct {
		MaxTokensOverride int `json:"max_tokens_override"`
	}
	if err := json.Unmarshal(promptRes.Body.Bytes(), &promptResp); err != nil {
		t.Fatalf("decode prompt response: %v", err)
	}
	if promptResp.MaxTokensOverride != 2048 {
		t.Fatalf("max_tokens_override = %d, want 2048", promptResp.MaxTokensOverride)
	}
}

func TestFeatureAdminUpdateMissingDoesNotWriteAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestFeatureRouter(t)

	req := httptest.NewRequest(http.MethodPut, "/admin/features/missing", strings.NewReader(`{"is_enabled":true}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected missing feature update to return 404, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "feature.admin_updated") != 0 {
		t.Fatalf("expected no audit log for failed feature update")
	}
}

func TestFeatureAdminUpdateClearsDefaultModelID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestFeatureRouter(t)

	defaultModelID := uint(1)
	if err := db.Model(&persistencemodel.FeatureConfig{}).
		Where("feature_key = ?", "image-generation").
		Update("default_model_id", &defaultModelID).Error; err != nil {
		t.Fatalf("seed default model id: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/admin/features/image-generation", strings.NewReader(`{"default_model_id":null}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected default model clear to succeed, got %d: %s", res.Code, res.Body.String())
	}
	var resp struct {
		DefaultModelID *uint `json:"default_model_id"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if resp.DefaultModelID != nil {
		t.Fatalf("default_model_id = %v, want nil", *resp.DefaultModelID)
	}
	var row persistencemodel.FeatureConfig
	if err := db.Where("feature_key = ?", "image-generation").First(&row).Error; err != nil {
		t.Fatalf("reload feature: %v", err)
	}
	if row.DefaultModelID != nil {
		t.Fatalf("stored default_model_id = %v, want nil", *row.DefaultModelID)
	}
	if countAuditAction(t, db, "feature.admin_updated") != 1 {
		t.Fatalf("expected clear default model update audit log")
	}
}

func TestFeatureAdminPromptRejectsNegativeMaxTokensAndDoesNotAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestFeatureRouter(t)

	req := httptest.NewRequest(http.MethodPut, "/admin/features/image-generation/prompt", strings.NewReader(`{
		"system_prompt_override":"bad prompt",
		"max_tokens_override":-1
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected negative max token override to return 400, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "feature.prompt.admin_updated") != 0 {
		t.Fatalf("expected no audit log for failed feature prompt update")
	}
}

func newTestFeatureRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-feature.db", &persistencemodel.FeatureConfig{}, &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}, &persistencemodel.AuditLog{})
	credential := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: "OpenAI", IsEnabled: true}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	modelConfig := persistencemodel.AIModelConfig{
		CredentialID:         credential.ID,
		ModelDefID:           "image-model",
		IsEnabled:            true,
		CustomCapabilities:   "image",
		CustomPricingMode:    "per_image",
		CreditsPerImage:      1,
		CustomAcceptsImage:   false,
		CustomMaxInputImages: 0,
	}
	if err := db.Create(&modelConfig).Error; err != nil {
		t.Fatalf("seed model config: %v", err)
	}
	feature := persistencemodel.FeatureConfig{
		FeatureKey:      "image-generation",
		DisplayName:     "Image Generation",
		Description:     "Generate images",
		Capability:      "image",
		IsEnabled:       true,
		AllowedModelIDs: "[]",
		AllowedRoles:    "[]",
	}
	if err := db.Create(&feature).Error; err != nil {
		t.Fatalf("seed feature: %v", err)
	}

	h := NewFeatureHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.PUT("/admin/features/:key", h.Update)
	router.PUT("/admin/features/:key/prompt", h.UpdatePrompt)
	return router, db
}
