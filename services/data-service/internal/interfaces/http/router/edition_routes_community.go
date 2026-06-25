//go:build !runtime_overlay

package router

import (
	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
)

func registerEditionRootRoutes(_ *gin.Engine, _ handlers) {}

func registerEditionRegistryRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionProtectedRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionRuntimeProtectedRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionRuntimeAdminRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionAdminUserRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionAdminRoutes(_ *gin.RouterGroup, _ handlers) {}

func editionUsesModelCatalogOnly() bool { return false }

func adminUsageListHandler(h handlers) gin.HandlerFunc {
	return h.usageAdmin.List
}

func adminUsageSummaryHandler(h handlers) gin.HandlerFunc {
	return h.usageAdmin.Summary
}

func adminUsageExportHandler(h handlers) gin.HandlerFunc {
	return h.usageAdmin.Export
}

func registerAdminDebugRoutes(admin *gin.RouterGroup, h handlers) {
	admin.POST("/debug/raw-call", h.debug.RawCall)
	admin.POST("/debug/provider-call", h.debug.ProviderCall)
	admin.GET("/debug/llm-calls", h.debug.ListLLMCallLogs)
	admin.GET("/debug/llm-calls/summary", h.debug.LLMCallLogSummary)
	admin.GET("/debug/llm-calls/settings", h.debug.GetLLMCallLogSettings)
	admin.PUT("/debug/llm-calls/settings", h.debug.UpdateLLMCallLogSettings)
	admin.POST("/debug/llm-calls/purge-expired", h.debug.PurgeExpiredLLMCallLogs)
	admin.PATCH("/debug/llm-calls/:id/expiration", h.debug.UpdateLLMCallLogExpiration)
	admin.GET("/debug/jobs", h.debug.ListJobs)
	admin.GET("/debug/job-stats", h.debug.JobStats)
	admin.GET("/debug/health", h.debug.SystemHealth)
	admin.GET("/debug/model-runtime-health", h.debug.ModelRuntimeHealth)
	admin.GET("/debug/health-settings", h.debug.GetHealthSettings)
	admin.PUT("/debug/health-settings", h.debug.UpdateHealthSettings)
	admin.GET("/debug/agent-telemetry", h.agentTelemetry.Snapshot)
	admin.GET("/debug/jobs/:id", h.debug.GetJob)
	admin.POST("/debug/jobs/:id/cancel", h.jobs.AdminCancel)
	admin.POST("/debug/jobs/:id/retry", h.jobs.AdminRetry)
	admin.DELETE("/debug/jobs/:id", h.jobs.AdminDelete)
	admin.GET("/debug/metrics", observability.MetricsSnapshotHandler(observability.DefaultHTTPMetrics()))
}
