package handler

import (
	"context"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
)

func (h *CanvasHandler) collectSingleNodeInputs(ctx context.Context, userID uint, cv canvasdomain.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	return h.CanvasExecService.CollectSingleNodeInputs(ctx, userID, cv, nodeID, overrides)
}

func (h *CanvasHandler) executeSingleWorkflowNode(userID uint, cv canvasdomain.Canvas, node canvasdomain.CanvasNode, task canvasdomain.CanvasTask, inputs canvasPortInputMap) {
	h.CanvasExecService.ExecuteSingleWorkflowNode(userID, cv, node, task, inputs)
}

func (h *CanvasHandler) executeWorkflowRun(userID uint, canvasID uint, runID uint, order []string) {
	h.CanvasExecService.ExecuteWorkflowRun(userID, canvasID, runID, order)
}

func (h *CanvasHandler) lazyBackfillCanvasTaskOutputs(task canvasdomain.CanvasTask, nodeType string) canvasdomain.CanvasTask {
	return h.CanvasExecService.LazyBackfillCanvasTaskOutputs(task, nodeType)
}

func (h *CanvasHandler) executeCanvasNode(ctx context.Context, userID uint, cv canvasdomain.Canvas, node canvasdomain.CanvasNode, task *canvasdomain.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.ExecuteCanvasNode(ctx, userID, cv, node, task, inputs)
}

func (h *CanvasHandler) canvasReferenceInputValues(ref canvasdomain.Canvas, nd nodeData, inputs canvasPortInputMap) map[string]canvasPortValue {
	return h.CanvasExecService.CanvasReferenceInputValues(ref, nd, inputs)
}
