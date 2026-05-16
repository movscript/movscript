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

func TestCloudFileConfigAdminWritesAuditAndDoesNotAuditSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestCloudFileConfigRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/cloud-file-configs", strings.NewReader(`{
		"name":"tos relay",
		"config_type":"tos",
		"priority":3,
		"is_enabled":true,
		"config":{
			"endpoint":"tos-cn-beijing.volces.com",
			"region":"cn-beijing",
			"bucket":"assets",
			"access_key":"ak-secret-value",
			"secret_key":"sk-secret-value"
		}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected config to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	var created struct {
		ID uint `json:"ID"`
	}
	if err := json.Unmarshal(createRes.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ID == 0 {
		t.Fatalf("expected created config id, got %#v", created)
	}
	if countAuditAction(t, db, "cloud_file_config.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "cloud_file_config.admin_created", "ak-secret-value")
	assertAuditMetadataDoesNotContain(t, db, "cloud_file_config.admin_created", "sk-secret-value")

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/cloud-file-configs/1", strings.NewReader(`{
		"name":"tos relay updated",
		"priority":4,
		"is_enabled":false,
		"config":{
			"endpoint":"tos-cn-beijing.volces.com",
			"region":"cn-beijing",
			"bucket":"assets",
			"access_key":"****",
			"secret_key":"rotated-secret-value"
		}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()

	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected config to be updated, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_updated") != 1 {
		t.Fatalf("expected update audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "cloud_file_config.admin_updated", "rotated-secret-value")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/admin/cloud-file-configs/1", nil)
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected config to be deleted, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}
}

func TestCloudFileConfigAdminFailedWritesDoNotAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestCloudFileConfigRouter(t)

	invalidReq := httptest.NewRequest(http.MethodPost, "/admin/cloud-file-configs", strings.NewReader(`{
		"name":"bad",
		"config_type":"ftp",
		"config":{}
	}`))
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()

	router.ServeHTTP(invalidRes, invalidReq)

	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid create to return 400, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_created") != 0 {
		t.Fatalf("expected invalid create not to write audit")
	}

	missingDeleteReq := httptest.NewRequest(http.MethodDelete, "/admin/cloud-file-configs/99", nil)
	missingDeleteRes := httptest.NewRecorder()

	router.ServeHTTP(missingDeleteRes, missingDeleteReq)

	if missingDeleteRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing delete to return 404, got %d: %s", missingDeleteRes.Code, missingDeleteRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_deleted") != 0 {
		t.Fatalf("expected missing delete not to write audit")
	}

	incompleteReq := httptest.NewRequest(http.MethodPost, "/admin/cloud-file-configs", strings.NewReader(`{
		"name":"incomplete",
		"config_type":"tos",
		"config":{"endpoint":"tos-cn-beijing.volces.com"}
	}`))
	incompleteReq.Header.Set("Content-Type", "application/json")
	incompleteRes := httptest.NewRecorder()

	router.ServeHTTP(incompleteRes, incompleteReq)

	if incompleteRes.Code != http.StatusBadRequest {
		t.Fatalf("expected incomplete create to return 400, got %d: %s", incompleteRes.Code, incompleteRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_created") != 0 {
		t.Fatalf("expected incomplete create not to write audit")
	}

	if err := db.Create(&persistencemodel.CloudFileConfig{
		Name:       "broken",
		ConfigType: "tos",
		ConfigJSON: `{"endpoint":"tos-cn-beijing.volces.com"}`,
		IsEnabled:  true,
	}).Error; err != nil {
		t.Fatalf("seed broken config: %v", err)
	}
	testReq := httptest.NewRequest(http.MethodPost, "/admin/cloud-file-configs/1/test", nil)
	testRes := httptest.NewRecorder()

	router.ServeHTTP(testRes, testReq)

	if testRes.Code != http.StatusBadRequest {
		t.Fatalf("expected incomplete test to return 400, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if countAuditAction(t, db, "cloud_file_config.admin_tested") != 0 {
		t.Fatalf("expected failed validation test not to write audit")
	}
}

func newTestCloudFileConfigRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-cloud-file-config.db", &persistencemodel.CloudFileConfig{}, &persistencemodel.AuditLog{})
	h := NewCloudFileConfigHandler(db.Session(&gorm.Session{SkipHooks: true}), "")

	router := gin.New()
	router.POST("/admin/cloud-file-configs", h.Create)
	router.PUT("/admin/cloud-file-configs/:id", h.Update)
	router.POST("/admin/cloud-file-configs/:id/test", h.Test)
	router.DELETE("/admin/cloud-file-configs/:id", h.Delete)
	return router, db
}
