package canvas

import (
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	task.Status = "failed"
	task.Error = errMsg
	_ = h.db.Save(task).Error
	nd.Status = "failed"
	nd.Error = errMsg
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) updateNodeData(node *model.CanvasNode, nd nodeData) {
	var existing map[string]any
	if err := json.Unmarshal([]byte(node.Data), &existing); err != nil || existing == nil {
		existing = map[string]any{}
	}
	var patch map[string]any
	b, _ := json.Marshal(nd)
	_ = json.Unmarshal(b, &patch)
	for k, v := range patch {
		existing[k] = v
	}
	b, _ = json.Marshal(existing)
	node.Data = string(b)
	_ = h.db.Save(node).Error
}

func (h *Service) updateRunStatus(runID *uint) {
	if runID == nil {
		return
	}
	var run model.CanvasRun
	if err := h.db.First(&run, *runID).Error; err != nil {
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", run.ID).Find(&tasks)
	if len(tasks) == 0 {
		return
	}
	active := false
	failed := false
	for _, task := range tasks {
		switch task.Status {
		case "pending", "running":
			active = true
		case "failed":
			failed = true
		}
	}
	status := "done"
	if active {
		status = "running"
	} else {
		if failed {
			status = "failed"
			run.Error = canvasruntime.CanvasRunTaskFailureSummary(tasks)
		} else {
			run.Error = ""
		}
		t := time.Now()
		run.FinishedAt = &t
	}
	run.Status = status
	_ = h.db.Save(&run).Error
}

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	return canvasruntime.CanvasRunTaskFailureSummary(tasks)
}
