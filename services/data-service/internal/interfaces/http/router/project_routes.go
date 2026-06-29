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
	protected.POST("/projects/resolve", h.projects.Resolve)
	protected.POST("/projects/ensure", h.projects.Ensure)
	protected.GET("/project-data/spaces", h.projectData.ListSpaces)
	protected.POST("/project-data/spaces", h.projectData.EnsureSpace)
	protected.GET("/project-data/spaces/:spaceID/decisions", h.projectData.ListSpaceDecisions)
	protected.GET("/project-data/decisions", h.projectData.GetDecision)
	protected.POST("/project-data/decisions/query", h.projectData.QueryDecisions)
	protected.PUT("/project-data/decisions/candidates", h.projectData.ReplaceCandidates)
	protected.POST("/project-data/decisions/candidates", h.projectData.UpsertCandidate)
	protected.PUT("/project-data/decisions/selection", h.projectData.Select)
	protected.DELETE("/project-data/decisions/selection", h.projectData.ClearSelection)

	projectRoutes := protected.Group("/projects/:id", middleware.RequireProjectInCurrentOrg(db))
	{
		projectRoutes.GET("", h.projects.Get)
		projectRoutes.PUT("", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleDirector, domainproject.RoleSuperAdmin), h.projects.Update)
		projectRoutes.DELETE("", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.Delete)
		projectRoutes.GET("/workspace", middleware.RequireProjectRole(db, projectReaders...), h.projects.Workspace)
		projectRoutes.GET("/decisions", middleware.RequireProjectRole(db, projectReaders...), h.decisions.Get)
		projectRoutes.POST("/decisions/query", middleware.RequireProjectRole(db, projectReaders...), h.decisions.Query)
		projectRoutes.PUT("/decisions/candidates", middleware.RequireProjectRole(db, projectWriters...), h.decisions.ReplaceCandidates)
		projectRoutes.POST("/decisions/candidates", middleware.RequireProjectRole(db, projectWriters...), h.decisions.UpsertCandidate)
		projectRoutes.POST("/content-units/:contentUnitId/candidates/preflight", middleware.RequireProjectRole(db, projectWriters...), h.contentCandidates.Preflight)
		projectRoutes.POST("/content-units/:contentUnitId/candidates/generate", middleware.RequireProjectRole(db, projectWriters...), h.contentCandidates.Generate)
		projectRoutes.PUT("/decisions/selection", middleware.RequireProjectRole(db, projectWriters...), h.decisions.Select)
		projectRoutes.DELETE("/decisions/selection", middleware.RequireProjectRole(db, projectWriters...), h.decisions.ClearSelection)
		projectRoutes.Any("/git/*gitPath", middleware.RequireProjectRole(db, projectWriters...), h.projects.GitProxy)
		projectRoutes.GET("/progress", h.projects.Progress)
		projectRoutes.GET("/members", h.projects.ListMembers)
		projectRoutes.POST("/members", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.AddMember)
		projectRoutes.DELETE("/members/:memberId", middleware.RequireProjectRole(db, domainproject.RoleOwner, domainproject.RoleSuperAdmin), h.projects.RemoveMember)
	}
}
