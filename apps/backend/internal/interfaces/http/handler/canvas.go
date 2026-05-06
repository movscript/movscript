package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type CanvasHandler struct {
	CanvasExecService canvasservice.Service
}

func NewCanvasHandler(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, store storage.Storage) *CanvasHandler {
	return &CanvasHandler{
		CanvasExecService: canvasservice.NewService(db, registry, svc, nil, store),
	}
}

func (h *CanvasHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	canvases, err := h.CanvasExecService.ListCanvases(c.Request.Context(), canvasservice.CanvasListFilter{
		OwnerID:    user.ID,
		ProjectID:  c.Query("project_id"),
		Stage:      c.Query("stage"),
		RefType:    strings.TrimSpace(c.Query("ref_type")),
		RefID:      strings.TrimSpace(c.Query("ref_id")),
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
		ProjectID   *uint  `json:"project_id"`
		CanvasType  string `json:"canvas_type"`
		Stage       string `json:"stage"`
		RefType     string `json:"ref_type"`
		RefID       *uint  `json:"ref_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	input := canvasservice.CanvasCreateInput{
		OwnerID:     user.ID,
		Name:        req.Name,
		Description: req.Description,
		ProjectID:   req.ProjectID,
		CanvasType:  req.CanvasType,
		Stage:       req.Stage,
		RefType:     req.RefType,
		RefID:       req.RefID,
	}
	existing, ok, err := h.CanvasExecService.FindExistingSingleCanvas(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if ok {
		c.JSON(http.StatusOK, existing)
		return
	}
	cv, err := h.CanvasExecService.CreateCanvas(c.Request.Context(), input)
	if err != nil {
		if errors.Is(err, canvasservice.ErrInvalidCanvasType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "canvas_type must be inspiration or workflow"})
			return
		}
		if errors.Is(err, canvasservice.ErrRefIDRequired) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ref_id is required when ref_type is set"})
			return
		}
		if errors.Is(err, canvasservice.ErrUnsupportedRefType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported ref_type"})
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
	cv, err := h.CanvasExecService.GetVisibleCanvas(c.Request.Context(), c.Param("id"), user.ID)
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
	cv, err := h.CanvasExecService.PatchCanvas(c.Request.Context(), c.Param("id"), user.ID, canvasservice.CanvasPatchInput{
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
	if err := h.CanvasExecService.DeleteCanvas(c.Request.Context(), c.Param("id"), user.ID); err != nil {
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
		Name       string             `json:"name"`
		CanvasType string             `json:"canvas_type"`
		Nodes      []model.CanvasNode `json:"nodes"`
		Edges      []model.CanvasEdge `json:"edges"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cv, err := h.CanvasExecService.SaveCanvas(c.Request.Context(), c.Param("id"), user.ID, canvasservice.CanvasSaveInput{
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
