//go:build !runtime_overlay

package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestNewCommunityRoutesDoNotExposeHubAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, route := range []string{
		"POST /api/hub/packages",
		"GET /api/hub/admin/packages",
		"PATCH /api/hub/admin/packages/:id",
		"POST /api/hub/admin/packages/:id/approve",
		"POST /api/hub/admin/packages/:id/reject",
		"POST /api/hub/admin/packages/:id/take-down",
		"POST /api/v1/workflows/:id/publish",
		"POST /api/v1/workflows/:id/unpublish",
		"POST /api/v1/workflows/:id/clone",
	} {
		if routes[route] {
			t.Fatalf("community router should not register %q", route)
		}
	}
}

func TestNewCommunityRegistersAdminRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	expected := []string{
		"GET /api/v1/admin/adapters",
		"GET /api/v1/admin/model-presets",
		"GET /api/v1/admin/credentials",
		"POST /api/v1/admin/credentials",
		"PUT /api/v1/admin/credentials/:id",
		"DELETE /api/v1/admin/credentials/:id",
		"POST /api/v1/admin/credentials/:id/test",
		"GET /api/v1/admin/credentials/:id/remote-models",
		"GET /api/v1/admin/credentials/:id/models",
		"POST /api/v1/admin/credentials/:id/models",
		"PUT /api/v1/admin/credentials/:id/models/:modelId",
		"DELETE /api/v1/admin/credentials/:id/models/:modelId",
		"POST /api/v1/admin/credentials/:id/models/:modelId/test",
		"POST /api/v1/admin/credentials/:id/models/:modelId/debug",
		"PATCH /api/v1/admin/model-configs/:id",
		"POST /api/v1/admin/model-configs/preview-contract",
		"GET /api/v1/admin/feature-defs",
		"GET /api/v1/admin/features",
		"PUT /api/v1/admin/features/:key",
		"PUT /api/v1/admin/features/:key/prompt",
		"GET /api/v1/admin/overview",
		"GET /api/v1/admin/users",
		"GET /api/v1/admin/settings/auth",
		"PUT /api/v1/admin/settings/auth",
		"POST /api/v1/admin/users",
		"GET /api/v1/admin/users/:id/detail",
		"PUT /api/v1/admin/users/:id/password",
		"DELETE /api/v1/admin/users/:id/sessions",
		"DELETE /api/v1/admin/users/:id/sessions/:sessionId",
		"PATCH /api/v1/admin/users/:id",
		"GET /api/v1/admin/orgs",
		"POST /api/v1/admin/orgs",
		"GET /api/v1/admin/orgs/:id/detail",
		"GET /api/v1/admin/orgs/:id/members",
		"POST /api/v1/admin/orgs/:id/members",
		"PATCH /api/v1/admin/orgs/:id/members/:userId",
		"DELETE /api/v1/admin/orgs/:id/members/:userId",
		"GET /api/v1/admin/orgs/:id/invitations",
		"POST /api/v1/admin/orgs/:id/invitations",
		"DELETE /api/v1/admin/orgs/:id/invitations/:invitationId",
		"POST /api/v1/admin/orgs/:id/join-code/rotate",
		"PATCH /api/v1/admin/orgs/:id",
		"GET /api/v1/admin/audit-logs/summary",
		"GET /api/v1/admin/audit-logs/export",
		"GET /api/v1/admin/audit-logs",
		"GET /api/v1/admin/usage-logs/summary",
		"GET /api/v1/admin/usage-logs/export",
		"GET /api/v1/admin/usage-logs",
		"GET /api/v1/admin/projects",
		"POST /api/v1/admin/projects",
		"GET /api/v1/admin/projects/:id/detail",
		"GET /api/v1/admin/projects/:id/members",
		"POST /api/v1/admin/projects/:id/members",
		"PATCH /api/v1/admin/projects/:id/members/:memberId",
		"DELETE /api/v1/admin/projects/:id/members/:memberId",
		"PATCH /api/v1/admin/projects/:id",
		"PUT /api/v1/admin/projects/:id/owner",
		"DELETE /api/v1/admin/projects/:id",
		"GET /api/v1/admin/resource-storage/backends",
		"GET /api/v1/admin/resource-storage/stats",
		"GET /api/v1/admin/resource-storage/resources",
		"GET /api/v1/admin/resource-storage/resources/:id/detail",
		"DELETE /api/v1/admin/resource-storage/resources/:id",
		"GET /api/v1/admin/cloud-file-configs",
		"POST /api/v1/admin/cloud-file-configs",
		"PUT /api/v1/admin/cloud-file-configs/:id",
		"POST /api/v1/admin/cloud-file-configs/:id/test",
		"DELETE /api/v1/admin/cloud-file-configs/:id",
		"POST /api/v1/admin/debug/raw-call",
		"POST /api/v1/admin/debug/provider-call",
		"GET /api/v1/admin/debug/jobs",
		"GET /api/v1/admin/debug/job-stats",
		"GET /api/v1/admin/debug/health",
		"GET /api/v1/admin/debug/health-settings",
		"PUT /api/v1/admin/debug/health-settings",
		"GET /api/v1/admin/debug/jobs/:id",
		"POST /api/v1/admin/debug/jobs/:id/cancel",
		"POST /api/v1/admin/debug/jobs/:id/retry",
		"DELETE /api/v1/admin/debug/jobs/:id",
		"GET /api/v1/admin/debug/metrics",
	}

	for _, route := range expected {
		if !routes[route] {
			t.Fatalf("expected admin route %q to be registered", route)
		}
	}
}

func TestAdminRoutesRequireSuperAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-admin-auth.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.GatewayAPIKey{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	noAuth := httptest.NewRecorder()
	r.ServeHTTP(noAuth, httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil))
	if noAuth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated admin status = %d, want %d", noAuth.Code, http.StatusUnauthorized)
	}

	user := persistencemodel.User{Username: "normal-admin-test", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	userToken, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	userReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil)
	userReq.Header.Set("Authorization", "Bearer "+userToken)
	userRes := httptest.NewRecorder()
	r.ServeHTTP(userRes, userReq)
	if userRes.Code != http.StatusForbidden {
		t.Fatalf("normal user admin status = %d, want %d; body=%s", userRes.Code, http.StatusForbidden, userRes.Body.String())
	}

	superAdmin := persistencemodel.User{Username: "super-admin-test", SystemRole: "super_admin"}
	if err := db.Create(&superAdmin).Error; err != nil {
		t.Fatal(err)
	}
	superToken, _, err := tokens.Issue(tokenauth.Subject{UserID: superAdmin.ID, Username: superAdmin.Username, SystemRole: superAdmin.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	superReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/debug/metrics", nil)
	superReq.Header.Set("Authorization", "Bearer "+superToken)
	superRes := httptest.NewRecorder()
	r.ServeHTTP(superRes, superReq)
	if superRes.Code != http.StatusOK {
		t.Fatalf("super admin metrics status = %d, want %d; body=%s", superRes.Code, http.StatusOK, superRes.Body.String())
	}

	userKeyReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-gateway/api-keys", nil)
	userKeyReq.Header.Set("Authorization", "Bearer "+userToken)
	userKeyRes := httptest.NewRecorder()
	r.ServeHTTP(userKeyRes, userKeyReq)
	if userKeyRes.Code != http.StatusForbidden {
		t.Fatalf("normal user gateway key admin status = %d, want %d; body=%s", userKeyRes.Code, http.StatusForbidden, userKeyRes.Body.String())
	}

	superKeyReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-gateway/api-keys", nil)
	superKeyReq.Header.Set("Authorization", "Bearer "+superToken)
	superKeyRes := httptest.NewRecorder()
	r.ServeHTTP(superKeyRes, superKeyReq)
	if superKeyRes.Code != http.StatusOK {
		t.Fatalf("super admin gateway key admin status = %d, want %d; body=%s", superKeyRes.Code, http.StatusOK, superKeyRes.Body.String())
	}
}
