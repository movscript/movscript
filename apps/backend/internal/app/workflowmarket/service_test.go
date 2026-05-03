package workflowmarket

import (
	"encoding/json"
	"testing"
)

func TestBuiltinWorkflowTemplatesExposeReusablePorts(t *testing.T) {
	tpl, ok := FindTemplate("image-generation")
	if !ok {
		t.Fatal("expected image-generation workflow template")
	}
	if len(tpl.Inputs) != 1 || tpl.Inputs[0].ID != "prompt" || tpl.Inputs[0].Type != "text" {
		t.Fatalf("unexpected template inputs: %#v", tpl.Inputs)
	}
	if len(tpl.Outputs) != 1 || tpl.Outputs[0].ID != "image" || tpl.Outputs[0].Type != "image" {
		t.Fatalf("unexpected template outputs: %#v", tpl.Outputs)
	}

	nodes := TemplateNodesForCanvas(12, tpl.Nodes)
	edges := TemplateEdgesForCanvas(12, tpl.Edges)
	if len(nodes) != 3 || len(edges) != 2 {
		t.Fatalf("expected 3 nodes and 2 edges, got %d nodes and %d edges", len(nodes), len(edges))
	}
	if nodes[1].CanvasID != 12 || nodes[1].Type != "image" {
		t.Fatalf("unexpected generated node: %#v", nodes[1])
	}

	var data nodeData
	if err := json.Unmarshal([]byte(nodes[1].Data), &data); err != nil {
		t.Fatalf("generated node data should be JSON: %v", err)
	}
	if data.Source != "ai" || len(data.InputPorts) != 1 || data.InputPorts[0].ID != "prompt" {
		t.Fatalf("unexpected generated node data: %#v", data)
	}
}

func TestWorkflowMarketItemMatchSearchesTags(t *testing.T) {
	item := MarketItem{Key: "template:image-generation", Name: "Image Generation", Tags: []string{"starter"}}
	if !MarketItemMatches(item, "starter") {
		t.Fatal("expected query to match tags")
	}
	if MarketItemMatches(item, "storyboard") {
		t.Fatal("did not expect unrelated query to match")
	}
}
