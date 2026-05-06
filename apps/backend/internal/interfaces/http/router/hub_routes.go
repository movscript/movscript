package router

import "github.com/gin-gonic/gin"

func registerHubRoutes(r *gin.Engine, h handlers) {
	hub := r.Group("/api/hub")
	{
		hub.GET("/packages", h.hub.ListPackages)
		hub.POST("/packages", h.hub.CreatePackage)
		hub.GET("/packages/:id/download", h.hub.DownloadPackage)
		hub.GET("/admin/packages", h.hub.ListAdminPackages)
		hub.PATCH("/admin/packages/:id", h.hub.PatchPackage)
		hub.POST("/admin/packages/:id/approve", h.hub.ApprovePackage)
		hub.POST("/admin/packages/:id/reject", h.hub.RejectPackage)
		hub.POST("/admin/packages/:id/take-down", h.hub.TakeDownPackage)
	}
}
