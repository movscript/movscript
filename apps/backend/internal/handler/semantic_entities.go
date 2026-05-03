package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"gorm.io/gorm"
)

type SemanticEntityHandler struct {
	db       *gorm.DB
	semantic *semanticapp.Service
}

func NewSemanticEntityHandler(db *gorm.DB) *SemanticEntityHandler {
	return &SemanticEntityHandler{db: db, semantic: semanticapp.NewService(db)}
}

func (h *SemanticEntityHandler) ListEntityRelations(c *gin.Context) {
	items, err := h.semantic.ListRelations(c.Request.Context(), semanticapp.RelationFilter{
		ProjectID:  parseID(c.Param("id")),
		Category:   c.Query("category"),
		Type:       c.Query("type"),
		SourceType: c.Query("source_type"),
		SourceID:   parseID(c.Query("source_id")),
		TargetType: c.Query("target_type"),
		TargetID:   parseID(c.Query("target_id")),
		Status:     c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}
