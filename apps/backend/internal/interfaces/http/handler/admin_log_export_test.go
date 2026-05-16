package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAuditLogExportUsesFiltersAndSanitizesCSVCells(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-audit-export.db", &persistencemodel.AuditLog{})
	orgID := uint(9)
	otherOrgID := uint(10)
	if err := db.Create(&persistencemodel.AuditLog{Action: "=danger", TargetType: "project", TargetID: "1", OrgID: &orgID, Metadata: `{"note":"+formula"}`}).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{Action: "=danger", TargetType: "project", TargetID: "3", OrgID: &otherOrgID}).Error; err != nil {
		t.Fatalf("create other org audit log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{Action: "other", TargetType: "project", TargetID: "2"}).Error; err != nil {
		t.Fatalf("create second audit log: %v", err)
	}
	h := NewAuditHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/audit-logs/export", h.Export)

	req := httptest.NewRequest(http.MethodGet, "/admin/audit-logs/export?action=%3Ddanger&org_id=9", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected audit export to succeed, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(res.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("expected CSV content type, got %s", res.Header().Get("Content-Type"))
	}
	if !strings.Contains(body, "'=danger") {
		t.Fatalf("expected formula-like action to be escaped, got %s", body)
	}
	if strings.Contains(body, "other") {
		t.Fatalf("expected action filter to be applied, got %s", body)
	}
	if strings.Contains(body, ",3,") {
		t.Fatalf("expected org filter to be applied, got %s", body)
	}
}

func TestUsageLogExportUsesFiltersAndSanitizesCSVCells(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-usage-export.db", &persistencemodel.User{}, &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}, &persistencemodel.UsageLog{})
	user := persistencemodel.User{Username: "=cmd"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	cred := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: "Provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	model := persistencemodel.AIModelConfig{CredentialID: cred.ID, ModelDefID: "text", ShortName: "+model", CustomCapabilities: "text", IsEnabled: true}
	if err := db.Create(&model).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
	gatewayKeyID := uint(21)
	otherGatewayKeyID := uint(22)
	if err := db.Create(&persistencemodel.UsageLog{UserID: user.ID, AIModelConfigID: model.ID, GatewayAPIKeyID: &gatewayKeyID, OperationType: "text", InputTokens: 10, OutputTokens: 2, Cost: 0.5}).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: user.ID, AIModelConfigID: model.ID, GatewayAPIKeyID: &otherGatewayKeyID, OperationType: "text", InputTokens: 1, OutputTokens: 1, Cost: 1.5}).Error; err != nil {
		t.Fatalf("create second usage log: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: user.ID, AIModelConfigID: model.ID, GatewayAPIKeyID: &gatewayKeyID, OperationType: "image", ImageCount: 1, Cost: 2}).Error; err != nil {
		t.Fatalf("create third usage log: %v", err)
	}
	h := NewUsageAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/usage-logs/export", h.Export)

	req := httptest.NewRequest(http.MethodGet, "/admin/usage-logs/export?operation_type=text&gateway_api_key_id=21", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected usage export to succeed, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(res.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("expected CSV content type, got %s", res.Header().Get("Content-Type"))
	}
	if !strings.Contains(body, "'=cmd") || !strings.Contains(body, "'+model") {
		t.Fatalf("expected formula-like cells to be escaped, got %s", body)
	}
	if strings.Contains(body, ",image,") {
		t.Fatalf("expected operation filter to be applied, got %s", body)
	}
	if strings.Contains(body, ",22") {
		t.Fatalf("expected gateway key filter to be applied, got %s", body)
	}
}
