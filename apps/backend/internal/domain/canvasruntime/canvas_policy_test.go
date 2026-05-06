package canvasruntime

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
