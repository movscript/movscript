package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

func New(deps Dependencies) *gin.Engine {
	db := deps.DB
	tokens := deps.Tokens
	h := newHandlers(deps)

	r := gin.New()
	r.Use(observability.RequestID())
	r.Use(observability.RequestMetrics(observability.DefaultHTTPMetrics()))
	r.Use(gin.Recovery())
	r.Use(middleware.RequestLogger())
	var corsOrigins []string
	if deps.Config != nil {
		corsOrigins = deps.Config.CORSAllowedOrigins
	}
	r.Use(middleware.CORS(corsOrigins))
	r.Use(middleware.Identity(db, tokens))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/metrics", observability.MetricsHandler(observability.DefaultHTTPMetrics()))
	if deps.Config != nil {
		registerAdminStaticRoutes(r, deps.Config.AdminStaticDir)
	}

	// MCP endpoint removed — tools are now provided by the client.

	registerOpenAIGatewayRoutes(r, h)
	registerHubRoutes(r, h)

	v1 := r.Group("/api/v1")
	{
		registerPublicAPIRoutes(v1, h)

		protected := v1.Group("", middleware.RequireAuth(), middleware.ResolveOrgMember(db))
		{
			registerGatewayProtectedRoutes(protected, h)
			registerOrgRoutes(protected, db, h)
			registerResourceRoutes(protected, h)
			registerJobRoutes(protected, h)
			registerPluginRoutes(protected, h)
			registerRegistryRoutes(v1, h)
			registerWorkflowRoutes(protected, h)
			registerCanvasRoutes(protected, h)
			registerProjectRoutes(protected, db, h)
			registerEditionProtectedRoutes(protected, h)

			registerSemanticEntityRoutes(protected, h)

			// admin routes — super_admin only
			admin := protected.Group("/admin", middleware.RequireSystemRole("super_admin"))
			registerAdminRoutes(admin, h)
			registerEditionAdminRoutes(admin, h)
		}
	}

	return r
}
