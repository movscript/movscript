package router

import (
	"encoding/json"
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

func TestNewRegistersCoreRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	expected := []string{
		"GET /health",
		"GET /v1/models",
		"POST /v1/chat/completions",
		"GET /api/v1/auth/config",
		"GET /api/v1/auth/me",
		"POST /api/v1/orgs/join",
		"POST /api/v1/auth/code/start",
		"POST /api/v1/auth/code/verify",
		"POST /api/v1/auth/register",
		"POST /api/v1/auth/login",
		"POST /api/v1/auth/logout",
		"PATCH /api/v1/auth/profile",
		"GET /api/v1/models",
		"GET /api/v1/ws",
		"GET /api/v1/users",
		"GET /api/v1/backend/dependencies",
		"GET /api/v1/resources",
		"POST /api/v1/resources/upload",
		"GET /api/v1/jobs",
		"GET /api/v1/agent/telemetry",
		"POST /api/v1/agent/telemetry",
		"GET /api/v1/canvases",
		"GET /api/v1/projects",
		"GET /api/v1/projects/:id/workspace",
		"GET /api/v1/projects/:id/decisions",
		"PUT /api/v1/projects/:id/decisions/candidates",
		"POST /api/v1/projects/:id/decisions/candidates",
		"PUT /api/v1/projects/:id/decisions/selection",
		"DELETE /api/v1/projects/:id/decisions/selection",
		"GET /api/v1/projects/:id/git/*gitPath",
		"POST /api/v1/projects/:id/git/*gitPath",
		"GET /api/v1/admin/projects",
		"GET /api/v1/admin/debug/jobs",
		"GET /api/hub/packages",
		"GET /api/hub/packages/:id/download",
	}

	for _, route := range expected {
		if !routes[route] {
			t.Fatalf("expected route %q to be registered", route)
		}
	}
}

func TestBackendDependenciesEndpointReturnsEffectiveProviders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-dependencies.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		DependencyProfile:       "local",
		DBDriver:                "sqlite",
		StorageBackend:          "filesystem",
		WorkspaceStorageBackend: "git-http-backend",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
	}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "deps-user", Status: "active", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/dependencies", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	var body config.DependencyProviders
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Profile != "local" || body.Database != "sqlite" || body.ObjectStorage != "filesystem" || body.WorkspaceStorage != "http" || body.AIGateway != "local" || body.Cache != "memory" {
		t.Fatalf("dependencies response = %+v, want local sqlite/filesystem/http/local/memory", body)
	}
}

func TestRegisterPreflightAllowsLocalViteOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/register", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %q", w.Code, http.StatusNoContent, w.Body.String())
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:5173")
	}
}
