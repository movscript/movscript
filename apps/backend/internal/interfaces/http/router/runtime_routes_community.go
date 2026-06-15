package router

import "github.com/gin-gonic/gin"

func registerRuntimeProtectedRoutes(protected *gin.RouterGroup, h handlers) {
	runtime := protected.Group("/agent-runtime")
	{
		runtime.GET("/capabilities", h.agentRuntime.Capabilities)
		runtime.POST("/sessions", h.agentRuntime.CreateSession)
		runtime.GET("/sessions/:sessionId/events", h.agentRuntime.SessionEvents)
		runtime.POST("/sessions/:sessionId/messages", h.agentRuntime.SendMessage)
		runtime.GET("/sessions/:sessionId/tools", h.agentRuntime.ListTools)
		runtime.DELETE("/sessions/:sessionId", h.agentRuntime.StopSession)
		runtime.POST("/permissions/:requestId/decision", h.agentRuntime.PermissionDecision)
	}
	registerEditionRuntimeProtectedRoutes(protected, h)
}

func registerRuntimeAdminRoutes(admin *gin.RouterGroup, h handlers) {
	registerEditionRuntimeAdminRoutes(admin, h)
}
