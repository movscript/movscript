package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestUserAdminWritesAuditForCreateUpdatePasswordAndSessionRevoke(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestUserAdminRouter(t)

	createRes := performUserAdminJSON(router, http.MethodPost, "/admin/users", `{
		"username":"created-user",
		"password":"secret123",
		"email":"created@example.com",
		"display_name":"Created User",
		"system_role":"user",
		"status":"active"
	}`)
	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected user create to succeed, got %d: %s", createRes.Code, createRes.Body.String())
	}
	var created persistencemodel.User
	if err := json.Unmarshal(createRes.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created user: %v", err)
	}
	if countAuditAction(t, db, "user.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "user.admin_created", "secret123")
	assertAuditMetadataDoesNotContain(t, db, "user.admin_created", "password")

	updateRes := performUserAdminJSON(router, http.MethodPatch, "/admin/users/"+strconv.FormatUint(uint64(created.ID), 10), `{
		"display_name":"Updated User",
		"status":"disabled"
	}`)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected user update to succeed, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "user.admin_updated") != 1 {
		t.Fatalf("expected update audit log")
	}

	resetRes := performUserAdminJSON(router, http.MethodPut, "/admin/users/"+strconv.FormatUint(uint64(created.ID), 10)+"/password", `{
		"password":"newpass123"
	}`)
	if resetRes.Code != http.StatusOK {
		t.Fatalf("expected password reset to succeed, got %d: %s", resetRes.Code, resetRes.Body.String())
	}
	if countAuditAction(t, db, "user.password.admin_reset") != 1 {
		t.Fatalf("expected password reset audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "user.password.admin_reset", "newpass123")
	assertAuditMetadataDoesNotContain(t, db, "user.password.admin_reset", "password")

	session := persistencemodel.AuthSession{UserID: created.ID, TokenHash: "single-session", ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	revokeRes := httptest.NewRecorder()
	router.ServeHTTP(revokeRes, httptest.NewRequest(http.MethodDelete, "/admin/users/"+strconv.FormatUint(uint64(created.ID), 10)+"/sessions/"+strconv.FormatUint(uint64(session.ID), 10), nil))
	if revokeRes.Code != http.StatusNoContent {
		t.Fatalf("expected session revoke to succeed, got %d: %s", revokeRes.Code, revokeRes.Body.String())
	}
	if countAuditAction(t, db, "user.session.admin_revoked") != 1 {
		t.Fatalf("expected session revoke audit log")
	}
}

func TestUserAdminFailedWritesDoNotAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestUserAdminRouter(t)

	createRes := performUserAdminJSON(router, http.MethodPost, "/admin/users", `{
		"username":"bad-user",
		"password":"short"
	}`)
	if createRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid create to return 400, got %d: %s", createRes.Code, createRes.Body.String())
	}
	if countAuditAction(t, db, "user.admin_created") != 0 {
		t.Fatalf("expected invalid create not to write audit")
	}

	updateRes := performUserAdminJSON(router, http.MethodPatch, "/admin/users/999", `{"status":"disabled"}`)
	if updateRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing update to return 404, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "user.admin_updated") != 0 {
		t.Fatalf("expected missing update not to write audit")
	}

	resetRes := performUserAdminJSON(router, http.MethodPut, "/admin/users/999/password", `{"password":"newpass123"}`)
	if resetRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing password reset to return 404, got %d: %s", resetRes.Code, resetRes.Body.String())
	}
	if countAuditAction(t, db, "user.password.admin_reset") != 0 {
		t.Fatalf("expected missing password reset not to write audit")
	}

	revokeRes := httptest.NewRecorder()
	router.ServeHTTP(revokeRes, httptest.NewRequest(http.MethodDelete, "/admin/users/999/sessions/1", nil))
	if revokeRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing session revoke to return 404, got %d: %s", revokeRes.Code, revokeRes.Body.String())
	}
	if countAuditAction(t, db, "user.session.admin_revoked") != 0 {
		t.Fatalf("expected missing session revoke not to write audit")
	}
}

func TestUserAdminRevokeAllSessionsWritesAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestUserAdminRouter(t)
	user := persistencemodel.User{Username: "session-user", SystemRole: "user", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.Create(&persistencemodel.AuthSession{UserID: user.ID, TokenHash: "active-one", ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	if err := db.Create(&persistencemodel.AuthSession{UserID: user.ID, TokenHash: "expired-one", ExpiresAt: time.Now().Add(-time.Hour)}).Error; err != nil {
		t.Fatalf("create expired session: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/admin/users/"+strconv.FormatUint(uint64(user.ID), 10)+"/sessions", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected revoke all sessions to succeed, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "user.sessions.admin_revoked") != 1 {
		t.Fatalf("expected revoke all sessions audit log")
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/admin/users/999/sessions", nil)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing user rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "user.sessions.admin_revoked") != 1 {
		t.Fatalf("missing user should not add audit log")
	}
}

func TestUserAdminListFiltersByUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestUserAdminRouter(t)
	target := persistencemodel.User{Username: "target-user", SystemRole: "user", Status: "active"}
	other := persistencemodel.User{Username: "other-user", SystemRole: "user", Status: "active"}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target user: %v", err)
	}
	if err := db.Create(&other).Error; err != nil {
		t.Fatalf("create other user: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/users?user_id="+strconv.FormatUint(uint64(target.ID), 10), nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected user list, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Items []persistencemodel.User `json:"items"`
		Total int64                   `json:"total"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode user list: %v", err)
	}
	if body.Total != 1 || len(body.Items) != 1 || body.Items[0].ID != target.ID {
		t.Fatalf("unexpected user list body: %+v", body)
	}

	invalidReq := httptest.NewRequest(http.MethodGet, "/admin/users?user_id=bad", nil)
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid user_id rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
}

func newTestUserAdminRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-user-admin.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuthSession{}, &persistencemodel.AuditLog{})
	handler := NewUserAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/users", handler.List)
	router.POST("/admin/users", handler.Create)
	router.PATCH("/admin/users/:id", handler.Update)
	router.PUT("/admin/users/:id/password", handler.ResetPassword)
	router.DELETE("/admin/users/:id/sessions", handler.RevokeAllSessions)
	router.DELETE("/admin/users/:id/sessions/:sessionId", handler.RevokeSession)
	return router, db
}

func performUserAdminJSON(router *gin.Engine, method string, target string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}
