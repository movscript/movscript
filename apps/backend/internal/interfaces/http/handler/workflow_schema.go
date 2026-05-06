package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	workflowschemaapp "github.com/movscript/movscript/internal/app/workflowschema"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

type WorkflowSchemaHandler struct {
	service *workflowschemaapp.Service
}

func NewWorkflowSchemaHandler(db *gorm.DB) *WorkflowSchemaHandler {
	return &WorkflowSchemaHandler{service: workflowschemaapp.NewService(db)}
}

func (h *WorkflowSchemaHandler) ListEntitySchemas(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.ListEntitySchemas())
}

func (h *WorkflowSchemaHandler) GetEntitySchema(c *gin.Context) {
	schema, ok := h.service.EntitySchemaForKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "entity schema not found"})
		return
	}
	c.JSON(http.StatusOK, schema)
}

func (h *WorkflowSchemaHandler) ListEntitySemanticSchemas(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.ListEntitySemanticSchemas())
}

func (h *WorkflowSchemaHandler) GetEntitySemanticSchema(c *gin.Context) {
	schema, ok := h.service.EntitySemanticSchemaForKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "entity semantic schema not found"})
		return
	}
	c.JSON(http.StatusOK, schema)
}

func (h *WorkflowSchemaHandler) GetEntitySchemaMigrationReport(c *gin.Context) {
	report, err := h.service.EntitySchemaMigrationReportForKind(c.Param("kind"))
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
	fieldIDs := parseCSVQuery(c.Query("fields"))
	values, err := h.service.ReadEntitySemanticValues(c.Request.Context(), c.Param("kind"), uint(id64), fieldIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, values)
}

func parseCSVQuery(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}
