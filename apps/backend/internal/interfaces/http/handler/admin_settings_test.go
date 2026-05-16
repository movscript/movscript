package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestAdminAuthSettingsUpdateMasksPasswordAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-admin-auth-settings.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.GET("/admin/settings/auth", handler.GetAuthSettings)
	router.PUT("/admin/settings/auth", handler.UpdateAuthSettings)

	req := httptest.NewRequest(http.MethodPut, "/admin/settings/auth", strings.NewReader(`{
		"registration_enabled": true,
		"require_email_verification": true,
		"email": {
			"enabled": true,
			"host": "smtp.example.com",
			"port": 587,
			"username": "mailer",
			"password": "smtp-secret",
			"from_email": "noreply@example.com",
			"from_name": "Movscript",
			"use_start_tls": true
		}
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected settings update, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "smtp-secret") {
		t.Fatalf("settings response leaked smtp password: %s", res.Body.String())
	}
	if countAuditAction(t, db, "settings.auth.admin_updated") != 1 {
		t.Fatalf("expected settings audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "settings.auth.admin_updated", "smtp-secret")

	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, httptest.NewRequest(http.MethodGet, "/admin/settings/auth", nil))
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected settings get, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if strings.Contains(getRes.Body.String(), "smtp-secret") || !strings.Contains(getRes.Body.String(), `"password_set":true`) {
		t.Fatalf("unexpected settings get response: %s", getRes.Body.String())
	}
}
