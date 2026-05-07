//go:build !enterprise

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

	// feature model config
	admin.GET("/feature-defs", h.feature.ListDefs)
	admin.GET("/features", h.feature.List)
	admin.PUT("/features/:key", h.feature.Update)
	admin.PUT("/features/:key/prompt", h.feature.UpdatePrompt)

	// user management
	admin.GET("/audit-logs", h.audit.List)
	admin.GET("/projects", h.projects.AdminList)
	admin.PUT("/projects/:id/owner", h.projects.AdminForceSetOwner)

	// resource storage management
	admin.GET("/resource-storage/backends", h.resourceAdmin.StorageBackends)
	admin.GET("/resource-storage/stats", h.resourceAdmin.StorageStats)

	// cloud file storage configs
	admin.GET("/cloud-file-configs", h.cloudFileConfig.List)
	admin.POST("/cloud-file-configs", h.cloudFileConfig.Create)
	admin.PUT("/cloud-file-configs/:id", h.cloudFileConfig.Update)
	admin.DELETE("/cloud-file-configs/:id", h.cloudFileConfig.Delete)

	// debug
	admin.POST("/debug/raw-call", h.debug.RawCall)
	admin.POST("/debug/provider-call", h.debug.ProviderCall)
	admin.GET("/debug/jobs", h.debug.ListJobs)
	admin.GET("/debug/jobs/:id", h.debug.GetJob)
	admin.GET("/debug/metrics", observability.MetricsSnapshotHandler(observability.DefaultHTTPMetrics()))
}
