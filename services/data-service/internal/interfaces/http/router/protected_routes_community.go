package router

import (
	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

func registerGatewayProtectedRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/entitlement", h.entitlement.GetCurrent)
	protected.GET("/generation-tools/settings", h.adminSettings.GetRuntimeGenerationToolsSettings)
	protected.POST("/generation-tools/call", h.adminSettings.ProxyGenerationToolCall)
	protected.GET("/model-gateway/models", h.modelGateway.ListModels)
	gatewayAdmin := protected.Group("/model-gateway", middleware.RequireSystemRole("super_admin"))
	{
		gatewayAdmin.GET("/api-keys", h.modelGateway.ListAPIKeys)
		gatewayAdmin.POST("/api-keys", h.modelGateway.CreateAPIKey)
		gatewayAdmin.PATCH("/api-keys/:id", h.modelGateway.UpdateAPIKey)
		gatewayAdmin.DELETE("/api-keys/:id", h.modelGateway.DeleteAPIKey)
	}

	protected.GET("/users", h.users.List)
}

func registerOrgRoutes(protected *gin.RouterGroup, identity authidentity.Reader, h handlers) {
	protected.GET("/orgs", h.org.List)
	protected.POST("/orgs", h.org.Create)
	protected.POST("/orgs/join", h.org.JoinByCode)
	orgRoutes := protected.Group("/orgs/:orgId", middleware.InjectOrgMember(identity))
	{
		orgRoutes.GET("", h.org.Get)
		orgRoutes.PUT("", h.org.Update)
		orgRoutes.GET("/members", h.org.ListMembers)
		orgRoutes.POST("/members", h.org.AddMember)
		orgRoutes.PATCH("/members/:userId", h.org.UpdateMember)
		orgRoutes.DELETE("/members/:userId", h.org.RemoveMember)
		orgRoutes.GET("/invitations", h.org.ListInvitations)
		orgRoutes.POST("/invitations", h.org.CreateInvitation)
		orgRoutes.DELETE("/invitations/:invId", h.org.RevokeInvitation)
		orgRoutes.GET("/groups", h.org.ListGroups)
		orgRoutes.POST("/groups", h.org.CreateGroup)
		orgRoutes.POST("/groups/:groupId/members", h.org.AddGroupMember)
		orgRoutes.DELETE("/groups/:groupId/members/:userId", h.org.RemoveGroupMember)
		orgRoutes.GET("/usage", h.org.GetUsage)
		orgRoutes.GET("/generation-tools/settings", h.adminSettings.GetOrgGenerationToolsSettings)
		orgRoutes.PUT("/generation-tools/settings", middleware.RequireOrgRole(domainorg.RoleOwner, domainorg.RoleAdmin), h.adminSettings.UpdateOrgGenerationToolsSettings)
	}
}

func registerResourceRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/resources", h.resources.List)
	protected.POST("/resources/upload", h.resources.Upload)
	protected.GET("/resources/:id", h.resources.Get)
	protected.GET("/resources/:id/usages", h.resources.Usages)
	protected.GET("/resources/:id/file", h.resources.ServeFile)
	protected.POST("/resource-access/resolve", h.resourceAccess.Resolve)
	protected.POST("/resource-access/check", h.resourceAccess.Check)
	protected.POST("/resources/:id/adopt-to-team", h.resources.AdoptToTeam)
	protected.PUT("/resources/:id", h.resources.Update)
	protected.POST("/resources/:id/verify-image", h.resources.VerifyImage)
	protected.DELETE("/resources/:id", h.resources.Delete)
	protected.GET("/provider-assets/providers/:provider_ref/groups", h.providerAssets.ListProviderAssetGroups)
	protected.POST("/provider-assets/providers/:provider_ref/groups/sync", h.providerAssets.SyncProviderAssetGroups)
	protected.GET("/provider-assets/providers/:provider_ref/groups/:group_ref/assets", h.providerAssets.ListProviderAssets)
	protected.POST("/provider-assets/providers/:provider_ref/groups/:group_ref/assets/sync", h.providerAssets.SyncProviderAssets)
	protected.POST("/provider-assets/providers/:provider_ref/certify", h.providerAssets.CertifyProviderAsset)
	protected.POST("/provider-assets/seedance2/certify", h.providerAssets.CertifySeedance2)

	protected.POST("/media/streams/uploads", h.mediaStreams.Upload)
	protected.GET("/media/streams/:id", h.mediaStreams.Get)
	protected.GET("/media/streams/:id/manifest.m3u8", h.mediaStreams.ServeManifest)
	protected.GET("/media/streams/:id/presigned.m3u8", h.mediaStreams.ServePresignedManifest)
	protected.GET("/media/streams/:id/segments/:name", h.mediaStreams.ServeSegment)

	protected.GET("/external-resource-sources", h.externalResources.ListSources)
	protected.POST("/external-resource-sources", h.externalResources.CreateSource)
	protected.PATCH("/external-resource-sources/:id", h.externalResources.UpdateSource)
	protected.GET("/external-resources/search", h.externalResources.Search)

	protected.GET("/shot-references", h.shotReferences.List)
	protected.POST("/shot-reference-groups", h.shotReferences.CreateGroup)
	protected.GET("/shot-reference-groups/:id", h.shotReferences.GetGroup)
	protected.POST("/shot-references/upload", h.shotReferences.UploadAnalyze)
	protected.POST("/shot-references/from-resource", h.shotReferences.CreateFromResource)
	protected.PATCH("/shot-references/:id", h.shotReferences.Patch)
	protected.DELETE("/shot-references/:id", h.shotReferences.Delete)

	protected.GET("/resource-folders", h.resourceFolders.List)
	protected.POST("/resource-folders", h.resourceFolders.Create)
	protected.PUT("/resource-folders/:id", h.resourceFolders.Update)
	protected.DELETE("/resource-folders/:id", h.resourceFolders.Delete)
}

func registerAudioRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/audio/models", h.audio.ListModels)
	protected.POST("/audio/text-to-speech", h.audio.Synthesize)
	protected.POST("/audio/transcribe", h.audio.Transcribe)
	protected.POST("/audio/align", h.audio.Align)
}

func registerJobRoutes(protected *gin.RouterGroup, h handlers) {
	protected.POST("/jobs", h.jobs.Create)
	protected.POST("/jobs/preflight", h.jobs.Preflight)
	protected.GET("/jobs", h.jobs.List)
	protected.GET("/jobs/:id", h.jobs.Get)
	protected.POST("/jobs/:id/cancel", h.jobs.Cancel)
	protected.POST("/jobs/:id/retry", h.jobs.Retry)
	protected.DELETE("/jobs/:id", h.jobs.Delete)
}

func registerPluginRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/plugins", h.plugin.List)
	protected.POST("/plugins", h.plugin.Import)
	protected.POST("/plugins/:id/enable", h.plugin.Enable)
	protected.POST("/plugins/:id/disable", h.plugin.Disable)
	protected.DELETE("/plugins/:id", h.plugin.Delete)
	protected.GET("/plugins/tools", h.plugin.ToolCatalog)
	protected.GET("/plugins/cards", h.plugin.CardCatalog)
	protected.GET("/plugins/canvas-nodes", h.plugin.CanvasNodeCatalog)
	protected.GET("/plugins/workflows", h.plugin.WorkflowCatalog)
}

func registerRegistryRoutes(v1 *gin.RouterGroup, h handlers) {
	v1.GET("/registry/plugins", h.registry.ListPlugins)
	v1.GET("/registry/plugins/:id", h.registry.GetPlugin)
	v1.GET("/registry/workflows", h.registry.ListWorkflows)
	v1.GET("/registry/workflows/:id", h.registry.GetWorkflow)
	registerEditionRegistryRoutes(v1, h)
}

func registerCanvasRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/canvases", h.canvases.List)
	protected.POST("/canvases", h.canvases.Create)
	protected.GET("/canvases/:id", h.canvases.Get)
	protected.PATCH("/canvases/:id", h.canvases.Patch)
	protected.PUT("/canvases/:id", h.canvases.Save)
	protected.DELETE("/canvases/:id", h.canvases.Delete)
}
