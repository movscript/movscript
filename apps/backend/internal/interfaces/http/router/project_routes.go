package router

import (
	"github.com/gin-gonic/gin"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

func registerProjectRoutes(protected *gin.RouterGroup, db *gorm.DB, h handlers) {
	projectReaders := []string{domainproject.RoleOwner, domainproject.RoleDirector, "writer", "generator", domainproject.RoleViewer, domainproject.RoleSuperAdmin}
	projectWriters := []string{domainproject.RoleOwner, domainproject.RoleDirector, "writer", "generator", domainproject.RoleSuperAdmin}

	protected.GET("/projects", h.projects.List)
	protected.POST("/projects", h.projects.Create)

	projectRoutes := protected.Group("/projects/:id", middleware.RequireProjectInCurrentOrg(db))
	{
		projectRoutes.GET("", h.projects.Get)
		projectRoutes.PUT("", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleDirector, domainproject.RoleSuperAdmin), h.projects.Update)
		projectRoutes.DELETE("", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.Delete)
		projectRoutes.GET("/progress", h.projects.Progress)
		projectRoutes.GET("/artifact-refs", h.artifactRefs.ListByProject)
		projectRoutes.GET("/resource-bindings", h.resourceBindings.ListByProject)
		projectRoutes.POST("/resource-bindings", h.resourceBindings.CreateByProject)
		projectRoutes.GET("/entities/:ownerType/:ownerId/resources", h.resourceBindings.ListByEntity)
		projectRoutes.GET("/members", h.projects.ListMembers)
		projectRoutes.POST("/members", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.AddMember)
		projectRoutes.DELETE("/members/:memberId", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.RemoveMember)

		projectRoutes.GET("/scripts", middleware.RequireProjectRole(db, projectReaders...), h.scripts.List)
		projectRoutes.POST("/scripts", middleware.RequireProjectRole(db, projectWriters...), h.scripts.Create)
		projectRoutes.GET("/scripts/:scriptId", middleware.RequireProjectRole(db, projectReaders...), h.scripts.Get)
		projectRoutes.PUT("/scripts/:scriptId", middleware.RequireProjectRole(db, projectWriters...), h.scripts.Update)
		projectRoutes.DELETE("/scripts/:scriptId", middleware.RequireProjectRole(db, projectWriters...), h.scripts.Delete)
	}
	protected.PATCH("/scripts/:id", middleware.RequireScriptProjectRole(db, projectWriters...), h.scripts.Patch)

}
