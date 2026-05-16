package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestModelGatewayAPIKeyAdminWritesAuditAndDoesNotAuditRawKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestModelGatewayAPIKeyRouter(t)
	org := persistencemodel.Organization{Name: "Gateway Org", Slug: "gateway-org", Plan: "team", Status: "active", CreatedBy: 7}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("seed org: %v", err)
	}
	project := persistencemodel.Project{Name: "Gateway Project", OwnerID: 7, OrgID: &org.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	createReq := authenticatedGatewayRequest(http.MethodPost, "/model-gateway/api-keys", fmt.Sprintf(`{
		"name":"agent service",
		"project_id":%d,
		"allowed_model_ids":[1,2],
		"allowed_scopes":["model:chat"]
	}`, project.ID))
	createReq.Header.Set("X-Org-ID", fmt.Sprint(org.ID))
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected api key to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(createRes.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	rawKey, ok := created["key"].(string)
	if !ok || !strings.HasPrefix(rawKey, "mgw_") {
		t.Fatalf("expected raw gateway key in one-time response, got %#v", created)
	}
	if countAuditAction(t, db, "model_gateway.api_key.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}
	assertGatewayAPIKeyAuditScope(t, db, "model_gateway.api_key.admin_created", org.ID, project.ID)
	assertAuditMetadataDoesNotContain(t, db, "model_gateway.api_key.admin_created", rawKey)
	assertAuditMetadataDoesNotContain(t, db, "model_gateway.api_key.admin_created", "key_hash")

	updateReq := authenticatedGatewayRequest(http.MethodPatch, "/model-gateway/api-keys/1", `{
		"name":"agent service updated",
		"is_enabled":false,
		"allowed_scopes":["*"]
	}`)
	updateReq.Header.Set("X-Org-ID", fmt.Sprint(org.ID))
	updateRes := httptest.NewRecorder()

	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected api key to be updated, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "model_gateway.api_key.admin_updated") != 1 {
		t.Fatalf("expected update audit log")
	}
	assertGatewayAPIKeyAuditScope(t, db, "model_gateway.api_key.admin_updated", org.ID, project.ID)

	deleteReq := authenticatedGatewayRequest(http.MethodDelete, "/model-gateway/api-keys/1", "")
	deleteReq.Header.Set("X-Org-ID", fmt.Sprint(org.ID))
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected api key to be deleted, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "model_gateway.api_key.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}
	assertGatewayAPIKeyAuditScope(t, db, "model_gateway.api_key.admin_deleted", org.ID, project.ID)

	missingReq := authenticatedGatewayRequest(http.MethodDelete, "/model-gateway/api-keys/1", "")
	missingReq.Header.Set("X-Org-ID", fmt.Sprint(org.ID))
	missingRes := httptest.NewRecorder()

	router.ServeHTTP(missingRes, missingReq)

	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing api key delete, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "model_gateway.api_key.admin_deleted") != 1 {
		t.Fatalf("expected failed delete not to write another audit log")
	}
}

func TestModelGatewayAPIKeyRequiresAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, _ := newTestModelGatewayAPIKeyRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/model-gateway/api-keys", strings.NewReader(`{"name":"agent service"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated create to return 401, got %d: %s", res.Code, res.Body.String())
	}
}

func newTestModelGatewayAPIKeyRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-model-gateway-keys.db", &persistencemodel.GatewayAPIKey{}, &persistencemodel.Project{}, &persistencemodel.Organization{}, &persistencemodel.AuditLog{})
	h := NewModelGatewayHandler(db.Session(&gorm.Session{SkipHooks: true}), nil)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		if c.GetHeader("X-Test-User") == "1" {
			c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 7, Username: "alice", SystemRole: "user", Status: "active"})
		}
		c.Next()
	})
	router.POST("/model-gateway/api-keys", h.CreateAPIKey)
	router.PATCH("/model-gateway/api-keys/:id", h.UpdateAPIKey)
	router.DELETE("/model-gateway/api-keys/:id", h.DeleteAPIKey)
	return router, db
}

func authenticatedGatewayRequest(method string, target string, body string) *http.Request {
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("X-Test-User", "1")
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}

func assertAuditMetadataDoesNotContain(t *testing.T, db *gorm.DB, action string, forbidden string) {
	t.Helper()
	var row persistencemodel.AuditLog
	if err := db.Where("action = ?", action).First(&row).Error; err != nil {
		t.Fatalf("load audit log %s: %v", action, err)
	}
	if strings.Contains(row.Metadata, forbidden) {
		t.Fatalf("audit metadata for %s contains forbidden value %q: %s", action, forbidden, row.Metadata)
	}
}

func assertGatewayAPIKeyAuditScope(t *testing.T, db *gorm.DB, action string, orgID uint, projectID uint) {
	t.Helper()
	var row persistencemodel.AuditLog
	if err := db.Where("action = ?", action).First(&row).Error; err != nil {
		t.Fatalf("load audit log %s: %v", action, err)
	}
	if row.OrgID == nil || *row.OrgID != orgID {
		t.Fatalf("%s audit org_id = %#v, want %d", action, row.OrgID, orgID)
	}
	if row.ProjectID == nil || *row.ProjectID != projectID {
		t.Fatalf("%s audit project_id = %#v, want %d", action, row.ProjectID, projectID)
	}
}
