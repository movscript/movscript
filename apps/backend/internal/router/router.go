package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/observability"
)

func New(deps Dependencies) *gin.Engine {
	db := deps.DB
	tokens := deps.Tokens
	h := newHandlers(deps)

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(observability.RequestID())
	r.Use(observability.RequestLogger())
	r.Use(middleware.CORS())
	r.Use(middleware.Identity(db, tokens))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// MCP endpoint removed — tools are now provided by the client.

	registerOpenAIGatewayRoutes(r, h)

	v1 := r.Group("/api/v1")
	{
		registerPublicAPIRoutes(v1, h)

		protected := v1.Group("", middleware.RequireAuth())
		{
			registerGatewayProtectedRoutes(protected, h)
			registerOrgRoutes(protected, db, h)
			registerResourceRoutes(protected, h)
			registerJobRoutes(protected, h)
			registerPluginRoutes(protected, h)
			registerRegistryRoutes(v1, h)
			registerWorkflowRoutes(protected, h)
			registerCanvasRoutes(protected, h)
			registerProjectRoutes(protected, h)

			registerSemanticEntityRoutes(protected, h)

			// admin routes — super_admin only
			admin := protected.Group("/admin", middleware.RequireSystemRole("super_admin"))
			registerAdminRoutes(admin, h)
		}
	}

	return r
}
