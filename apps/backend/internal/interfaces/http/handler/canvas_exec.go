package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
)

// DiagnoseNodeModel explains how a canvas node resolves its AI model route.
func (h *CanvasHandler) DiagnoseNodeModel(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	cv, err := h.CanvasExecService.GetOwnedCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c))
	if err != nil {
		writeCanvasAccessError(c, err, "canvas not found")
		return
	}
	diag, err := h.CanvasExecService.DiagnoseNodeModel(c.Request.Context(), cv.ID, c.Param("nodeId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	c.JSON(http.StatusOK, diag)
}

func optionalUintQuery(c *gin.Context, key string) (uint, bool, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, false, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, false, fmt.Errorf("%s must be an unsigned integer", key)
	}
	return uint(value), true, nil
}

func writeCanvasAccessError(c *gin.Context, err error, notFoundMessage string) {
	if errors.Is(err, canvasservice.ErrCanvasForbidden) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.JSON(http.StatusNotFound, gin.H{"error": notFoundMessage})
}
