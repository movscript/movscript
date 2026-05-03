package handler

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
)

// RunNode executes one canvas node by resolving its input ports from upstream outputs.
func (h *CanvasHandler) RunNode(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", cv.ID, c.Param("nodeId")).First(&node).Error; err != nil {
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
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var runs []model.CanvasRun
	q := h.db.Model(&model.CanvasRun{}).Where("canvas_id = ?", cv.ID)
	if status := strings.TrimSpace(c.Query("status")); status != "" && status != "all" {
		q = q.Where("status = ?", status)
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

	var total int64
	q.Count(&total)
	q.Omit("graph_snapshot").Order("id desc")
	if pageMode {
		q.Limit(pageSize).Offset((page - 1) * pageSize).Find(&runs)
		c.JSON(http.StatusOK, gin.H{"total": total, "items": runs, "page": page, "page_size": pageSize})
		return
	}
	q.Limit(20).Find(&runs)
	c.JSON(http.StatusOK, runs)
}

// GetRun returns one workflow run and its tasks.
func (h *CanvasHandler) GetRun(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).Preload("Tasks.Resource").First(&run).Error; err != nil {
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
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).First(&run).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks)
	for i := range tasks {
		h.CanvasExecService.LazyBackfillCanvasTaskOutputs(&tasks[i], tasks[i].NodeType)
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

	canvasTable := h.db.NamingStrategy.TableName("Canvas")
	q := h.db.Model(&model.CanvasEntityWriteAudit{}).
		Joins("JOIN "+canvasTable+" ON "+canvasTable+".id = canvas_entity_write_audits.canvas_id").
		Where(canvasTable+".owner_id = ?", user.ID)

	if value, ok, err := optionalUintQuery(c, "canvas_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_run_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "canvas_run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_run_id = ?", value)
	}
	if entityKind := strings.TrimSpace(c.Query("entity_kind")); entityKind != "" {
		q = q.Where("canvas_entity_write_audits.entity_kind = ?", entityKind)
	}
	if value, ok, err := optionalUintQuery(c, "entity_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.entity_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "user_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.user_id = ?", value)
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var audits []model.CanvasEntityWriteAudit
	if err := q.Order("canvas_entity_write_audits.id desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&audits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "items": audits, "page": page, "page_size": pageSize})
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

// GetNodeTask returns the latest CanvasTask for a given node.
func (h *CanvasHandler) GetNodeTask(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var task model.CanvasTask
	if err := h.db.Where("canvas_node_id = ?", node.ID).Order("id desc").First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no task"})
		return
	}
	if task.ResourceID != nil {
		var resource model.RawResource
		if err := h.db.First(&resource, *task.ResourceID).Error; err == nil {
			resource.URL = resourceURL(c, resource.ID)
			task.Resource = &resource
		}
	}
	h.CanvasExecService.LazyBackfillCanvasTaskOutputs(&task, node.Type)
	c.JSON(http.StatusOK, task)
}

// ListNodeTasks returns all CanvasTasks for a given node, newest first.
func (h *CanvasHandler) ListNodeTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks)
	// Populate resource URLs
	for i := range tasks {
		h.CanvasExecService.LazyBackfillCanvasTaskOutputs(&tasks[i], node.Type)
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}
