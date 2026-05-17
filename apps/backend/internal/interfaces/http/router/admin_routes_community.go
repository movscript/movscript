//go:build !runtime_overlay

package router

import (
	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
)

func registerAdminRoutes(admin *gin.RouterGroup, h handlers) {
	// adapters and model presets (read-only UI templates, not used at runtime)
	admin.GET("/adapters", h.ai.ListAdapters)
	admin.GET("/model-presets", h.ai.ListModelPresets)

	// credentials (one per adapter type)
	admin.GET("/credentials", h.ai.ListCredentials)
	admin.POST("/credentials", h.ai.CreateCredential)
	admin.PUT("/credentials/:id", h.ai.UpdateCredential)
	admin.DELETE("/credentials/:id", h.ai.DeleteCredential)
	admin.POST("/credentials/:id/test", h.ai.TestCredential)
	admin.GET("/credentials/:id/remote-models", h.ai.ListRemoteModels)

	// model configs (admin-declared model activation per credential)
	admin.GET("/credentials/:id/models", h.ai.ListModelConfigs)
	admin.POST("/credentials/:id/models", h.ai.CreateModelConfig)
	admin.PUT("/credentials/:id/models/:modelId", h.ai.UpdateModelConfig)
	admin.DELETE("/credentials/:id/models/:modelId", h.ai.DeleteModelConfig)
	admin.POST("/credentials/:id/models/:modelId/test", h.ai.TestModelConfig)
	admin.POST("/credentials/:id/models/:modelId/debug", h.ai.DebugModelConfig)

	// flat model-config patch (no credential_id in path — used by feature config tab)
	admin.PATCH("/model-configs/:id", h.ai.PatchModelConfig)
	admin.POST("/model-configs/preview-contract", h.ai.PreviewModelConfigContract)

	// feature model config
	admin.GET("/feature-defs", h.feature.ListDefs)
	admin.GET("/features", h.feature.List)
	admin.PUT("/features/:key", h.feature.Update)
	admin.PUT("/features/:key/prompt", h.feature.UpdatePrompt)

	// user management
	admin.GET("/overview", h.adminOverview.Summary)
	admin.GET("/settings/auth", h.adminSettings.GetAuthSettings)
	admin.PUT("/settings/auth", h.adminSettings.UpdateAuthSettings)
	admin.GET("/users", h.userAdmin.List)
	admin.POST("/users", h.userAdmin.Create)
	admin.GET("/users/:id/detail", h.userAdmin.Detail)
	admin.PUT("/users/:id/password", h.userAdmin.ResetPassword)
	admin.DELETE("/users/:id/sessions", h.userAdmin.RevokeAllSessions)
	admin.DELETE("/users/:id/sessions/:sessionId", h.userAdmin.RevokeSession)
	admin.PATCH("/users/:id", h.userAdmin.Update)
	admin.GET("/orgs", h.orgAdmin.List)
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
	admin.GET("/usage-logs/summary", h.usageAdmin.Summary)
	admin.GET("/usage-logs/export", h.usageAdmin.Export)
	admin.GET("/usage-logs", h.usageAdmin.List)
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
	admin.GET("/resource-storage/resources/:id/detail", h.resourceAdmin.ResourceDetail)
	admin.DELETE("/resource-storage/resources/:id", h.resourceAdmin.DeleteResource)

	// cloud file storage configs
	admin.GET("/cloud-file-configs", h.cloudFileConfig.List)
	admin.POST("/cloud-file-configs", h.cloudFileConfig.Create)
	admin.PUT("/cloud-file-configs/:id", h.cloudFileConfig.Update)
	admin.POST("/cloud-file-configs/:id/test", h.cloudFileConfig.Test)
	admin.DELETE("/cloud-file-configs/:id", h.cloudFileConfig.Delete)

	// debug
	admin.POST("/debug/raw-call", h.debug.RawCall)
	admin.POST("/debug/provider-call", h.debug.ProviderCall)
	admin.GET("/debug/jobs", h.debug.ListJobs)
	admin.GET("/debug/job-stats", h.debug.JobStats)
	admin.GET("/debug/health", h.debug.SystemHealth)
	admin.GET("/debug/model-runtime-health", h.debug.ModelRuntimeHealth)
	admin.GET("/debug/health-settings", h.debug.GetHealthSettings)
	admin.PUT("/debug/health-settings", h.debug.UpdateHealthSettings)
	admin.GET("/debug/jobs/:id", h.debug.GetJob)
	admin.POST("/debug/jobs/:id/cancel", h.jobs.AdminCancel)
	admin.POST("/debug/jobs/:id/retry", h.jobs.AdminRetry)
	admin.DELETE("/debug/jobs/:id", h.jobs.AdminDelete)
	admin.GET("/debug/metrics", observability.MetricsSnapshotHandler(observability.DefaultHTTPMetrics()))
}
