//go:build !enterprise

package router

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/config"
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
		"GET /api/v1/admin/users",
	} {
		if routes[route] {
			t.Fatalf("community router should not register %q", route)
		}
	}
}
