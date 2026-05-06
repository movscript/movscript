package router

import (
	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

func registerProjectRoutes(protected *gin.RouterGroup, db *gorm.DB, h handlers) {
	protected.GET("/projects", h.projects.List)
	protected.POST("/projects", h.projects.Create)

	projectRoutes := protected.Group("/projects/:id", middleware.RequireProjectInCurrentOrg(db))
	{
		projectRoutes.GET("", h.projects.Get)
		projectRoutes.PUT("", h.projects.Update)
		projectRoutes.DELETE("", h.projects.Delete)
		projectRoutes.GET("/progress", h.projects.Progress)
		projectRoutes.GET("/artifact-refs", h.artifactRefs.ListByProject)
		projectRoutes.GET("/resource-bindings", h.resourceBindings.ListByProject)
		projectRoutes.POST("/resource-bindings", h.resourceBindings.CreateByProject)
		projectRoutes.GET("/entities/:ownerType/:ownerId/resources", h.resourceBindings.ListByEntity)
		projectRoutes.GET("/members", h.projects.ListMembers)
		projectRoutes.POST("/members", h.projects.AddMember)
		projectRoutes.DELETE("/members/:memberId", h.projects.RemoveMember)

		projectRoutes.GET("/settings", h.settings.List)
		projectRoutes.POST("/settings", h.settings.Create)
		projectRoutes.GET("/setting-refs", h.settings.ListRefs)
		projectRoutes.POST("/setting-refs", h.settings.CreateRef)
		projectRoutes.GET("/setting-relationships", h.settings.ListRelationships)
		projectRoutes.POST("/setting-relationships", h.settings.CreateRelationship)

		projectRoutes.GET("/scripts", h.scripts.List)
		projectRoutes.POST("/scripts", h.scripts.Create)
		projectRoutes.GET("/scripts/:scriptId", h.scripts.Get)
		projectRoutes.PUT("/scripts/:scriptId", h.scripts.Update)
		projectRoutes.DELETE("/scripts/:scriptId", h.scripts.Delete)
	}
	protected.PATCH("/scripts/:id", h.scripts.Patch)

	protected.PUT("/settings/:id", h.settings.Update)
	protected.DELETE("/settings/:id", h.settings.Delete)
	protected.PUT("/setting-refs/:id", h.settings.UpdateRef)
	protected.DELETE("/setting-refs/:id", h.settings.DeleteRef)
	protected.PUT("/setting-relationships/:id", h.settings.UpdateRelationship)
	protected.DELETE("/setting-relationships/:id", h.settings.DeleteRelationship)
}
