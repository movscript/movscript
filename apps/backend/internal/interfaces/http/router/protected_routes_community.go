//go:build !runtime_overlay

package router

import (
	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

func registerGatewayProtectedRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/entitlement", h.entitlement.GetCurrent)
	protected.GET("/model-gateway/models", h.modelGateway.ListModels)
	protected.GET("/model-gateway/api-keys", h.modelGateway.ListAPIKeys)
	protected.POST("/model-gateway/api-keys", h.modelGateway.CreateAPIKey)
	protected.PATCH("/model-gateway/api-keys/:id", h.modelGateway.UpdateAPIKey)
	protected.DELETE("/model-gateway/api-keys/:id", h.modelGateway.DeleteAPIKey)

	protected.GET("/users", h.users.List)
}

func registerOrgRoutes(protected *gin.RouterGroup, db *gorm.DB, h handlers) {
	protected.GET("/orgs", h.org.List)
	protected.POST("/orgs", h.org.Create)
	protected.POST("/orgs/join", h.org.JoinByCode)
	orgRoutes := protected.Group("/orgs/:orgId", middleware.InjectOrgMember(db))
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
	}
}

func registerResourceRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/resources", h.resources.List)
	protected.POST("/resources/upload", h.resources.Upload)
	protected.GET("/resources/:id/file", h.resources.ServeFile)
	protected.PUT("/resources/:id", h.resources.Update)
	protected.POST("/resources/:id/verify-image", h.resources.VerifyImage)
	protected.DELETE("/resources/:id", h.resources.Delete)
	protected.PATCH("/resource-bindings/:id", h.resourceBindings.Patch)
	protected.DELETE("/resource-bindings/:id", h.resourceBindings.Delete)

	protected.GET("/resource-folders", h.resourceFolders.List)
	protected.POST("/resource-folders", h.resourceFolders.Create)
	protected.PUT("/resource-folders/:id", h.resourceFolders.Update)
	protected.DELETE("/resource-folders/:id", h.resourceFolders.Delete)
	protected.GET("/resource-folders/:id/permissions", h.resourceFolders.ListPermissions)
	protected.POST("/resource-folders/:id/permissions", h.resourceFolders.GrantPermission)
	protected.DELETE("/resource-folders/:id/permissions/:userId", h.resourceFolders.RevokePermission)
}

func registerJobRoutes(protected *gin.RouterGroup, h handlers) {
	protected.POST("/jobs", h.jobs.Create)
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
}

func registerCanvasRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/canvases", h.canvases.List)
	protected.GET("/canvas-entity-write-audits", h.canvases.ListEntityWriteAudits)
	protected.POST("/canvases", h.canvases.Create)
	protected.GET("/canvases/:id", h.canvases.Get)
	protected.PATCH("/canvases/:id", h.canvases.Patch)
	protected.PUT("/canvases/:id", h.canvases.Save)
	protected.DELETE("/canvases/:id", h.canvases.Delete)
	protected.POST("/canvases/:id/nodes/:nodeId/run", h.canvases.RunNode)
	protected.GET("/canvases/:id/nodes/:nodeId/task", h.canvases.GetNodeTask)
	protected.GET("/canvases/:id/nodes/:nodeId/tasks", h.canvases.ListNodeTasks)
	protected.POST("/canvases/:id/run", h.canvases.RunCanvas)
	protected.GET("/canvases/:id/runs", h.canvases.ListRuns)
	protected.GET("/canvases/:id/runs/:runId", h.canvases.GetRun)
	protected.GET("/canvases/:id/runs/:runId/tasks", h.canvases.ListRunTasks)
}
