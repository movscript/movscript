package router

import "github.com/gin-gonic/gin"

func registerAgentTelemetryRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/agent/telemetry", h.agentTelemetry.Snapshot)
	protected.POST("/agent/telemetry", h.agentTelemetry.Record)
}
