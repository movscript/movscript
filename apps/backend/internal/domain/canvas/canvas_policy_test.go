package canvas

import "testing"

func TestNormalizeCreateInputDefaultsAndValidates(t *testing.T) {
	input := CanvasCreateInput{Description: " desc "}
	if err := NormalizeCreateInput(&input); err != nil {
		t.Fatal(err)
	}
	if input.CanvasType != "inspiration" || input.Description != "desc" {
		t.Fatalf("input = %+v", input)
	}
	input = CanvasCreateInput{CanvasType: "unknown"}
	if err := NormalizeCreateInput(&input); err != ErrInvalidCanvasType {
		t.Fatalf("error = %v, want ErrInvalidCanvasType", err)
	}
}

func TestWorkflowBootstrapGraph(t *testing.T) {
	nodes, edge := WorkflowBootstrapGraph(7)
	if len(nodes) != 2 || nodes[0].CanvasID != 7 || nodes[1].NodeID != "final-output" {
		t.Fatalf("nodes = %+v", nodes)
	}
	if edge.CanvasID != 7 || edge.EdgeID != "input-output" {
		t.Fatalf("edge = %+v", edge)
	}
}

func TestNewCanvasAppliesDefaultsAndMaps(t *testing.T) {
	canvas := NewCanvas(CanvasCreateInput{OwnerID: 1, Name: "Board", CanvasType: "workflow"})
	if canvas.OwnerID != 1 || canvas.Name != "Board" || canvas.Visibility != "private" {
		t.Fatalf("unexpected canvas: %+v", canvas)
	}
	modelCanvas := canvas.ToModel()
	modelCanvas.ID = 27
	roundTrip := CanvasFromModel(modelCanvas)
	if roundTrip.ID != 27 || roundTrip.Name != "Board" || roundTrip.Visibility != "private" {
		t.Fatalf("unexpected canvas round-trip: %+v", roundTrip)
	}
}
