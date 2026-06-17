package router

import "github.com/gin-gonic/gin"

func registerAdminRoutes(admin *gin.RouterGroup, h handlers) {
	// Provider, catalog, and route configuration.
	admin.GET("/adapters", h.ai.ListAdapters)
	admin.GET("/model-catalog", h.ai.ListModelCatalogEntries)
	admin.POST("/model-catalog", h.ai.CreateModelCatalogEntry)
	admin.PUT("/model-catalog/:id", h.ai.UpdateModelCatalogEntry)
	admin.DELETE("/model-catalog/:id", h.ai.DeleteModelCatalogEntry)
	admin.POST("/model-catalog/:id/route-bindings", h.ai.CreateModelRouteBinding)
	admin.PUT("/model-catalog/:id/route-bindings/:bindingId", h.ai.UpdateModelRouteBinding)
	admin.DELETE("/model-catalog/:id/route-bindings/:bindingId", h.ai.DeleteModelRouteBinding)

	if !editionUsesModelCatalogOnly() {
		registerAIProviderAdminRoutes(admin, h)
	}

	// user management
	admin.GET("/overview", h.adminOverview.Summary)
	admin.GET("/settings/auth", h.adminSettings.GetAuthSettings)
	admin.PUT("/settings/auth", h.adminSettings.UpdateAuthSettings)
	admin.GET("/settings/generation-tools", h.adminSettings.GetGenerationToolsSettings)
	admin.PUT("/settings/generation-tools", h.adminSettings.UpdateGenerationToolsSettings)
	admin.GET("/users", h.userAdmin.List)
	registerEditionAdminUserRoutes(admin, h)
	admin.POST("/users", h.userAdmin.Create)
	admin.GET("/users/:id/detail", h.userAdmin.Detail)
	admin.PUT("/users/:id/password", h.userAdmin.ResetPassword)
	admin.DELETE("/users/:id/sessions", h.userAdmin.RevokeAllSessions)
	admin.DELETE("/users/:id/sessions/:sessionId", h.userAdmin.RevokeSession)
	admin.PATCH("/users/:id", h.userAdmin.Update)
	registerEditionAdminRoutes(admin, h)
	admin.GET("/orgs", adminOrgListHandler(h))
	admin.POST("/orgs", h.orgAdmin.Create)
	admin.GET("/orgs/:id/detail", h.orgAdmin.Detail)
	admin.GET("/orgs/:id/members", h.orgAdmin.ListMembers)
	admin.POST("/orgs/:id/members", h.orgAdmin.AddMember)
	admin.PATCH("/orgs/:id/members/:userId", h.orgAdmin.UpdateMember)
	admin.DELETE("/orgs/:id/members/:userId", h.orgAdmin.RemoveMember)
	admin.GET("/orgs/:id/invitations", h.orgAdmin.ListInvitations)
	admin.POST("/orgs/:id/invitations", h.orgAdmin.CreateInvitation)
	admin.DELETE("/orgs/:id/invitations/:invitationId", h.orgAdmin.RevokeInvitation)
	admin.POST("/orgs/:id/join-code/rotate", h.orgAdmin.RotateJoinCode)
	admin.PATCH("/orgs/:id", h.orgAdmin.Update)
	admin.GET("/audit-logs/summary", h.audit.Summary)
	admin.GET("/audit-logs/export", h.audit.Export)
	admin.GET("/audit-logs", h.audit.List)
	admin.GET("/usage-logs/summary", adminUsageSummaryHandler(h))
	admin.GET("/usage-logs/export", adminUsageExportHandler(h))
	admin.GET("/usage-logs", adminUsageListHandler(h))
	admin.GET("/projects", h.projects.AdminList)
	admin.POST("/projects", h.projects.AdminCreate)
	admin.GET("/projects/:id/detail", h.projects.AdminDetail)
	admin.GET("/projects/:id/members", h.projects.AdminListMembers)
	admin.POST("/projects/:id/members", h.projects.AdminAddMember)
	admin.PATCH("/projects/:id/members/:memberId", h.projects.AdminUpdateMember)
	admin.DELETE("/projects/:id/members/:memberId", h.projects.AdminRemoveMember)
	admin.PATCH("/projects/:id", h.projects.AdminUpdate)
	admin.PUT("/projects/:id/owner", h.projects.AdminForceSetOwner)
	admin.DELETE("/projects/:id", h.projects.AdminDelete)

	// resource storage management
	admin.GET("/resource-storage/backends", h.resourceAdmin.StorageBackends)
	admin.GET("/resource-storage/stats", h.resourceAdmin.StorageStats)
	admin.GET("/resource-storage/resources", h.resourceAdmin.ListResources)
	admin.GET("/resource-storage/resources/:id/file", h.resourceAdmin.ServeFile)
	admin.DELETE("/resource-storage/resources/:id", h.resourceAdmin.DeleteResource)
	admin.POST("/resource-storage/blobs/gc", h.resourceAdmin.CollectUnusedBlobs)
	admin.POST("/resource-storage/media-streams/gc", h.mediaStreams.CleanupExpired)

	// shot vector library management
	admin.GET("/shot-vectors/stats", h.shotReferences.AdminVectorStats)
	admin.GET("/shot-vectors/search", h.shotReferences.AdminVectorSearch)
	admin.GET("/shot-vectors/metrics", h.shotReferences.AdminVectorMetrics)
	admin.POST("/shot-vectors/reindex", h.shotReferences.AdminVectorReindex)

	// cloud file storage configs
	admin.GET("/cloud-file-configs", h.cloudFileConfig.List)
	admin.POST("/cloud-file-configs", h.cloudFileConfig.Create)
	admin.PUT("/cloud-file-configs/:id", h.cloudFileConfig.Update)
	admin.POST("/cloud-file-configs/:id/test", h.cloudFileConfig.Test)
	admin.DELETE("/cloud-file-configs/:id", h.cloudFileConfig.Delete)

	registerAdminDebugRoutes(admin, h)
}

func registerAIProviderAdminRoutes(admin *gin.RouterGroup, h handlers) {
	admin.GET("/provider-instances", h.ai.ListProviderInstances)
	admin.GET("/provider-instances/:id/config", h.ai.GetProviderInstanceConfig)
	admin.PUT("/provider-instances/:id/config", h.ai.UpdateProviderInstanceConfig)
	admin.POST("/provider-instances/:id/config/apply", h.ai.ApplyProviderInstanceConfig)
	admin.POST("/provider-instances/:id/config/activate", h.ai.ActivateProviderInstanceConfig)
	admin.POST("/provider-instances/:id/test", h.ai.TestProviderInstance)
	admin.GET("/credentials", h.ai.ListCredentials)
	admin.POST("/credentials", h.ai.CreateCredential)
	admin.PUT("/credentials/:id", h.ai.UpdateCredential)
	admin.DELETE("/credentials/:id", h.ai.DeleteCredential)
	admin.POST("/credentials/:id/test", h.ai.TestCredential)
	admin.GET("/credentials/:id/remote-models", h.ai.ListRemoteModels)

}
