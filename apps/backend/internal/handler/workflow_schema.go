package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/workflow"
)

type WorkflowSchemaHandler struct{}

func NewWorkflowSchemaHandler() *WorkflowSchemaHandler {
	return &WorkflowSchemaHandler{}
}

func (h *WorkflowSchemaHandler) ListEntitySchemas(c *gin.Context) {
	c.JSON(http.StatusOK, workflow.EntitySchemas())
}

func (h *WorkflowSchemaHandler) GetEntitySchema(c *gin.Context) {
	schema, ok := workflow.EntitySchemaForKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "entity schema not found"})
		return
	}
	c.JSON(http.StatusOK, schema)
}
