package canvas

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) StartNode(ctx context.Context, user *model.User, cv model.Canvas, node model.CanvasNode, inputValues map[string]canvasPortValue) (model.CanvasTask, error) {
	inputs, err := h.CollectSingleNodeInputs(ctx, user, cv, node.NodeID, inputValues)
	if err != nil {
		return model.CanvasTask{}, err
	}
	task := canvasruntime.NewCanvasTask(node, nil, canvasruntime.MarshalPortInputs(inputs)).ToModel()
	if err := h.canvasRepo().CreateTask(ctx, &task); err != nil {
		return model.CanvasTask{}, err
	}
	go h.ExecuteSingleWorkflowNode(user, cv, &node, &task, inputs)
	return task, nil
}

func (h *Service) StartCanvasRun(user *model.User, cv model.Canvas, inputValues map[string]canvasPortValue) (model.CanvasRun, []model.CanvasTask, error) {
	plan, err := canvasruntime.BuildExecutionPlan(cv)
	if err != nil {
		return model.CanvasRun{}, nil, err
	}
	if err := canvasruntime.ValidateRequiredInputs(cv, inputValues); err != nil {
		return model.CanvasRun{}, nil, err
	}
	now := time.Now()
	run := canvasruntime.NewCanvasRun(cv, inputValues, now).ToModel()
	if err := h.createCanvasRunWithRelations(&run); err != nil {
		return model.CanvasRun{}, nil, err
	}

	tasks := make([]model.CanvasTask, 0, len(plan.Tasks))
	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := canvasruntime.NewCanvasTask(*node, &run.ID, "").ToModel()
		if err := h.canvasRepo().CreateTask(context.Background(), &task); err != nil {
			return run, tasks, err
		}
		tasks = append(tasks, task)
	}

	if len(tasks) == 0 {
		canvasruntime.CompleteCanvasRun(&run, time.Now())
		if err := h.saveCanvasRunWithRelations(&run); err != nil {
			return run, tasks, err
		}
	} else {
		go h.ExecuteWorkflowRun(user, cv.ID, run.ID, plan.Order)
	}
	run.Tasks = tasks
	return run, tasks, nil
}
