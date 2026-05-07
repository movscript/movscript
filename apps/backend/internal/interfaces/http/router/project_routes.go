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

		projectRoutes.GET("/scripts", h.scripts.List)
		projectRoutes.POST("/scripts", h.scripts.Create)
		projectRoutes.GET("/scripts/:scriptId", h.scripts.Get)
		projectRoutes.PUT("/scripts/:scriptId", h.scripts.Update)
		projectRoutes.DELETE("/scripts/:scriptId", h.scripts.Delete)
	}
	protected.PATCH("/scripts/:id", h.scripts.Patch)

}
