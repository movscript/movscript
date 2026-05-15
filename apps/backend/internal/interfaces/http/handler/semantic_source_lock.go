package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *SemanticEntityHandler) GetSourceLockStatus(c *gin.Context) {
	status, err := h.semantic.SourceLockStatus(c.Request.Context(), parseID(c.Param("id")), c.Param("kind"), c.Param("entityId"))
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}
