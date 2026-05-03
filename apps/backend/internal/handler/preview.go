package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	previewapp "github.com/movscript/movscript/internal/app/preview"
	"gorm.io/gorm"
)

type PreviewHandler struct {
	service *previewapp.Service
}

func NewPreviewHandler(db *gorm.DB) *PreviewHandler {
	return &PreviewHandler{service: previewapp.NewService(db)}
}

type previewGenerateRequest struct {
	Scope    string `json:"scope" binding:"required"` // segment|scene_moment|content_unit
	EntityID uint   `json:"entity_id" binding:"required"`
}

func (h *PreviewHandler) Generate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("invalid project id"))
		return
	}

	var req previewGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	resp, err := h.service.Generate(c.Request.Context(), previewapp.GenerateInput{
		ProjectID: projectID,
		Scope:     req.Scope,
		EntityID:  req.EntityID,
	})
	if err != nil {
		switch {
		case errors.Is(err, previewapp.ErrInvalidScope):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("scope must be segment, scene_moment, or content_unit"))
		case errors.Is(err, previewapp.ErrNotFound):
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		}
		return
	}

	c.JSON(http.StatusOK, resp)
}
