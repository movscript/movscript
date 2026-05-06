//go:build enterprise

package router

import "github.com/gin-gonic/gin"

func registerWorkflowRoutes(protected *gin.RouterGroup, h handlers) {
	protected.GET("/entities/semantic-schemas", h.workflowSchemas.ListEntitySemanticSchemas)
	protected.GET("/entities/semantic-schemas/:kind", h.workflowSchemas.GetEntitySemanticSchema)
	protected.GET("/entities/semantic-schemas/:kind/migration-report", h.workflowSchemas.GetEntitySchemaMigrationReport)
	protected.GET("/entities/:kind/:id/semantic-values", h.workflowSchemas.GetEntitySemanticValues)
	protected.GET("/workflow/entity-schemas", h.workflowSchemas.ListEntitySchemas)
	protected.GET("/workflow/entity-schemas/:kind", h.workflowSchemas.GetEntitySchema)
	protected.GET("/workflows/templates", h.workflowMarket.ListTemplates)
	protected.POST("/workflows/templates/:key/install", h.workflowMarket.InstallTemplate)
	protected.GET("/workflows/market", h.workflowMarket.ListMarket)
	protected.GET("/workflows/by-key/:key", h.workflowMarket.GetByKey)
	protected.POST("/workflows/:id/publish", h.workflowMarket.Publish)
	protected.POST("/workflows/:id/unpublish", h.workflowMarket.Unpublish)
	protected.POST("/workflows/:id/clone", h.workflowMarket.Clone)
}
