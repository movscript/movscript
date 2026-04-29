package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/workflow"
	"gorm.io/gorm"
)

type WorkflowSchemaHandler struct {
	db *gorm.DB
}

func NewWorkflowSchemaHandler(db *gorm.DB) *WorkflowSchemaHandler {
	return &WorkflowSchemaHandler{db: db}
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

func (h *WorkflowSchemaHandler) ListEntitySemanticSchemas(c *gin.Context) {
	c.JSON(http.StatusOK, workflow.EntitySemanticSchemas())
}

func (h *WorkflowSchemaHandler) GetEntitySemanticSchema(c *gin.Context) {
	schema, ok := workflow.EntitySemanticSchemaForKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "entity semantic schema not found"})
		return
	}
	c.JSON(http.StatusOK, schema)
}

func (h *WorkflowSchemaHandler) GetEntitySchemaMigrationReport(c *gin.Context) {
	report, err := workflow.EntitySchemaMigrationReportForKind(c.Param("kind"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *WorkflowSchemaHandler) GetEntitySemanticValues(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("invalid entity id"))
		return
	}
	values, err := workflow.NewEntityIOService(h.db).ReadDetailValues(c.Request.Context(), c.Param("kind"), uint(id64))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, values)
}
