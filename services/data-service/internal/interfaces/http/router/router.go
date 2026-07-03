package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	providerassembly "github.com/movscript/movscript/internal/providers/assembly"
	providerdescriptor "github.com/movscript/movscript/internal/providers/descriptor"
)

func New(deps Dependencies) *gin.Engine {
	db := deps.DB
	h := newHandlers(deps)

	r := gin.New()
	r.Use(observability.RequestID())
	r.Use(observability.RequestMetrics(observability.DefaultHTTPMetrics()))
	r.Use(middleware.RequestLogger())
	r.Use(gin.Recovery())
	var corsOrigins []string
	if deps.Config != nil {
		corsOrigins = deps.Config.CORSAllowedOrigins
	}
	r.Use(middleware.CORS(corsOrigins))
	r.Use(middleware.IdentityWithAuthProvider(deps.AuthProvider))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/metrics", observability.MetricsHandler(observability.DefaultHTTPMetrics()))
	// MCP endpoint removed — tools are now provided by the client.

	registerOpenAIGatewayRoutes(r, h)
	registerHubRoutes(r, h)
	registerDistributionProfileRootRoutes(r, h)

	v1 := r.Group("/api/v1")
	{
		registerPublicAPIRoutes(v1, h)
		registerRegistryRoutes(v1, h)

		protected := v1.Group("", middleware.RequireAuth(), middleware.ResolveOrgMember(deps.AuthIdentity))
		{
			if deps.Config != nil {
				protected.GET("/backend/dependencies", func(c *gin.Context) {
					c.JSON(http.StatusOK, deps.Config.EffectiveProviderAssembly())
				})
				protected.GET("/backend/provider-health", func(c *gin.Context) {
					c.JSON(http.StatusOK, gin.H{"items": providerassembly.BuildProviderHealthSnapshot(deps.Config)})
				})
				protected.GET("/backend/provider-instances", func(c *gin.Context) {
					c.JSON(http.StatusOK, gin.H{"items": deps.Config.EffectiveProviderInstances()})
				})
			}
			protected.GET("/backend/provider-descriptors", func(c *gin.Context) {
				c.JSON(http.StatusOK, providerdescriptor.BuiltIns())
			})
			registerGatewayProtectedRoutes(protected, h)
			registerOrgRoutes(protected, deps.AuthIdentity, h)
			registerResourceRoutes(protected, h)
			registerAudioRoutes(protected, h)
			registerJobRoutes(protected, h)
			registerSystemStreamRoutes(protected, h)
			registerPluginRoutes(protected, h)
			registerCanvasRoutes(protected, h)
			registerProjectRoutes(protected, db, h)
			registerRuntimeProtectedRoutes(protected, h)
			registerDistributionProfileProtectedRoutes(protected, h)
			registerAgentTelemetryRoutes(protected, h)

			// admin routes — super_admin only
			admin := protected.Group("/admin", middleware.RequireSystemRole("super_admin"))
			registerAdminRoutes(admin, h)
			registerRuntimeAdminRoutes(admin, h)
		}
	}

	return r
}
