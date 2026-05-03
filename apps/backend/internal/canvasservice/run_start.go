package canvasservice

import (
	"context"
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/canvasruntime"
	"github.com/movscript/movscript/internal/model"
)

func (h *Service) StartNode(ctx context.Context, user *model.User, cv model.Canvas, node model.CanvasNode, inputValues map[string]canvasPortValue) (model.CanvasTask, error) {
	inputs, err := h.CollectSingleNodeInputs(ctx, user, cv, node.NodeID, inputValues)
	if err != nil {
		return model.CanvasTask{}, err
	}
	task := model.CanvasTask{
		CanvasNodeID: node.ID,
		NodeID:       node.NodeID,
		NodeLabel:    node.Label,
		NodeType:     node.Type,
		Status:       "pending",
		InputValues:  canvasruntime.MarshalPortInputs(inputs),
	}
	if err := h.db.Create(&task).Error; err != nil {
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
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := canvasruntime.BuildRunSnapshot(cv)

	rawInputValues := "{}"
	if inputValues != nil {
		if b, err := json.Marshal(inputValues); err == nil {
			rawInputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:          cv.ID,
		Status:            "running",
		InputValues:       rawInputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
		StartedAt:         &now,
	}
	if err := h.db.Create(&run).Error; err != nil {
		return model.CanvasRun{}, nil, err
	}

	tasks := make([]model.CanvasTask, 0, len(plan.Tasks))
	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := model.CanvasTask{
			CanvasNodeID: node.ID,
			CanvasRunID:  &run.ID,
			NodeID:       node.NodeID,
			NodeLabel:    node.Label,
			NodeType:     node.Type,
			Status:       "pending",
		}
		if err := h.db.Create(&task).Error; err != nil {
			return run, tasks, err
		}
		tasks = append(tasks, task)
	}

	if len(tasks) == 0 {
		finishedAt := time.Now()
		if err := h.db.Model(&run).Updates(map[string]any{"status": "done", "finished_at": &finishedAt}).Error; err != nil {
			return run, tasks, err
		}
		run.Status = "done"
		run.FinishedAt = &finishedAt
	} else {
		go h.ExecuteWorkflowRun(user, cv.ID, run.ID, plan.Order)
	}
	run.Tasks = tasks
	return run, tasks, nil
}
