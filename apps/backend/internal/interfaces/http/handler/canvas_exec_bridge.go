package handler

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (h *CanvasHandler) collectSingleNodeInputs(ctx context.Context, user *model.User, cv model.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	return h.CanvasExecService.CollectSingleNodeInputs(ctx, user, cv, nodeID, overrides)
}

func (h *CanvasHandler) executeSingleWorkflowNode(user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) {
	h.CanvasExecService.ExecuteSingleWorkflowNode(user, cv, node, task, inputs)
}

func (h *CanvasHandler) executeWorkflowRun(user *model.User, canvasID uint, runID uint, order []string) {
	h.CanvasExecService.ExecuteWorkflowRun(user, canvasID, runID, order)
}

func (h *CanvasHandler) lazyBackfillCanvasTaskOutputs(task *model.CanvasTask, nodeType string) {
	h.CanvasExecService.LazyBackfillCanvasTaskOutputs(task, nodeType)
}

func (h *CanvasHandler) executeCanvasNode(ctx context.Context, user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.ExecuteCanvasNode(ctx, user, cv, node, task, inputs)
}

func (h *CanvasHandler) canvasReferenceInputValues(ref model.Canvas, nd nodeData, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.CanvasReferenceInputValues(ref, nd, inputs)
}
