package canvas

import (
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

func NormalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	normalizeCanvasTaskForResponse(dbTask, nodeType)
}

func (h *Service) LazyBackfillCanvasTaskOutputs(task *model.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		h.db.Model(task).Update("output_values", task.OutputValues)
	}
}

func (h *Service) updateTaskInputValues(task *model.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortInputs(inputs); raw != "" {
		h.db.Model(task).Update("input_values", raw)
		task.InputValues = raw
	}
}

func (h *Service) updateTaskOutputValues(task *model.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortOutputs(outputs); raw != "" {
		h.db.Model(task).Update("output_values", raw)
		task.OutputValues = raw
	}
}
