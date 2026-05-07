package handler

import (
	"context"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
)

func (h *CanvasHandler) collectSingleNodeInputs(ctx context.Context, userID uint, cv canvasruntime.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	return h.CanvasExecService.CollectSingleNodeInputs(ctx, userID, cv, nodeID, overrides)
}

func (h *CanvasHandler) executeSingleWorkflowNode(userID uint, cv canvasruntime.Canvas, node canvasruntime.CanvasNode, task canvasruntime.CanvasTask, inputs canvasPortInputMap) {
	h.CanvasExecService.ExecuteSingleWorkflowNode(userID, cv, node, task, inputs)
}

func (h *CanvasHandler) executeWorkflowRun(userID uint, canvasID uint, runID uint, order []string) {
	h.CanvasExecService.ExecuteWorkflowRun(userID, canvasID, runID, order)
}

func (h *CanvasHandler) lazyBackfillCanvasTaskOutputs(task canvasruntime.CanvasTask, nodeType string) canvasruntime.CanvasTask {
	return h.CanvasExecService.LazyBackfillCanvasTaskOutputs(task, nodeType)
}

func (h *CanvasHandler) executeCanvasNode(ctx context.Context, userID uint, cv canvasruntime.Canvas, node canvasruntime.CanvasNode, task *canvasruntime.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.ExecuteCanvasNode(ctx, userID, cv, node, task, inputs)
}

func (h *CanvasHandler) canvasReferenceInputValues(ref canvasruntime.Canvas, nd nodeData, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.CanvasReferenceInputValues(ref, nd, inputs)
}
