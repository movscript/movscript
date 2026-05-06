package canvasruntime

import (
	"encoding/json"
	"testing"
)

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

func TestNewAssetSlotTargetNodeBuildsEntityCard(t *testing.T) {
	node := NewAssetSlotTargetNode(AssetSlotTargetNodeInput{
		CanvasID:      7,
		AssetSlotID:   9,
		AssetKind:     "image",
		AssetName:     "Hero frame",
		FallbackLabel: "素材位 #9",
	})
	if node.CanvasID != 7 || node.NodeID != "asset-slot-target" || node.Type != "entity_card" || node.Label != "Hero frame" {
		t.Fatalf("unexpected node: %+v", node)
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(node.Data), &data); err != nil {
		t.Fatal(err)
	}
	if data["entityKind"] != "asset_slot" || data["entityTitle"] != "Hero frame" {
		t.Fatalf("unexpected node data: %+v", data)
	}
}

func TestAssetSlotCanvasPortType(t *testing.T) {
	if got := AssetSlotCanvasPortType(" video "); got != "video" {
		t.Fatalf("port type = %q, want video", got)
	}
	if got := AssetSlotCanvasPortType("archive"); got != "resource" {
		t.Fatalf("port type = %q, want resource", got)
	}
}

func TestNewEntityWriteAuditTrimsStringFields(t *testing.T) {
	audit := NewEntityWriteAudit(EntityWriteAuditSpec{
		CanvasID:           1,
		CanvasRunID:        2,
		CanvasNodeID:       " node-a ",
		PortID:             " output ",
		EntityKind:         " asset_slot ",
		EntityID:           3,
		UserID:             4,
		OldValueJSON:       " {} ",
		NewValueJSON:       " {\"ok\":true} ",
		ResourceBindingIDs: " [9] ",
	})
	if audit.CanvasID != 1 || audit.CanvasRunID != 2 || audit.EntityID != 3 || audit.UserID != 4 {
		t.Fatalf("unexpected audit identity: %+v", audit)
	}
	if audit.CanvasNodeID != "node-a" || audit.PortID != "output" || audit.EntityKind != "asset_slot" {
		t.Fatalf("unexpected trimmed fields: %+v", audit)
	}
	if audit.NewValueJSON != "{\"ok\":true}" || audit.ResourceBindingIDs != "[9]" {
		t.Fatalf("unexpected json fields: %+v", audit)
	}
}
