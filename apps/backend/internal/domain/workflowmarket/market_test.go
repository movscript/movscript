package workflowmarket

import (
	"encoding/json"
	"testing"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
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

	var data canvasruntime.NodeData
	if err := json.Unmarshal([]byte(nodes[1].Data), &data); err != nil {
		t.Fatalf("generated node data should be JSON: %v", err)
	}
	if data.Source != "ai" || len(data.InputPorts) != 1 || data.InputPorts[0].ID != "prompt" {
		t.Fatalf("unexpected generated node data: %#v", data)
	}
}

func TestTemplateCanvasAppliesWorkflowDefaults(t *testing.T) {
	tpl := TemplateDef{Key: "image-generation", Name: "Image Generation", Description: "desc", Tags: []string{"image"}}
	projectID := uint(9)
	cv := TemplateCanvas(7, tpl, "My Flow", &projectID, "generation")
	if cv.OwnerID != 7 || cv.Name != "My Flow" || cv.Description != "desc" {
		t.Fatalf("unexpected canvas identity: %+v", cv)
	}
	if cv.CanvasType != "workflow" || cv.Visibility != "private" || cv.WorkflowKey != "template:image-generation" {
		t.Fatalf("unexpected workflow defaults: %+v", cv)
	}
	if cv.ProjectID == nil || *cv.ProjectID != projectID || cv.Stage != "generation" || cv.WorkflowTags != `["image"]` {
		t.Fatalf("unexpected canvas project/tags: %+v", cv)
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

func TestCleanTagsTrimsAndDeduplicates(t *testing.T) {
	got := CleanTags([]string{" ai ", "", "starter", "ai"})
	if len(got) != 2 || got[0] != "ai" || got[1] != "starter" {
		t.Fatalf("tags = %#v, want ai/starter", got)
	}
}
