package canvas

import (
	"context"
	"encoding/json"
	"time"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) failTask(task *persistencemodel.CanvasTask, node *persistencemodel.CanvasNode, nd nodeData, errMsg string) {
	canvasdomain.FailCanvasTask(task, &nd, errMsg)
	_ = h.saveTaskRow(context.Background(), task)
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) updateNodeData(node *persistencemodel.CanvasNode, nd nodeData) {
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
	_ = h.saveNodeRow(context.Background(), node)
}

func (h *Service) saveNodeRow(ctx context.Context, node *persistencemodel.CanvasNode) error {
	if node == nil {
		return nil
	}
	return h.canvasRepo().SaveNode(ctx, canvasdomain.CanvasNodeFromModel(*node))
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
	if !canvasdomain.ApplyRunTaskStatus(&run, tasks, time.Now()) {
		return
	}
	modelRun := run.ToModel()
	_ = h.saveCanvasRunWithRelations(&modelRun)
}

func CanvasRunTaskFailureSummary(tasks []persistencemodel.CanvasTask) string {
	return canvasdomain.CanvasRunTaskFailureSummary(tasks)
}
