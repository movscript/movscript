package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	adminusage "github.com/movscript/movscript/internal/app/admin/usage"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestUsageLogListFiltersByOrgProjectAndSince(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-usage-list.db", &persistencemodel.User{}, &persistencemodel.UsageLog{})
	user := persistencemodel.User{Username: "usage-list-user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	runtimeModelID := uint(1)

	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	orgID := uint(9)
	otherOrgID := uint(10)
	projectID := uint(11)
	otherProjectID := uint(12)
	gatewayKeyID := uint(21)
	otherGatewayKeyID := uint(22)
	createScopedUsageLog(t, db, user.ID, runtimeModelID, &orgID, &projectID, &gatewayKeyID, 1.5, now.Add(-time.Hour))
	createScopedUsageLog(t, db, user.ID, runtimeModelID, &orgID, &projectID, &otherGatewayKeyID, 1.7, now.Add(-time.Hour))
	createScopedUsageLog(t, db, user.ID, runtimeModelID, &orgID, &otherProjectID, &gatewayKeyID, 2.5, now.Add(-time.Hour))
	createScopedUsageLog(t, db, user.ID, runtimeModelID, &otherOrgID, &projectID, &gatewayKeyID, 3.5, now.Add(-time.Hour))
	createScopedUsageLog(t, db, user.ID, runtimeModelID, &orgID, &projectID, &gatewayKeyID, 4.5, now.AddDate(0, 0, -30))

	h := NewUsageAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/usage-logs", h.List)

	req := httptest.NewRequest(http.MethodGet, "/admin/usage-logs?org_id=9&project_id=11&gateway_api_key_id=21&since=2026-05-09T12:00:00Z", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected usage list to succeed, got %d: %s", res.Code, res.Body.String())
	}

	var page adminusage.Page
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode usage list response: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("expected one filtered usage log, got total=%d len=%d body=%s", page.Total, len(page.Items), res.Body.String())
	}
	if page.Items[0].OrgID == nil || *page.Items[0].OrgID != orgID || page.Items[0].ProjectID == nil || *page.Items[0].ProjectID != projectID || page.Items[0].Cost != 1.5 {
		t.Fatalf("unexpected filtered usage log: %+v", page.Items[0])
	}
}

func TestUsageLogListPaginates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-usage-pagination.db", &persistencemodel.User{}, &persistencemodel.UsageLog{})
	user := persistencemodel.User{Username: "usage-pagination-user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	runtimeModelID := uint(1)

	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	createScopedUsageLog(t, db, user.ID, runtimeModelID, nil, nil, nil, 1, now)
	createScopedUsageLog(t, db, user.ID, runtimeModelID, nil, nil, nil, 2, now)
	createScopedUsageLog(t, db, user.ID, runtimeModelID, nil, nil, nil, 3, now)

	h := NewUsageAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/usage-logs", h.List)

	req := httptest.NewRequest(http.MethodGet, "/admin/usage-logs?page=2&page_size=1", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected usage list to succeed, got %d: %s", res.Code, res.Body.String())
	}

	var page adminusage.Page
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode usage list response: %v", err)
	}
	if page.Total != 3 || page.Page != 2 || page.PageSize != 1 || len(page.Items) != 1 {
		t.Fatalf("unexpected paginated usage page: %+v body=%s", page, res.Body.String())
	}
	if page.Items[0].Cost != 2 {
		t.Fatalf("page 2 should return second newest usage log, got %+v", page.Items[0])
	}
}

func createScopedUsageLog(t *testing.T, db *gorm.DB, userID uint, runtimeModelID uint, orgID *uint, projectID *uint, gatewayKeyID *uint, cost float64, createdAt time.Time) {
	t.Helper()
	log := persistencemodel.UsageLog{
		UserID:          userID,
		OrgID:           orgID,
		ProjectID:       projectID,
		GatewayAPIKeyID: gatewayKeyID,
		RuntimeModelID:  runtimeModelID,
		OperationType:   "text",
		InputTokens:     10,
		OutputTokens:    2,
		Cost:            cost,
	}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Model(&log).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
		t.Fatalf("set usage timestamp: %v", err)
	}
}
