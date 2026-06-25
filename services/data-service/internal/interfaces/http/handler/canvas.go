package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	"gorm.io/gorm"
)

type CanvasHandler struct {
	CanvasService canvasservice.Service
}

func NewCanvasHandler(db *gorm.DB) *CanvasHandler {
	return NewCanvasHandlerWithIdentity(db, nil)
}

func NewCanvasHandlerWithIdentity(db *gorm.DB, identity authidentity.OrgDirectory) *CanvasHandler {
	return &CanvasHandler{
		CanvasService: canvasservice.NewServiceWithIdentity(db, identity),
	}
}

func (h *CanvasHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	canvases, err := h.CanvasService.ListCanvases(c.Request.Context(), canvasservice.CanvasListFilter{
		OwnerID:    user.ID,
		OrgID:      currentOrgID(c),
		Stage:      c.Query("stage"),
		CanvasType: c.Query("type"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, canvases)
}

func (h *CanvasHandler) Create(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		CanvasType  string `json:"canvas_type"`
		Stage       string `json:"stage"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	input := canvasservice.CanvasCreateInput{
		OwnerID:     user.ID,
		OrgID:       currentOrgID(c),
		Name:        req.Name,
		Description: req.Description,
		CanvasType:  req.CanvasType,
		Stage:       req.Stage,
	}
	cv, err := h.CanvasService.CreateCanvas(c.Request.Context(), input)
	if err != nil {
		if errors.Is(err, canvasservice.ErrInvalidCanvasType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "canvas_type must be inspiration or workflow"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cv)
}

func (h *CanvasHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	cv, err := h.CanvasService.GetVisibleCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c))
	if err != nil {
		if errors.Is(err, canvasservice.ErrCanvasForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, cv)
}

func (h *CanvasHandler) Patch(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name        *string  `json:"name"`
		Description *string  `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cv, err := h.CanvasService.PatchCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c), canvasservice.CanvasPatchInput{
		Name:        req.Name,
		Description: req.Description,
		Tags:        req.Tags,
	})
	if err != nil {
		if err.Error() == "name is required" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, cv)
}

func (h *CanvasHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if err := h.CanvasService.DeleteCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

// Save performs a full replace of nodes + edges for a canvas.
func (h *CanvasHandler) Save(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name       string                    `json:"name"`
		CanvasType string                    `json:"canvas_type"`
		Nodes      []canvasdomain.CanvasNode `json:"nodes"`
		Edges      []canvasdomain.CanvasEdge `json:"edges"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cv, err := h.CanvasService.SaveCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c), canvasservice.CanvasSaveInput{
		Name:       req.Name,
		CanvasType: req.CanvasType,
		Nodes:      req.Nodes,
		Edges:      req.Edges,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cv)
}
