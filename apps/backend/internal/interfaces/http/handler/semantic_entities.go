package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	projectapp "github.com/movscript/movscript/internal/app/project"
	relationapp "github.com/movscript/movscript/internal/app/relation"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type SemanticEntityHandler struct {
	semantic  *semanticapp.Service
	relations *relationapp.Service
	projects  *projectapp.Service
}

func NewSemanticEntityHandler(db *gorm.DB, cacheStore ...cache.Cache) *SemanticEntityHandler {
	return &SemanticEntityHandler{
		semantic:  semanticapp.NewService(db, cacheStore...),
		relations: relationapp.NewService(db),
		projects:  projectapp.NewService(db, cacheStore...),
	}
}

func (h *SemanticEntityHandler) ListEntityRelations(c *gin.Context) {
	items, err := h.relations.ListEdges(c.Request.Context(), relationapp.EdgeFilter{
		ProjectID: parseID(c.Param("id")),
		Category:  c.Query("category"),
		Type:      c.Query("type"),
		Source:    domainrelation.NewEntityRef(c.Query("source_type"), parseID(c.Query("source_id"))),
		Target:    domainrelation.NewEntityRef(c.Query("target_type"), parseID(c.Query("target_id"))),
		Status:    c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}
