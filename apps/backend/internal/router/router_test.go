package router

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/config"
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
		"POST /api/v1/auth/login",
		"GET /api/v1/models",
		"GET /api/v1/users",
		"GET /api/v1/resources",
		"POST /api/v1/resources/upload",
		"GET /api/v1/jobs",
		"GET /api/v1/canvases",
		"GET /api/v1/projects",
		"GET /api/v1/projects/:id/scripts",
		"GET /api/v1/projects/:id/settings",
		"GET /api/v1/projects/:id/entities/:ownerType/:ownerId/resources",
		"GET /api/v1/projects/:id/entities/segments",
		"GET /api/v1/projects/:id/entities/storyboard-scripts",
		"GET /api/v1/projects/:id/entities/asset-slots",
		"GET /api/v1/admin/projects",
		"GET /api/v1/admin/debug/jobs",
	}

	for _, route := range expected {
		if !routes[route] {
			t.Fatalf("expected route %q to be registered", route)
		}
	}
}
