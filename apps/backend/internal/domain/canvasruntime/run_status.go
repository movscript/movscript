package canvasruntime

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
)

const (
	CanvasRunStatusPending = "pending"
	CanvasRunStatusRunning = "running"
	CanvasRunStatusDone    = "done"
	CanvasRunStatusFailed  = "failed"

	CanvasTaskStatusPending = "pending"
	CanvasTaskStatusRunning = "running"
	CanvasTaskStatusDone    = "done"
	CanvasTaskStatusFailed  = "failed"

	CanvasOutputStatusPending  = "pending"
	CanvasOutputStatusAttached = "attached"
	CanvasOutputStatusApplied  = "applied"
	CanvasOutputStatusRejected = "rejected"
)

type CanvasRun struct {
	ID                uint
	CanvasID          uint
	Status            string
	InputValues       string
	OutputValues      string
	Error             string
	GraphSnapshot     string
	SnapshotHash      string
	SnapshotNodeCount int
	SnapshotEdgeCount int
	StartedAt         *time.Time
	FinishedAt        *time.Time
}

type CanvasTask struct {
	ID             uint
	CanvasNodeID   uint
	CanvasRunID    *uint
	NodeID         string
	NodeLabel      string
	NodeType       string
	Status         string
	ProviderTaskID string
	Error          string
	InputValues    string
	OutputValues   string
	ResourceID     *uint
}

func NewCanvasRun(cv model.Canvas, inputValues any, startedAt time.Time) CanvasRun {
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := BuildRunSnapshot(cv)
	rawInputValues := "{}"
	if inputValues != nil {
		if b, err := json.Marshal(inputValues); err == nil {
			rawInputValues = string(b)
		}
	}
	run := CanvasRun{
		CanvasID:          cv.ID,
		InputValues:       rawInputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
	}
	StartRun(&run, startedAt)
	return run
}

func NewCanvasTask(node model.CanvasNode, runID *uint, inputValues string) CanvasTask {
	return CanvasTask{
		CanvasNodeID: node.ID,
		CanvasRunID:  runID,
		NodeID:       node.NodeID,
		NodeLabel:    node.Label,
		NodeType:     node.Type,
		Status:       CanvasTaskStatusPending,
		InputValues:  inputValues,
	}
}

func StartCanvasRun(run *model.CanvasRun, startedAt time.Time) {
	domainRun := CanvasRunFromModel(*run)
	StartRun(&domainRun, startedAt)
	domainRun.ApplyToModel(run)
}

func StartRun(run *CanvasRun, startedAt time.Time) {
	run.Status = CanvasRunStatusRunning
	run.StartedAt = &startedAt
}

func CompleteCanvasRun(run *model.CanvasRun, finishedAt time.Time) {
	run.Status = CanvasRunStatusDone
	run.Error = ""
	run.FinishedAt = &finishedAt
}

func FailCanvasRun(run *model.CanvasRun, errMsg string, finishedAt time.Time) {
	run.Status = CanvasRunStatusFailed
	run.Error = errMsg
	run.FinishedAt = &finishedAt
}

func ApplyCanvasRunTaskStatus(run *model.CanvasRun, tasks []model.CanvasTask, finishedAt time.Time) bool {
	if len(tasks) == 0 {
		return false
	}
	active := false
	failed := false
	for _, task := range tasks {
		switch task.Status {
		case CanvasTaskStatusPending, CanvasTaskStatusRunning:
			active = true
		case CanvasTaskStatusFailed:
			failed = true
		}
	}
	if active {
		run.Status = CanvasRunStatusRunning
		return true
	}
	if failed {
		FailCanvasRun(run, CanvasRunTaskFailureSummary(tasks), finishedAt)
		return true
	}
	CompleteCanvasRun(run, finishedAt)
	return true
}

func StartCanvasTask(task *model.CanvasTask, nd *NodeData) map[string]any {
	task.Status = CanvasTaskStatusRunning
	if nd != nil {
		nd.Status = CanvasTaskStatusRunning
	}
	return map[string]any{"status": CanvasTaskStatusRunning}
}

func CompleteCanvasTask(task *model.CanvasTask, nd *NodeData, resourceID *uint) map[string]any {
	task.Status = CanvasTaskStatusDone
	task.ResourceID = resourceID
	if nd != nil {
		nd.Status = CanvasTaskStatusDone
		nd.ResourceID = resourceID
		nd.TaskID = &task.ID
	}
	updates := map[string]any{"status": CanvasTaskStatusDone}
	if resourceID != nil {
		updates["resource_id"] = *resourceID
	}
	return updates
}

func FailCanvasTask(task *model.CanvasTask, nd *NodeData, errMsg string) {
	task.Status = CanvasTaskStatusFailed
	task.Error = errMsg
	if nd != nil {
		nd.Status = CanvasTaskStatusFailed
		nd.Error = errMsg
	}
}

func AttachableCanvasOutputStatuses() []string {
	return []string{CanvasOutputStatusPending, CanvasOutputStatusAttached}
}

func AttachCanvasOutput(output *model.CanvasOutput, runID uint, resourceID uint, valueJSON string) {
	output.CanvasRunID = &runID
	output.ResourceID = &resourceID
	output.ValueJSON = valueJSON
	output.Status = CanvasOutputStatusAttached
}

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	failures := make([]string, 0)
	for _, task := range tasks {
		if task.Status != CanvasTaskStatusFailed {
			continue
		}
		label := strings.TrimSpace(task.NodeLabel)
		if label == "" {
			label = strings.TrimSpace(task.NodeID)
		}
		if label == "" {
			label = fmt.Sprintf("task #%d", task.ID)
		}
		errMsg := strings.TrimSpace(task.Error)
		if errMsg == "" {
			errMsg = "unknown error"
		}
		if len(errMsg) > 240 {
			errMsg = errMsg[:240] + "..."
		}
		failures = append(failures, fmt.Sprintf("%s: %s", label, errMsg))
	}
	if len(failures) == 0 {
		return "one or more workflow tasks failed"
	}
	if len(failures) == 1 {
		return "workflow task failed: " + failures[0]
	}
	if len(failures) > 3 {
		remaining := len(failures) - 3
		failures = append(failures[:3], fmt.Sprintf("%d more failed", remaining))
	}
	return "workflow tasks failed: " + strings.Join(failures, "; ")
}
