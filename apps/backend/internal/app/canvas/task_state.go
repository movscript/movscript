package canvas

import (
	"context"
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	canvasruntime.FailCanvasTask(task, &nd, errMsg)
	_ = h.canvasRepo().SaveTask(context.Background(), task)
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
	_ = h.canvasRepo().SaveNode(context.Background(), node)
}

func (h *Service) updateRunStatus(runID *uint) {
	if runID == nil {
		return
	}
	run, err := h.canvasRepo().FindCanvasRun(context.Background(), *runID)
	if err != nil {
		return
	}
	tasks, err := h.canvasRepo().ListCanvasRunTasks(context.Background(), run.ID)
	if err != nil {
		return
	}
	if len(tasks) == 0 {
		return
	}
	if !canvasruntime.ApplyCanvasRunTaskStatus(&run, tasks, time.Now()) {
		return
	}
	_ = h.saveCanvasRunWithRelations(&run)
}

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	return canvasruntime.CanvasRunTaskFailureSummary(tasks)
}
