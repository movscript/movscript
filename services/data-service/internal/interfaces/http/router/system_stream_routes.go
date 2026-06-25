package router

import "github.com/gin-gonic/gin"

func registerSystemStreamRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/system/messages/ws", h.ws.SystemMessages)
}
