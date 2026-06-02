package router

import "github.com/gin-gonic/gin"

func registerAgentTelemetryRoutes(protected *gin.RouterGroup, h handlers) {
	protected.POST("/agent/telemetry", h.agentTelemetry.Record)
}
