package canvas

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func normalizeCanvasTaskForResponse(dbTask *persistencemodel.CanvasTask, nodeType string) {
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

func (h *Service) lazyBackfillCanvasTaskOutputs(task *persistencemodel.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasruntime.CanvasTaskPatch{OutputValues: task.OutputValues})
	}
}

func (h *Service) updateTaskInputValues(task *persistencemodel.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortInputs(inputs); raw != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasruntime.CanvasTaskPatch{InputValues: raw})
		task.InputValues = raw
	}
}

func (h *Service) updateTaskOutputValues(task *persistencemodel.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortOutputs(outputs); raw != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasruntime.CanvasTaskPatch{OutputValues: raw})
		task.OutputValues = raw
	}
}

func (h *Service) createTaskRow(ctx context.Context, task *persistencemodel.CanvasTask) error {
	created, err := h.canvasRepo().CreateTask(ctx, canvasruntime.CanvasTaskFromModel(*task))
	if err != nil {
		return err
	}
	*task = created.ToModel()
	return nil
}

func (h *Service) updateTaskRow(ctx context.Context, task *persistencemodel.CanvasTask, patch canvasruntime.CanvasTaskPatch) error {
	if task == nil {
		return nil
	}
	return h.canvasRepo().UpdateTask(ctx, canvasruntime.CanvasTaskFromModel(*task), patch)
}

func (h *Service) saveTaskRow(ctx context.Context, task *persistencemodel.CanvasTask) error {
	if task == nil {
		return nil
	}
	return h.canvasRepo().SaveTask(ctx, canvasruntime.CanvasTaskFromModel(*task))
}
