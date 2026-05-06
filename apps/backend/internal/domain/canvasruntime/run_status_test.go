package canvasruntime

import (
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

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
		{Status: "failed", NodeID: "a", Error: "A"},
		{Status: "failed", NodeID: "b", Error: "B"},
		{Status: "failed", NodeID: "c", Error: "C"},
		{Status: "failed", NodeID: "d", Error: "D"},
	}

	got := CanvasRunTaskFailureSummary(tasks)
	if !strings.Contains(got, "1 more failed") {
		t.Fatalf("summary = %q, want remaining failure count", got)
	}
}
