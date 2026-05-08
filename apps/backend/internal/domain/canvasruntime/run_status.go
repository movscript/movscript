package canvasruntime

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
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
	ID                uint         `json:"ID"`
	CanvasID          uint         `json:"canvas_id"`
	Status            string       `json:"status"`
	InputValues       string       `json:"input_values,omitempty"`
	OutputValues      string       `json:"output_values,omitempty"`
	Error             string       `json:"error,omitempty"`
	GraphSnapshot     string       `json:"graph_snapshot,omitempty"`
	SnapshotHash      string       `json:"snapshot_hash,omitempty"`
	SnapshotNodeCount int          `json:"snapshot_node_count"`
	SnapshotEdgeCount int          `json:"snapshot_edge_count"`
	StartedAt         *time.Time   `json:"started_at,omitempty"`
	FinishedAt        *time.Time   `json:"finished_at,omitempty"`
	Tasks             []CanvasTask `json:"tasks,omitempty"`
	CreatedAt         time.Time    `json:"CreatedAt"`
	UpdatedAt         time.Time    `json:"UpdatedAt"`
	DeletedAt         *time.Time   `json:"DeletedAt"`
}

type CanvasTask struct {
	ID             uint                        `json:"ID"`
	CanvasNodeID   uint                        `json:"canvas_node_id"`
	CanvasRunID    *uint                       `json:"canvas_run_id,omitempty"`
	NodeID         string                      `json:"node_id,omitempty"`
	NodeLabel      string                      `json:"node_label,omitempty"`
	NodeType       string                      `json:"node_type,omitempty"`
	Status         string                      `json:"status"`
	ProviderTaskID string                      `json:"provider_task_id,omitempty"`
	Error          string                      `json:"error,omitempty"`
	InputValues    string                      `json:"input_values,omitempty"`
	OutputValues   string                      `json:"output_values,omitempty"`
	ResourceID     *uint                       `json:"resource_id,omitempty"`
	Resource       *domainresource.RawResource `json:"resource,omitempty"`
	CreatedAt      time.Time                   `json:"CreatedAt"`
	UpdatedAt      time.Time                   `json:"UpdatedAt"`
	DeletedAt      *time.Time                  `json:"DeletedAt"`
}

type CanvasTaskPatch struct {
	Status       string
	ResourceID   *uint
	InputValues  string
	OutputValues string
}

type CanvasOutput struct {
	ID          uint
	CanvasID    uint
	CanvasRunID *uint
	ResourceID  *uint
	ValueJSON   string
	Status      string
}

func NewRun(cv CanvasGraph, inputValues any, startedAt time.Time) CanvasRun {
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := BuildRunSnapshot(cv)
	rawInputValues := "{}"
	if inputValues != nil {
		if b, err := json.Marshal(inputValues); err == nil {
			rawInputValues = string(b)
		}
	}
	run := CanvasRun{
		CanvasID:          cv.Canvas.ID,
		InputValues:       rawInputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
	}
	StartRun(&run, startedAt)
	return run
}

func NewTask(node CanvasNode, runID *uint, inputValues string) CanvasTask {
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

func StartRun(run *CanvasRun, startedAt time.Time) {
	run.Status = CanvasRunStatusRunning
	run.StartedAt = &startedAt
}

func CompleteRun(run *CanvasRun, finishedAt time.Time) {
	run.Status = CanvasRunStatusDone
	run.Error = ""
	run.FinishedAt = &finishedAt
}

func FailRun(run *CanvasRun, errMsg string, finishedAt time.Time) {
	run.Status = CanvasRunStatusFailed
	run.Error = errMsg
	run.FinishedAt = &finishedAt
}

func ApplyRunTaskStatus(run *CanvasRun, tasks []CanvasTask, finishedAt time.Time) bool {
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
		FailRun(run, TaskFailureSummary(tasks), finishedAt)
		return true
	}
	CompleteRun(run, finishedAt)
	return true
}

func StartTask(task *CanvasTask, nd *NodeData) CanvasTaskPatch {
	task.Status = CanvasTaskStatusRunning
	if nd != nil {
		nd.Status = CanvasTaskStatusRunning
	}
	return CanvasTaskPatch{Status: CanvasTaskStatusRunning}
}

func CompleteTask(task *CanvasTask, nd *NodeData, resourceID *uint) CanvasTaskPatch {
	task.Status = CanvasTaskStatusDone
	task.ResourceID = resourceID
	if nd != nil {
		nd.Status = CanvasTaskStatusDone
		nd.ResourceID = resourceID
		nd.TaskID = &task.ID
	}
	return CanvasTaskPatch{Status: CanvasTaskStatusDone, ResourceID: resourceID}
}

func FailTask(task *CanvasTask, nd *NodeData, errMsg string) {
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

func AttachOutput(output *CanvasOutput, runID uint, resourceID uint, valueJSON string) {
	output.CanvasRunID = &runID
	output.ResourceID = &resourceID
	output.ValueJSON = valueJSON
	output.Status = CanvasOutputStatusAttached
}

func TaskFailureSummary(tasks []CanvasTask) string {
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
