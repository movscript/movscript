//go:build enterprise

package router

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/config"
)

func TestNewEnterpriseRoutesExposeCommercialAdminEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, route := range []string{
		"GET /api/v1/admin/users",
		"PUT /api/v1/admin/users/:id/quota",
		"GET /api/v1/admin/usage-logs",
		"GET /api/v1/admin/orgs/:id/quota",
		"PUT /api/v1/admin/orgs/:id/quota",
	} {
		if !routes[route] {
			t.Fatalf("enterprise router should register %q", route)
		}
	}
}
