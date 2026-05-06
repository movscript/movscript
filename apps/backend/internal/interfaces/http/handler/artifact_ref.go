package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	artifactref "github.com/movscript/movscript/internal/app/artifactref"
	"gorm.io/gorm"
)

type ArtifactRefHandler struct {
	service *artifactref.Service
}

func NewArtifactRefHandler(db *gorm.DB) *ArtifactRefHandler {
	return &ArtifactRefHandler{service: artifactref.NewService(db)}
}

func (h *ArtifactRefHandler) ListByProject(c *gin.Context) {
	refs, err := h.service.ListByProject(c.Request.Context(), artifactref.ListFilter{
		ProjectID: parseID(c.Param("id")),
		Kind:      c.Query("kind"),
		ResourceURL: func(id uint) string {
			return resourceURL(c, id)
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, refs)
}
