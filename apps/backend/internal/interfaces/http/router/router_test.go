package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/config"
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
		"GET /api/v1/resources",
		"POST /api/v1/resources/upload",
		"GET /api/v1/jobs",
		"GET /api/v1/canvases",
		"GET /api/v1/projects",
		"GET /api/v1/projects/:id/scripts",
		"GET /api/v1/projects/:id/entities/:ownerType/:ownerId/resources",
		"GET /api/v1/projects/:id/entities/segments",
		"GET /api/v1/projects/:id/entities/storyboard-scripts",
		"GET /api/v1/projects/:id/entities/asset-slots",
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
