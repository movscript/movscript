package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
)

// RunNode executes one canvas node by resolving its input ports from upstream outputs.
func (h *CanvasHandler) RunNode(c *gin.Context) {
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

	node, err := h.CanvasExecService.GetNode(c.Request.Context(), cv.ID, c.Param("nodeId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var req struct {
		InputValues map[string]canvasPortValue `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	task, err := h.CanvasExecService.StartNode(context.Background(), user, cv, node, req.InputValues)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, task)
}

// RunCanvas starts one canvas run and executes runnable nodes in topological order.
func (h *CanvasHandler) RunCanvas(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	cv, err := h.CanvasExecService.GetOwnedCanvas(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c))
	if err != nil {
		writeCanvasAccessError(c, err, "not found")
		return
	}
	var req struct {
		InputValues map[string]canvasPortValue `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	run, tasks, err := h.CanvasExecService.StartCanvasRun(user, cv, req.InputValues)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"run": run, "tasks": tasks})
}

// ListRuns returns workflow runs for a canvas, newest first.
func (h *CanvasHandler) ListRuns(c *gin.Context) {
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

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	result, err := h.CanvasExecService.ListRuns(c.Request.Context(), cv.ID, c.Query("status"), pageMode, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pageMode {
		c.JSON(http.StatusOK, gin.H{"total": result.Total, "items": result.Items, "page": page, "page_size": pageSize})
		return
	}
	c.JSON(http.StatusOK, result.Items)
}

// GetRun returns one workflow run and its tasks.
func (h *CanvasHandler) GetRun(c *gin.Context) {
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
	run, err := h.CanvasExecService.GetRun(c.Request.Context(), cv.ID, c.Param("runId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	for i := range run.Tasks {
		if run.Tasks[i].Resource != nil {
			run.Tasks[i].Resource.URL = resourceURL(c, run.Tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, run)
}

// ListRunTasks returns tasks belonging to one workflow run.
func (h *CanvasHandler) ListRunTasks(c *gin.Context) {
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
	tasks, err := h.CanvasExecService.ListRunTasks(c.Request.Context(), cv.ID, c.Param("runId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	for i := range tasks {
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
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

// GetNodeTask returns the latest CanvasTask for a given node.
func (h *CanvasHandler) GetNodeTask(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	task, _, err := h.CanvasExecService.LatestNodeTask(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c), c.Param("nodeId"))
	if err != nil {
		if errors.Is(err, canvasservice.ErrCanvasForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "no task"})
		return
	}
	if task.Resource != nil {
		task.Resource.URL = resourceURL(c, task.Resource.ID)
	}
	c.JSON(http.StatusOK, task)
}

// ListNodeTasks returns all CanvasTasks for a given node, newest first.
func (h *CanvasHandler) ListNodeTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	tasks, _, err := h.CanvasExecService.ListNodeTasks(c.Request.Context(), c.Param("id"), user.ID, currentOrgID(c), c.Param("nodeId"))
	if err != nil {
		if errors.Is(err, canvasservice.ErrCanvasForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	for i := range tasks {
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}
