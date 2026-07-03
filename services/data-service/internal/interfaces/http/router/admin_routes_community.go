package router

import "github.com/gin-gonic/gin"

func registerAdminRoutes(admin *gin.RouterGroup, h handlers) {
	// Provider, catalog, and route configuration.
	admin.GET("/adapters", h.ai.ListAdapters)
	admin.GET("/provider-templates", h.ai.ListProviderTemplates)
	admin.GET("/combo-templates", h.ai.ListComboTemplates)
	admin.POST("/combo-templates/:key/enable", h.ai.EnableComboTemplate)
	admin.POST("/model-imports/preview", h.ai.PreviewModelImport)
	admin.POST("/model-imports/apply", h.ai.ApplyModelImport)
	admin.GET("/providers", h.ai.ListProviders)
	admin.POST("/providers", h.ai.CreateProvider)
	admin.GET("/providers/:providerID/asset-library", h.ai.GetProviderAssetLibrarySettings)
	admin.PUT("/providers/:providerID/asset-library", h.ai.UpdateProviderAssetLibrarySettings)
	admin.POST("/providers/:providerID/credentials", h.ai.CreateProviderCredential)
	admin.PATCH("/providers/:providerID/credentials/:credentialKey", h.ai.UpdateProviderCredential)
	admin.POST("/providers/:providerID/credentials/:credentialKey/primary", h.ai.SetProviderCredentialPrimary)
	admin.GET("/model-catalog/templates", h.ai.ListModelCatalogTemplates)
	admin.GET("/model-catalog", h.ai.ListModelCatalogEntries)
	admin.POST("/model-routes/diagnose", h.ai.DiagnoseModelRoute)
	admin.POST("/model-catalog", h.ai.CreateModelCatalogEntry)
	admin.PUT("/model-catalog/:id", h.ai.UpdateModelCatalogEntry)
	admin.DELETE("/model-catalog/:id", h.ai.DeleteModelCatalogEntry)
	admin.POST("/model-catalog/:id/route-bindings", h.ai.CreateModelRouteBinding)
	admin.PUT("/model-catalog/:id/route-bindings/:bindingId", h.ai.UpdateModelRouteBinding)
	admin.DELETE("/model-catalog/:id/route-bindings/:bindingId", h.ai.DeleteModelRouteBinding)

	if !distributionProfileUsesModelCatalogOnly() {
		registerAIProviderAdminRoutes(admin, h)
	}

	admin.GET("/overview", h.adminOverview.Summary)
	admin.GET("/settings/generation-tools", h.adminSettings.GetGenerationToolsSettings)
	admin.PUT("/settings/generation-tools", h.adminSettings.UpdateGenerationToolsSettings)
	admin.GET("/settings/provider-assets", h.adminSettings.GetProviderAssetSettings)
	admin.PUT("/settings/provider-assets", h.adminSettings.UpdateProviderAssetSettings)
	admin.GET("/settings/resource-access", h.adminSettings.GetResourceAccessSettings)
	admin.PUT("/settings/resource-access", h.adminSettings.UpdateResourceAccessSettings)
	admin.GET("/settings/resource-access/profiles", h.adminSettings.ListResourceAccessProfiles)
	admin.PUT("/settings/resource-access/profiles/:profileID", h.adminSettings.UpsertResourceAccessProfile)
	admin.DELETE("/settings/resource-access/profiles/:profileID", h.adminSettings.DeleteResourceAccessProfile)
	admin.POST("/settings/resource-access/profiles/:profileID/test", h.adminSettings.TestResourceAccessProfile)
	admin.POST("/settings/resource-access/routes/diagnose", h.adminSettings.DiagnoseResourceAccessRoute)
	admin.GET("/settings/usage-policy", h.adminSettings.GetUsagePolicySettings)
	admin.GET("/settings/usage-policy/diagnose", h.adminSettings.DiagnoseUsagePolicy)
	admin.PUT("/settings/usage-policy", h.adminSettings.UpdateUsagePolicySettings)
	registerDistributionProfileAdminUserRoutes(admin, h)
	admin.GET("/users/:id/detail", h.userAdmin.Detail)
	registerDistributionProfileAdminRoutes(admin, h)
	admin.GET("/orgs/:id/detail", h.orgAdmin.Detail)
	admin.GET("/orgs/:id/invitations", h.orgAdmin.ListInvitations)
	admin.POST("/orgs/:id/invitations", h.orgAdmin.CreateInvitation)
	admin.DELETE("/orgs/:id/invitations/:invitationId", h.orgAdmin.RevokeInvitation)
	admin.POST("/orgs/:id/join-code/rotate", h.orgAdmin.RotateJoinCode)
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
