package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	auditapp "github.com/movscript/movscript/internal/app/audit"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAuditLogListFiltersByOrgAndProject(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-audit-list.db", &persistencemodel.AuditLog{})
	orgID := uint(9)
	otherOrgID := uint(10)
	projectID := uint(11)
	otherProjectID := uint(12)
	if err := db.Create(&persistencemodel.AuditLog{Action: "model_gateway.api_key.admin_created", TargetType: "model_gateway_api_key", TargetID: "1", OrgID: &orgID, ProjectID: &projectID}).Error; err != nil {
		t.Fatalf("create scoped audit log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{Action: "model_gateway.api_key.admin_created", TargetType: "model_gateway_api_key", TargetID: "2", OrgID: &orgID, ProjectID: &otherProjectID}).Error; err != nil {
		t.Fatalf("create other project audit log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{Action: "model_gateway.api_key.admin_created", TargetType: "model_gateway_api_key", TargetID: "3", OrgID: &otherOrgID, ProjectID: &projectID}).Error; err != nil {
		t.Fatalf("create other org audit log: %v", err)
	}

	h := NewAuditHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/audit-logs", h.List)

	req := httptest.NewRequest(http.MethodGet, "/admin/audit-logs?org_id=9&project_id=11", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected audit list to succeed, got %d: %s", res.Code, res.Body.String())
	}

	var page auditapp.Page
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode audit list response: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("expected one filtered audit log, got total=%d len=%d body=%s", page.Total, len(page.Items), res.Body.String())
	}
	if page.Items[0].TargetID != "1" || page.Items[0].OrgID == nil || *page.Items[0].OrgID != orgID || page.Items[0].ProjectID == nil || *page.Items[0].ProjectID != projectID {
		t.Fatalf("unexpected filtered audit log: %+v", page.Items[0])
	}
}

func TestAuditLogListPaginates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-audit-pagination.db", &persistencemodel.AuditLog{})
	for _, targetID := range []string{"1", "2", "3"} {
		if err := db.Create(&persistencemodel.AuditLog{Action: "test.action", TargetType: "test", TargetID: targetID}).Error; err != nil {
			t.Fatalf("create audit log %s: %v", targetID, err)
		}
	}

	h := NewAuditHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/audit-logs", h.List)

	req := httptest.NewRequest(http.MethodGet, "/admin/audit-logs?page=2&page_size=1", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected audit list to succeed, got %d: %s", res.Code, res.Body.String())
	}

	var page auditapp.Page
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode audit list response: %v", err)
	}
	if page.Total != 3 || page.Page != 2 || page.PageSize != 1 || len(page.Items) != 1 {
		t.Fatalf("unexpected paginated audit page: %+v body=%s", page, res.Body.String())
	}
	if page.Items[0].TargetID != "2" {
		t.Fatalf("page 2 should return second newest audit log, got %+v", page.Items[0])
	}
}
