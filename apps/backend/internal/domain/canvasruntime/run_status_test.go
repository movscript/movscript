package canvasruntime

import (
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func TestNewCanvasRunCapturesSnapshotAndStartsRun(t *testing.T) {
	cv := model.Canvas{Model: gorm.Model{ID: 7}, Nodes: []model.CanvasNode{{NodeID: "input"}}, Edges: []model.CanvasEdge{{EdgeID: "edge"}}}
	run := NewCanvasRun(cv, map[string]string{"input": "hello"}, testTime())
	if run.CanvasID != 7 || run.Status != CanvasRunStatusRunning || run.StartedAt == nil {
		t.Fatalf("unexpected run identity/status: %+v", run)
	}
	if run.InputValues != `{"input":"hello"}` || run.GraphSnapshot == "" || run.SnapshotHash == "" || run.SnapshotNodeCount != 1 || run.SnapshotEdgeCount != 1 {
		t.Fatalf("unexpected run snapshot: %+v", run)
	}
}

func TestNewCanvasTaskUsesPendingStatusAndNodeSnapshot(t *testing.T) {
	runID := uint(9)
	node := model.CanvasNode{Model: gorm.Model{ID: 3}, NodeID: "n1", Label: "Render", Type: "image"}
	task := NewCanvasTask(node, &runID, `{"prompt":[]}`)
	if task.CanvasNodeID != 3 || task.CanvasRunID == nil || *task.CanvasRunID != runID {
		t.Fatalf("unexpected task identity: %+v", task)
	}
	if task.NodeID != "n1" || task.NodeLabel != "Render" || task.NodeType != "image" || task.Status != CanvasTaskStatusPending || task.InputValues != `{"prompt":[]}` {
		t.Fatalf("unexpected task snapshot: %+v", task)
	}
}

func TestCanvasRunAndTaskModelMappingRoundTrip(t *testing.T) {
	run := CanvasRun{ID: 7, CanvasID: 3, Status: CanvasRunStatusRunning, InputValues: "{}"}
	modelRun := run.ToModel()
	roundTripRun := CanvasRunFromModel(modelRun)
	if roundTripRun.ID != 7 || roundTripRun.CanvasID != 3 || roundTripRun.Status != CanvasRunStatusRunning {
		t.Fatalf("unexpected run round-trip: %+v", roundTripRun)
	}

	runID := uint(7)
	task := CanvasTask{ID: 8, CanvasNodeID: 9, CanvasRunID: &runID, NodeID: "render", Status: CanvasTaskStatusPending}
	modelTask := task.ToModel()
	roundTripTask := CanvasTaskFromModel(modelTask)
	if roundTripTask.ID != 8 || roundTripTask.CanvasNodeID != 9 || roundTripTask.CanvasRunID == nil || *roundTripTask.CanvasRunID != runID {
		t.Fatalf("unexpected task round-trip: %+v", roundTripTask)
	}
}

func TestCanvasRunTaskFailureSummaryUsesLabelAndError(t *testing.T) {
	tasks := []model.CanvasTask{
		{Status: "done", NodeLabel: "Ignored"},
		{Status: "failed", NodeLabel: "Render", Error: "provider timeout"},
	}

	got := CanvasRunTaskFailureSummary(tasks)
	want := "workflow task failed: Render: provider timeout"
	if got != want {
		t.Fatalf("summary = %q, want %q", got, want)
	}
}

func TestCanvasRunTaskFailureSummaryCapsFailureCount(t *testing.T) {
	tasks := []model.CanvasTask{
		{Status: CanvasTaskStatusFailed, NodeID: "a", Error: "A"},
		{Status: CanvasTaskStatusFailed, NodeID: "b", Error: "B"},
		{Status: CanvasTaskStatusFailed, NodeID: "c", Error: "C"},
		{Status: CanvasTaskStatusFailed, NodeID: "d", Error: "D"},
	}

	got := CanvasRunTaskFailureSummary(tasks)
	if !strings.Contains(got, "1 more failed") {
		t.Fatalf("summary = %q, want remaining failure count", got)
	}
}

func TestApplyCanvasRunTaskStatusKeepsRunActiveWhileTasksPending(t *testing.T) {
	run := model.CanvasRun{}
	ok := ApplyCanvasRunTaskStatus(&run, []model.CanvasTask{
		{Status: CanvasTaskStatusDone},
		{Status: CanvasTaskStatusPending},
	}, testTime())
	if !ok {
		t.Fatalf("ApplyCanvasRunTaskStatus returned false")
	}
	if run.Status != CanvasRunStatusRunning {
		t.Fatalf("run status = %q, want %q", run.Status, CanvasRunStatusRunning)
	}
	if run.FinishedAt != nil {
		t.Fatalf("finished_at = %v, want nil for active run", run.FinishedAt)
	}
}

func TestApplyCanvasRunTaskStatusFailsRunWhenAnyTaskFailedAndNoActiveTasksRemain(t *testing.T) {
	run := model.CanvasRun{}
	ok := ApplyCanvasRunTaskStatus(&run, []model.CanvasTask{
		{Status: CanvasTaskStatusDone},
		{Status: CanvasTaskStatusFailed, NodeLabel: "Render", Error: "provider timeout"},
	}, testTime())
	if !ok {
		t.Fatalf("ApplyCanvasRunTaskStatus returned false")
	}
	if run.Status != CanvasRunStatusFailed {
		t.Fatalf("run status = %q, want %q", run.Status, CanvasRunStatusFailed)
	}
	if run.FinishedAt == nil {
		t.Fatalf("finished_at was not set")
	}
	if !strings.Contains(run.Error, "Render: provider timeout") {
		t.Fatalf("run error = %q, want task failure summary", run.Error)
	}
}

func TestCompleteCanvasTaskUpdatesTaskNodeDataAndPersistencePatch(t *testing.T) {
	task := model.CanvasTask{Model: gorm.Model{ID: 12}}
	nd := NodeData{}
	resourceID := uint(42)

	updates := CompleteCanvasTask(&task, &nd, &resourceID)

	if task.Status != CanvasTaskStatusDone || nd.Status != CanvasTaskStatusDone {
		t.Fatalf("status task=%q node=%q, want done", task.Status, nd.Status)
	}
	if nd.TaskID == nil || *nd.TaskID != task.ID {
		t.Fatalf("node task id = %v, want %d", nd.TaskID, task.ID)
	}
	if got := updates.Status; got != CanvasTaskStatusDone {
		t.Fatalf("updates status = %v, want %q", got, CanvasTaskStatusDone)
	}
	if updates.ResourceID == nil || *updates.ResourceID != resourceID {
		var got any
		if updates.ResourceID != nil {
			got = *updates.ResourceID
		}
		t.Fatalf("updates resource_id = %v, want %d", got, resourceID)
	}
}

func TestAttachCanvasOutputMarksTargetAttached(t *testing.T) {
	output := model.CanvasOutput{}
	AttachCanvasOutput(&output, 20, 77, `{"type":"image"}`)
	if output.CanvasRunID == nil || *output.CanvasRunID != 20 {
		t.Fatalf("canvas run id = %v, want 20", output.CanvasRunID)
	}
	if output.ResourceID == nil || *output.ResourceID != 77 {
		t.Fatalf("resource id = %v, want 77", output.ResourceID)
	}
	if output.ValueJSON != `{"type":"image"}` {
		t.Fatalf("value json = %q", output.ValueJSON)
	}
	if output.Status != CanvasOutputStatusAttached {
		t.Fatalf("status = %q, want %q", output.Status, CanvasOutputStatusAttached)
	}
}

func testTime() time.Time {
	return time.Date(2026, 5, 7, 12, 0, 0, 0, time.UTC)
}
