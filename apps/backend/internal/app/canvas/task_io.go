package canvas

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func normalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	if dbTask == nil {
		return
	}
	outputs := canvasruntime.DecodePortOutputs(dbTask.OutputValues)
	if len(outputs) > 0 || dbTask.ResourceID == nil {
		return
	}
	valueType := canvasruntime.DefaultPortValueTypeForNode(canvasruntime.FirstNonEmptyString(dbTask.NodeType, nodeType), nodeData{})
	value := canvasruntime.PortValueFromResource(dbTask.ResourceID, valueType)
	handle := canvasruntime.DefaultSourceHandle(canvasruntime.FirstNonEmptyString(dbTask.NodeType, nodeType))
	outputs = map[string]canvasPortValue{
		handle:   value,
		"result": value,
		"value":  value,
	}
	dbTask.OutputValues = canvasruntime.MarshalPortOutputs(outputs)
}

func NormalizeCanvasTaskForResponse(task canvasruntime.CanvasTask, nodeType string) canvasruntime.CanvasTask {
	row := task.ToModel()
	normalizeCanvasTaskForResponse(&row, nodeType)
	return canvasruntime.CanvasTaskFromModel(row)
}

func (h *Service) LazyBackfillCanvasTaskOutputs(task canvasruntime.CanvasTask, nodeType string) canvasruntime.CanvasTask {
	row := task.ToModel()
	h.lazyBackfillCanvasTaskOutputs(&row, nodeType)
	return canvasruntime.CanvasTaskFromModel(row)
}

func (h *Service) lazyBackfillCanvasTaskOutputs(task *model.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		_ = h.canvasRepo().UpdateTask(context.Background(), task, map[string]any{"output_values": task.OutputValues})
	}
}

func (h *Service) updateTaskInputValues(task *model.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortInputs(inputs); raw != "" {
		_ = h.canvasRepo().UpdateTask(context.Background(), task, map[string]any{"input_values": raw})
		task.InputValues = raw
	}
}

func (h *Service) updateTaskOutputValues(task *model.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortOutputs(outputs); raw != "" {
		_ = h.canvasRepo().UpdateTask(context.Background(), task, map[string]any{"output_values": raw})
		task.OutputValues = raw
	}
}
