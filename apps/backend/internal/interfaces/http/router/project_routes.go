package router

import "github.com/gin-gonic/gin"

func registerProjectRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/projects", h.projects.List)
	protected.POST("/projects", h.projects.Create)
	protected.GET("/projects/:id", h.projects.Get)
	protected.PUT("/projects/:id", h.projects.Update)
	protected.DELETE("/projects/:id", h.projects.Delete)
	protected.GET("/projects/:id/progress", h.projects.Progress)
	protected.GET("/projects/:id/artifact-refs", h.artifactRefs.ListByProject)
	protected.GET("/projects/:id/resource-bindings", h.resourceBindings.ListByProject)
	protected.POST("/projects/:id/resource-bindings", h.resourceBindings.CreateByProject)
	protected.GET("/projects/:id/entities/:ownerType/:ownerId/resources", h.resourceBindings.ListByEntity)
	protected.GET("/projects/:id/members", h.projects.ListMembers)
	protected.POST("/projects/:id/members", h.projects.AddMember)
	protected.DELETE("/projects/:id/members/:memberId", h.projects.RemoveMember)

	protected.GET("/projects/:id/settings", h.settings.List)
	protected.POST("/projects/:id/settings", h.settings.Create)
	protected.GET("/projects/:id/setting-refs", h.settings.ListRefs)
	protected.POST("/projects/:id/setting-refs", h.settings.CreateRef)
	protected.GET("/projects/:id/setting-relationships", h.settings.ListRelationships)
	protected.POST("/projects/:id/setting-relationships", h.settings.CreateRelationship)

	protected.GET("/projects/:id/scripts", h.scripts.List)
	protected.POST("/projects/:id/scripts", h.scripts.Create)
	protected.GET("/projects/:id/scripts/:scriptId", h.scripts.Get)
	protected.PUT("/projects/:id/scripts/:scriptId", h.scripts.Update)
	protected.DELETE("/projects/:id/scripts/:scriptId", h.scripts.Delete)
	protected.PATCH("/scripts/:id", h.scripts.Patch)

	protected.PUT("/settings/:id", h.settings.Update)
	protected.DELETE("/settings/:id", h.settings.Delete)
	protected.PUT("/setting-refs/:id", h.settings.UpdateRef)
	protected.DELETE("/setting-refs/:id", h.settings.DeleteRef)
	protected.PUT("/setting-relationships/:id", h.settings.UpdateRelationship)
	protected.DELETE("/setting-relationships/:id", h.settings.DeleteRelationship)
}
