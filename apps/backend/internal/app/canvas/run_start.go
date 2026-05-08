package canvas

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func (h *Service) StartNode(ctx context.Context, userID uint, cv canvasruntime.Canvas, node canvasruntime.CanvasNode, inputValues map[string]canvasPortValue) (canvasruntime.CanvasTask, error) {
	task, err := h.startNodeModel(ctx, &persistencemodel.User{Model: gorm.Model{ID: userID}}, cv.ToModel(), node.ToModel(), inputValues)
	return canvasruntime.CanvasTaskFromModel(task), err
}

func (h *Service) startNodeModel(ctx context.Context, user *persistencemodel.User, cv persistencemodel.Canvas, node persistencemodel.CanvasNode, inputValues map[string]canvasPortValue) (persistencemodel.CanvasTask, error) {
	inputs, err := h.collectSingleNodeInputsModel(ctx, user, cv, node.NodeID, inputValues)
	if err != nil {
		return persistencemodel.CanvasTask{}, err
	}
	task := canvasruntime.NewCanvasTask(node, nil, canvasruntime.MarshalPortInputs(inputs)).ToModel()
	if err := h.createTaskRow(ctx, &task); err != nil {
		return persistencemodel.CanvasTask{}, err
	}
	go h.executeSingleWorkflowNodeModel(user, cv, &node, &task, inputs)
	return task, nil
}

func (h *Service) StartCanvasRun(userID uint, cv canvasruntime.Canvas, inputValues map[string]canvasPortValue) (canvasruntime.CanvasRun, []canvasruntime.CanvasTask, error) {
	run, tasks, err := h.startCanvasRunModel(&persistencemodel.User{Model: gorm.Model{ID: userID}}, cv.ToModel(), inputValues)
	return canvasruntime.CanvasRunFromModel(run), canvasruntime.CanvasTasksFromModels(tasks), err
}

func (h *Service) startCanvasRunModel(user *persistencemodel.User, cv persistencemodel.Canvas, inputValues map[string]canvasPortValue) (persistencemodel.CanvasRun, []persistencemodel.CanvasTask, error) {
	plan, err := canvasruntime.BuildExecutionPlan(cv)
	if err != nil {
		return persistencemodel.CanvasRun{}, nil, err
	}
	if err := canvasruntime.ValidateRequiredInputs(cv, inputValues); err != nil {
		return persistencemodel.CanvasRun{}, nil, err
	}
	now := time.Now()
	run := canvasruntime.NewCanvasRun(cv, inputValues, now).ToModel()
	if err := h.createCanvasRunWithRelations(&run); err != nil {
		return persistencemodel.CanvasRun{}, nil, err
	}

	tasks := make([]persistencemodel.CanvasTask, 0, len(plan.Tasks))
	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := canvasruntime.NewTask(*node, &run.ID, "").ToModel()
		if err := h.createTaskRow(context.Background(), &task); err != nil {
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
		go h.executeWorkflowRunModel(user, cv.ID, run.ID, plan.Order)
	}
	run.Tasks = tasks
	return run, tasks, nil
}
