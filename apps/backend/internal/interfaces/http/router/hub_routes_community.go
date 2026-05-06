//go:build !enterprise

package router

import "github.com/gin-gonic/gin"

func registerHubRoutes(r *gin.Engine, h handlers) {
	hub := r.Group("/api/hub")
	{
		hub.GET("/packages", h.hub.ListPackages)
		hub.GET("/packages/:id/download", h.hub.DownloadPackage)
	}
}
