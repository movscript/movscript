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

// ListEntityWriteAudits returns entity write audit records visible to the current canvas owner.
func (h *CanvasHandler) ListEntityWriteAudits(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	filter := canvasservice.EntityWriteAuditFilter{OwnerID: user.ID}

	if value, ok, err := optionalUintQuery(c, "canvas_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		filter.CanvasID = value
	}
	if value, ok, err := optionalUintQuery(c, "run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		filter.CanvasRunID = value
	}
	if value, ok, err := optionalUintQuery(c, "canvas_run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		filter.CanvasRunID = value
	}
	filter.EntityKind = strings.TrimSpace(c.Query("entity_kind"))
	if value, ok, err := optionalUintQuery(c, "entity_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		filter.EntityID = value
	}
	if value, ok, err := optionalUintQuery(c, "user_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		filter.UserID = value
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}
	filter.Page = page
	filter.PageSize = pageSize
	result, err := h.CanvasExecService.ListEntityWriteAudits(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": result.Total, "items": result.Items, "page": result.Page, "page_size": result.PageSize})
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
