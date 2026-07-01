//go:build !runtime_overlay

package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
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
		"POST /api/v1/admin/model-imports/preview",
		"POST /api/v1/admin/model-imports/apply",
		"GET /api/v1/admin/model-catalog/templates",
		"GET /api/v1/admin/model-catalog",
		"POST /api/v1/admin/model-catalog",
		"PUT /api/v1/admin/model-catalog/:id",
		"DELETE /api/v1/admin/model-catalog/:id",
		"POST /api/v1/admin/model-catalog/:id/route-bindings",
		"PUT /api/v1/admin/model-catalog/:id/route-bindings/:bindingId",
		"DELETE /api/v1/admin/model-catalog/:id/route-bindings/:bindingId",
		"GET /api/v1/admin/provider-instances",
		"GET /api/v1/admin/provider-instances/:id/config",
		"PUT /api/v1/admin/provider-instances/:id/config",
		"POST /api/v1/admin/provider-instances/:id/config/apply",
		"POST /api/v1/admin/provider-instances/:id/config/activate",
		"POST /api/v1/admin/provider-instances/:id/test",
		"GET /api/v1/admin/credentials",
		"POST /api/v1/admin/credentials",
		"PUT /api/v1/admin/credentials/:id",
		"DELETE /api/v1/admin/credentials/:id",
		"POST /api/v1/admin/credentials/:id/test",
		"GET /api/v1/admin/credentials/:id/remote-models",
		"GET /api/v1/admin/overview",
		"GET /api/v1/admin/settings/generation-tools",
		"PUT /api/v1/admin/settings/generation-tools",
		"GET /api/v1/admin/settings/resource-access/profiles",
		"PUT /api/v1/admin/settings/resource-access/profiles/:profileID",
		"DELETE /api/v1/admin/settings/resource-access/profiles/:profileID",
		"POST /api/v1/admin/settings/resource-access/profiles/:profileID/test",
		"POST /api/v1/admin/settings/resource-access/routes/diagnose",
		"GET /api/v1/admin/settings/usage-policy",
		"GET /api/v1/admin/settings/usage-policy/diagnose",
		"PUT /api/v1/admin/settings/usage-policy",
		"GET /api/v1/admin/users/:id/detail",
		"GET /api/v1/admin/orgs/:id/detail",
		"GET /api/v1/admin/orgs/:id/invitations",
		"POST /api/v1/admin/orgs/:id/invitations",
		"DELETE /api/v1/admin/orgs/:id/invitations/:invitationId",
		"POST /api/v1/admin/orgs/:id/join-code/rotate",
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
		"GET /api/v1/admin/resource-storage/resources/:id/file",
		"DELETE /api/v1/admin/resource-storage/resources/:id",
		"POST /api/v1/admin/resource-storage/blobs/gc",
		"POST /api/v1/admin/resource-storage/media-streams/gc",
		"GET /api/v1/admin/shot-vectors/stats",
		"GET /api/v1/admin/shot-vectors/search",
		"GET /api/v1/admin/shot-vectors/metrics",
		"POST /api/v1/admin/shot-vectors/reindex",
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
		"GET /api/v1/admin/debug/model-runtime-health",
		"GET /api/v1/admin/debug/health-settings",
		"PUT /api/v1/admin/debug/health-settings",
		"GET /api/v1/admin/debug/agent-telemetry",
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

	for _, route := range []string{
		"GET /api/v1/admin/credentials/:id/models",
		"POST /api/v1/admin/credentials/:id/models",
		"PUT /api/v1/admin/credentials/:id/models/:modelId",
		"DELETE /api/v1/admin/credentials/:id/models/:modelId",
		"POST /api/v1/admin/credentials/:id/models/:modelId/test",
		"POST /api/v1/admin/credentials/:id/models/:modelId/debug",
		"PATCH /api/v1/admin/model-configs/:id",
		"POST /api/v1/admin/model-configs/preview-contract",
		"GET /api/v1/admin/settings/auth",
		"PUT /api/v1/admin/settings/auth",
		"GET /api/v1/admin/users",
		"POST /api/v1/admin/users",
		"PATCH /api/v1/admin/users/:id",
		"DELETE /api/v1/admin/users/:id/sessions",
		"DELETE /api/v1/admin/users/:id/sessions/:sessionId",
		"PUT /api/v1/admin/users/:id/password",
		"GET /api/v1/admin/orgs",
		"POST /api/v1/admin/orgs",
		"PATCH /api/v1/admin/orgs/:id",
		"GET /api/v1/admin/orgs/:id/members",
		"POST /api/v1/admin/orgs/:id/members",
		"PATCH /api/v1/admin/orgs/:id/members/:userId",
		"DELETE /api/v1/admin/orgs/:id/members/:userId",
	} {
		if routes[route] {
			t.Fatalf("route %q should not be registered", route)
		}
	}
}

func TestAdminRoutesRequireSuperAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-admin-auth.db", &persistencemodel.Organization{}, &persistencemodel.GatewayAPIKey{})
	authProvider := newRouterTestAuthProvider()
	cfg := &config.Config{}
	r := New(Dependencies{Config: cfg, DB: db, AuthProvider: authProvider, AuthIdentity: newRouterTestAuthIdentity()})

	noAuth := httptest.NewRecorder()
	r.ServeHTTP(noAuth, httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil))
	if noAuth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated admin status = %d, want %d", noAuth.Code, http.StatusUnauthorized)
	}

	user := newRouterExternalUser("normal-admin-test", "user")
	addRouterAuthUser(authProvider, "sk-normal-admin-test", user)
	userReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil)
	userReq.Header.Set("Authorization", "Bearer sk-normal-admin-test")
	userRes := httptest.NewRecorder()
	r.ServeHTTP(userRes, userReq)
	if userRes.Code != http.StatusForbidden {
		t.Fatalf("normal user admin status = %d, want %d; body=%s", userRes.Code, http.StatusForbidden, userRes.Body.String())
	}

	superAdmin := newRouterExternalUser("super-admin-test", "super_admin")
	addRouterAuthUser(authProvider, "sk-super-admin-test", superAdmin)
	superReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/debug/metrics", nil)
	superReq.Header.Set("Authorization", "Bearer sk-super-admin-test")
	superRes := httptest.NewRecorder()
	r.ServeHTTP(superRes, superReq)
	if superRes.Code != http.StatusOK {
		t.Fatalf("super admin metrics status = %d, want %d; body=%s", superRes.Code, http.StatusOK, superRes.Body.String())
	}

	userKeyReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-gateway/api-keys", nil)
	userKeyReq.Header.Set("Authorization", "Bearer sk-normal-admin-test")
	userKeyRes := httptest.NewRecorder()
	r.ServeHTTP(userKeyRes, userKeyReq)
	if userKeyRes.Code != http.StatusForbidden {
		t.Fatalf("normal user gateway key admin status = %d, want %d; body=%s", userKeyRes.Code, http.StatusForbidden, userKeyRes.Body.String())
	}

	superKeyReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-gateway/api-keys", nil)
	superKeyReq.Header.Set("Authorization", "Bearer sk-super-admin-test")
	superKeyRes := httptest.NewRecorder()
	r.ServeHTTP(superKeyRes, superKeyReq)
	if superKeyRes.Code != http.StatusOK {
		t.Fatalf("super admin gateway key admin status = %d, want %d; body=%s", superKeyRes.Code, http.StatusOK, superKeyRes.Body.String())
	}
}
