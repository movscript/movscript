package canvasruntime

import "github.com/movscript/movscript/internal/domain/model"

func CanvasRunFromModel(run model.CanvasRun) CanvasRun {
	return CanvasRun{
		ID:                run.ID,
		CanvasID:          run.CanvasID,
		Status:            run.Status,
		InputValues:       run.InputValues,
		OutputValues:      run.OutputValues,
		Error:             run.Error,
		GraphSnapshot:     run.GraphSnapshot,
		SnapshotHash:      run.SnapshotHash,
		SnapshotNodeCount: run.SnapshotNodeCount,
		SnapshotEdgeCount: run.SnapshotEdgeCount,
		StartedAt:         run.StartedAt,
		FinishedAt:        run.FinishedAt,
	}
}

func (run CanvasRun) ToModel() model.CanvasRun {
	var target model.CanvasRun
	run.ApplyToModel(&target)
	return target
}

func (run CanvasRun) ApplyToModel(target *model.CanvasRun) {
	target.Model.ID = run.ID
	target.CanvasID = run.CanvasID
	target.Status = run.Status
	target.InputValues = run.InputValues
	target.OutputValues = run.OutputValues
	target.Error = run.Error
	target.GraphSnapshot = run.GraphSnapshot
	target.SnapshotHash = run.SnapshotHash
	target.SnapshotNodeCount = run.SnapshotNodeCount
	target.SnapshotEdgeCount = run.SnapshotEdgeCount
	target.StartedAt = run.StartedAt
	target.FinishedAt = run.FinishedAt
}

func CanvasTaskFromModel(task model.CanvasTask) CanvasTask {
	return CanvasTask{
		ID:             task.ID,
		CanvasNodeID:   task.CanvasNodeID,
		CanvasRunID:    task.CanvasRunID,
		NodeID:         task.NodeID,
		NodeLabel:      task.NodeLabel,
		NodeType:       task.NodeType,
		Status:         task.Status,
		ProviderTaskID: task.ProviderTaskID,
		Error:          task.Error,
		InputValues:    task.InputValues,
		OutputValues:   task.OutputValues,
		ResourceID:     task.ResourceID,
	}
}

func (task CanvasTask) ToModel() model.CanvasTask {
	var target model.CanvasTask
	task.ApplyToModel(&target)
	return target
}

func (task CanvasTask) ApplyToModel(target *model.CanvasTask) {
	target.Model.ID = task.ID
	target.CanvasNodeID = task.CanvasNodeID
	target.CanvasRunID = task.CanvasRunID
	target.NodeID = task.NodeID
	target.NodeLabel = task.NodeLabel
	target.NodeType = task.NodeType
	target.Status = task.Status
	target.ProviderTaskID = task.ProviderTaskID
	target.Error = task.Error
	target.InputValues = task.InputValues
	target.OutputValues = task.OutputValues
	target.ResourceID = task.ResourceID
}
