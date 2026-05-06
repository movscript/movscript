//go:build !enterprise

package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	workflowmarket "github.com/movscript/movscript/internal/app/workflowmarket"
	"gorm.io/gorm"
)

type WorkflowMarketHandler struct {
	service *workflowmarket.Service
}

func NewWorkflowMarketHandler(db *gorm.DB) *WorkflowMarketHandler {
	return &WorkflowMarketHandler{service: workflowmarket.NewService(db)}
}

func (h *WorkflowMarketHandler) ListTemplates(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.ListTemplates())
}

func (h *WorkflowMarketHandler) InstallTemplate(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		ProjectID *uint  `json:"project_id"`
		Stage     string `json:"stage"`
	}
	if !bindOptionalWorkflowJSON(c, &req) {
		return
	}
	cv, err := h.service.InstallTemplate(c.Request.Context(), user.ID, c.Param("key"), workflowmarket.InstallInput{
		Name:      req.Name,
		ProjectID: req.ProjectID,
		Stage:     req.Stage,
	})
	if err != nil {
		h.writeWorkflowMarketError(c, err)
		return
	}
	c.JSON(http.StatusCreated, cv)
}

func (h *WorkflowMarketHandler) ListMarket(c *gin.Context) {
	items, err := h.service.ListMarket(c.Request.Context(), c.Query("source"), c.Query("q"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *WorkflowMarketHandler) GetByKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	item, err := h.service.GetByKey(c.Request.Context(), c.Param("key"), user.ID)
	if err != nil {
		h.writeWorkflowMarketError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *WorkflowMarketHandler) writeWorkflowMarketError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, workflowmarket.ErrTemplateNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow template not found"})
	case errors.Is(err, workflowmarket.ErrWorkflowNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
	case errors.Is(err, workflowmarket.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, workflowmarket.ErrInvalidWorkflow):
		c.JSON(http.StatusBadRequest, gin.H{"error": "only workflow canvases can be published"})
	case errors.Is(err, workflowmarket.ErrInvalidWorkflowKey):
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow_key must not contain whitespace or path separators"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func bindOptionalWorkflowJSON(c *gin.Context, out any) bool {
	if c.Request == nil || c.Request.Body == nil || c.Request.ContentLength == 0 {
		return true
	}
	if err := c.ShouldBindJSON(out); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return false
	}
	return true
}
