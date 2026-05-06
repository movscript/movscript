package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	projectapp "github.com/movscript/movscript/internal/app/project"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

type SemanticEntityHandler struct {
	semantic *semanticapp.Service
	projects *projectapp.Service
}

func NewSemanticEntityHandler(db *gorm.DB) *SemanticEntityHandler {
	return &SemanticEntityHandler{semantic: semanticapp.NewService(db), projects: projectapp.NewService(db)}
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
