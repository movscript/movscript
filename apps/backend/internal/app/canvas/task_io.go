package canvas

import (
	"context"
	"strings"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func normalizeCanvasTaskForResponse(dbTask *persistencemodel.CanvasTask, nodeType string) {
	if dbTask == nil {
		return
	}
	outputs := canvasdomain.DecodePortOutputs(dbTask.OutputValues)
	if len(outputs) > 0 || dbTask.ResourceID == nil {
		return
	}
	valueType := canvasdomain.DefaultPortValueTypeForNode(canvasdomain.FirstNonEmptyString(dbTask.NodeType, nodeType), nodeData{})
	value := canvasdomain.PortValueFromResource(dbTask.ResourceID, valueType)
	handle := canvasdomain.DefaultSourceHandle(canvasdomain.FirstNonEmptyString(dbTask.NodeType, nodeType))
	outputs = map[string]canvasPortValue{
		handle:   value,
		"result": value,
		"value":  value,
	}
	dbTask.OutputValues = canvasdomain.MarshalPortOutputs(outputs)
}

func NormalizeCanvasTaskForResponse(task canvasdomain.CanvasTask, nodeType string) canvasdomain.CanvasTask {
	row := task.ToModel()
	normalizeCanvasTaskForResponse(&row, nodeType)
	return canvasdomain.CanvasTaskFromModel(row)
}

func (h *Service) LazyBackfillCanvasTaskOutputs(task canvasdomain.CanvasTask, nodeType string) canvasdomain.CanvasTask {
	row := task.ToModel()
	h.lazyBackfillCanvasTaskOutputs(&row, nodeType)
	return canvasdomain.CanvasTaskFromModel(row)
}

func (h *Service) lazyBackfillCanvasTaskOutputs(task *persistencemodel.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasdomain.CanvasTaskPatch{OutputValues: task.OutputValues})
	}
}

func (h *Service) updateTaskInputValues(task *persistencemodel.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := canvasdomain.MarshalPortInputs(inputs); raw != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasdomain.CanvasTaskPatch{InputValues: raw})
		task.InputValues = raw
	}
}

func (h *Service) updateTaskOutputValues(task *persistencemodel.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := canvasdomain.MarshalPortOutputs(outputs); raw != "" {
		_ = h.updateTaskRow(context.Background(), task, canvasdomain.CanvasTaskPatch{OutputValues: raw})
		task.OutputValues = raw
	}
}

func (h *Service) createTaskRow(ctx context.Context, task *persistencemodel.CanvasTask) error {
	created, err := h.canvasRepo().CreateTask(ctx, canvasdomain.CanvasTaskFromModel(*task))
	if err != nil {
		return err
	}
	*task = created.ToModel()
	return nil
}

func (h *Service) updateTaskRow(ctx context.Context, task *persistencemodel.CanvasTask, patch canvasdomain.CanvasTaskPatch) error {
	if task == nil {
		return nil
	}
	return h.canvasRepo().UpdateTask(ctx, canvasdomain.CanvasTaskFromModel(*task), patch)
}

func (h *Service) saveTaskRow(ctx context.Context, task *persistencemodel.CanvasTask) error {
	if task == nil {
		return nil
	}
	return h.canvasRepo().SaveTask(ctx, canvasdomain.CanvasTaskFromModel(*task))
}
