package handler

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func TestExecuteCanvasNodePropagatesInlineText(t *testing.T) {
	h := &CanvasHandler{}
	user := &model.User{Model: gorm.Model{ID: 1}}
	cv := model.Canvas{}

	inputData, _ := json.Marshal(nodeData{InputValue: "hello canvas", ParamType: "text"})
	inputNode := &model.CanvasNode{NodeID: "input-1", Type: "input", Data: string(inputData)}
	inputOutputs := h.executeCanvasNode(context.Background(), user, cv, inputNode, nil, nil)
	inputValue := inputOutputs["value"]
	if inputValue.Type != "text" || inputValue.Text != "hello canvas" {
		t.Fatalf("expected inline text output, got %#v", inputValue)
	}
	if inputValue.ResourceID != nil {
		t.Fatalf("expected no resource for inline text, got %d", *inputValue.ResourceID)
	}

	outputData, _ := json.Marshal(nodeData{})
	outputNode := &model.CanvasNode{NodeID: "output-1", Type: "output", Data: string(outputData)}
	outputInputs := canvasPortInputMap{
		"input": []canvasPortValue{inputValue},
		"":      []canvasPortValue{inputValue},
	}
	outputs := h.executeCanvasNode(context.Background(), user, cv, outputNode, nil, outputInputs)
	outputValue := outputs["value"]
	if outputValue.Type != "text" || outputValue.Text != "hello canvas" {
		t.Fatalf("expected output node to preserve inline text, got %#v", outputValue)
	}
	if outputValue.ResourceID != nil {
		t.Fatalf("expected no resource after output propagation, got %d", *outputValue.ResourceID)
	}
}

func TestValidateCanvasRequiredInputsRejectsUnconnectedFullRunInput(t *testing.T) {
	nodeData, _ := json.Marshal(nodeData{
		Source:     "ai",
		InputPorts: []canvasPortDef{{ID: "prompt", Type: "text", Required: true}},
	})
	cv := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "text-1", Type: "text", Data: string(nodeData)},
		},
	}

	err := validateCanvasRequiredInputs(cv, nil)
	if err == nil || !strings.Contains(err.Error(), `node "text-1" required input "prompt" is missing`) {
		t.Fatalf("expected missing required input error, got %v", err)
	}
}

func TestValidateCanvasRequiredInputsAcceptsConnectedFullRunInput(t *testing.T) {
	inputData, _ := json.Marshal(nodeData{InputValue: "connected"})
	textData, _ := json.Marshal(nodeData{
		Source:     "ai",
		InputPorts: []canvasPortDef{{ID: "prompt", Type: "text", Required: true}},
	})
	cv := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "input-1", Type: "input", Data: string(inputData)},
			{NodeID: "text-1", Type: "text", Data: string(textData)},
		},
		Edges: []model.CanvasEdge{
			{Source: "input-1", Target: "text-1", SourceHandle: "value", TargetHandle: "prompt"},
		},
	}

	if err := validateCanvasRequiredInputs(cv, nil); err != nil {
		t.Fatalf("expected connected required input to pass, got %v", err)
	}
}

func TestCollectSingleNodeInputsRejectsUnconnectedRequiredInput(t *testing.T) {
	h := &CanvasHandler{}
	nodeData, _ := json.Marshal(nodeData{
		Source:     "ai",
		InputPorts: []canvasPortDef{{ID: "prompt", Type: "text", Required: true}},
	})
	cv := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "text-1", Type: "text", Data: string(nodeData)},
		},
	}

	_, err := h.collectSingleNodeInputs(context.Background(), &model.User{}, cv, "text-1", nil)
	if err == nil || !strings.Contains(err.Error(), `required input "prompt" is missing`) {
		t.Fatalf("expected missing required input error, got %v", err)
	}
}

func TestCollectSingleNodeInputsIgnoresOverridesForConnectedPorts(t *testing.T) {
	h := &CanvasHandler{}
	inputData, _ := json.Marshal(nodeData{InputValue: "from edge", ParamType: "text"})
	textData, _ := json.Marshal(nodeData{
		Source:     "ai",
		InputPorts: []canvasPortDef{{ID: "prompt", Type: "text", Required: true}},
	})
	cv := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "input-1", Type: "input", Data: string(inputData)},
			{NodeID: "text-1", Type: "text", Data: string(textData)},
		},
		Edges: []model.CanvasEdge{
			{Source: "input-1", Target: "text-1", SourceHandle: "value", TargetHandle: "prompt"},
		},
	}

	inputs, err := h.collectSingleNodeInputs(context.Background(), &model.User{}, cv, "text-1", map[string]canvasPortValue{
		"prompt": {Type: "text", Text: "from override"},
	})
	if err != nil {
		t.Fatalf("expected connected input collection to pass, got %v", err)
	}
	if got := inputs["prompt"]; len(got) != 1 || got[0].Text != "from edge" {
		t.Fatalf("expected only upstream prompt input, got %#v", got)
	}
}

func TestNormalizeCanvasTaskForResponseBackfillsLegacyResourceOutput(t *testing.T) {
	rid := uint(42)
	task := model.CanvasTask{
		NodeType:   "image",
		ResourceID: &rid,
	}

	normalizeCanvasTaskForResponse(&task, "")

	outputs := decodeCanvasPortOutputs(task.OutputValues)
	if outputs["image"].ResourceID == nil || *outputs["image"].ResourceID != rid {
		t.Fatalf("expected image output resource %d, got %#v", rid, outputs["image"])
	}
	if outputs["result"].ResourceID == nil || *outputs["result"].ResourceID != rid {
		t.Fatalf("expected result output resource %d, got %#v", rid, outputs["result"])
	}
	if outputs["value"].ResourceID == nil || *outputs["value"].ResourceID != rid {
		t.Fatalf("expected value output resource %d, got %#v", rid, outputs["value"])
	}
}

func TestPluginHTTPOutputsDecodePortValues(t *testing.T) {
	outputs := pluginHTTPOutputs([]byte(`{"outputs":{"summary":{"type":"text","text":"ok"},"score":0.75}}`))
	if got := outputs["summary"]; got.Type != "text" || got.Text != "ok" {
		t.Fatalf("expected text summary output, got %#v", got)
	}
	if got := outputs["score"]; got.Type != "number" || got.Number == nil || *got.Number != 0.75 {
		t.Fatalf("expected numeric score output, got %#v", got)
	}
}

func TestBuildCanvasExecutionPlanCreatesTasksOnlyForRunnableNodes(t *testing.T) {
	staticInputData, _ := json.Marshal(nodeData{InputValue: "seed", ParamType: "text"})
	staticTextData, _ := json.Marshal(nodeData{TextContent: "note"})
	aiTextData, _ := json.Marshal(nodeData{Source: "ai", Prompt: "write"})
	executableData, _ := json.Marshal(nodeData{ExecutableSpec: &canvasExecutableSpec{Executor: "plugin_http", PluginToolKey: "plugin.tool"}})
	entityReadData, _ := json.Marshal(nodeData{EntityKind: "scene", EntityID: uintPtr(7)})
	entityWriteData, _ := json.Marshal(nodeData{EntityKind: "shot", EntityID: uintPtr(9)})
	outputData, _ := json.Marshal(nodeData{})
	resourceSinkData, _ := json.Marshal(nodeData{})

	cv := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "input-1", Type: "input", Data: string(staticInputData)},
			{NodeID: "text-static", Type: "text", Data: string(staticTextData)},
			{NodeID: "text-ai", Type: "text", Data: string(aiTextData)},
			{NodeID: "plugin-1", Type: "plugin_card", Data: string(executableData)},
			{NodeID: "entity-read", Type: "entity_card", Data: string(entityReadData)},
			{NodeID: "entity-write", Type: "entity_card", Data: string(entityWriteData)},
			{NodeID: "resource-out", Type: "resource_sink", Data: string(resourceSinkData)},
			{NodeID: "output-1", Type: "output", Data: string(outputData)},
		},
		Edges: []model.CanvasEdge{
			{Source: "input-1", Target: "entity-write", SourceHandle: "value", TargetHandle: "description"},
			{Source: "text-ai", Target: "resource-out", SourceHandle: "text", TargetHandle: "input"},
			{Source: "text-ai", Target: "output-1", SourceHandle: "text", TargetHandle: "value"},
		},
	}

	plan, err := buildCanvasExecutionPlan(cv)
	if err != nil {
		t.Fatalf("expected execution plan, got %v", err)
	}
	got := make([]string, 0, len(plan.Tasks))
	for _, task := range plan.Tasks {
		got = append(got, task.NodeID)
	}
	want := []string{"text-ai", "plugin-1", "entity-write", "resource-out", "output-1"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("expected task nodes %v, got %v", want, got)
	}
}

func TestRegisterWorkflowOutputUsesNodeIDAndParamName(t *testing.T) {
	outputData := nodeData{ParamName: "final_text", ParamType: "text"}
	node := &model.CanvasNode{NodeID: "output-1", Type: "output", Label: "Final"}
	value := canvasPortValue{Type: "text", Text: "done"}
	outputs := map[string]canvasPortValue{}

	registerWorkflowOutput(outputs, node, outputData, map[string]canvasPortValue{"value": value})

	if got := outputs["output-1"]; got.Type != "text" || got.Text != "done" {
		t.Fatalf("expected output keyed by node id, got %#v", got)
	}
	if got := outputs["final_text"]; got.Type != "text" || got.Text != "done" {
		t.Fatalf("expected output keyed by param name, got %#v", got)
	}
}

func TestCanvasReferenceInputValuesMapPortsToReferencedInputNodes(t *testing.T) {
	inputData, _ := json.Marshal(nodeData{ParamName: "seed", ParamType: "text"})
	ref := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "ref-input", Type: "input", Label: "Seed", Data: string(inputData)},
		},
	}

	values := (&CanvasHandler{}).canvasReferenceInputValues(ref, nodeData{}, canvasPortInputMap{
		"seed": []canvasPortValue{{Type: "text", Text: "hello from parent"}},
	})

	if got := values["ref-input"]; got.Type != "text" || got.Text != "hello from parent" {
		t.Fatalf("expected input value keyed by referenced input node id, got %#v", got)
	}
}

func TestCanvasReferenceInputValuesMapsDefaultInputWhenReferenceHasSingleInput(t *testing.T) {
	inputData, _ := json.Marshal(nodeData{ParamName: "seed", ParamType: "text"})
	ref := model.Canvas{
		Nodes: []model.CanvasNode{
			{NodeID: "ref-input", Type: "input", Label: "Seed", Data: string(inputData)},
		},
	}

	values := (&CanvasHandler{}).canvasReferenceInputValues(ref, nodeData{}, canvasPortInputMap{
		"input": []canvasPortValue{{Type: "text", Text: "legacy edge value"}},
		"":      []canvasPortValue{{Type: "text", Text: "legacy edge value"}},
	})

	if got := values["ref-input"]; got.Type != "text" || got.Text != "legacy edge value" {
		t.Fatalf("expected default input to map to only referenced input, got %#v", got)
	}
}

func TestCanvasRunTaskFailureSummaryIncludesFailedNodeDetails(t *testing.T) {
	summary := canvasRunTaskFailureSummary([]model.CanvasTask{
		{NodeLabel: "Generate image", NodeID: "image-1", Status: "failed", Error: "no model selected for this node"},
		{NodeLabel: "Final output", NodeID: "output-1", Status: "done"},
	})

	if summary != "workflow task failed: Generate image: no model selected for this node" {
		t.Fatalf("expected specific task failure summary, got %q", summary)
	}
}

func TestCanvasRunTaskFailureSummaryFallsBackToNodeIDAndLimitsFailures(t *testing.T) {
	summary := canvasRunTaskFailureSummary([]model.CanvasTask{
		{NodeID: "node-1", Status: "failed", Error: "first"},
		{NodeID: "node-2", Status: "failed", Error: "second"},
		{NodeID: "node-3", Status: "failed", Error: "third"},
		{NodeID: "node-4", Status: "failed", Error: "fourth"},
	})

	if summary != "workflow tasks failed: node-1: first; node-2: second; node-3: third; 1 more failed" {
		t.Fatalf("expected compact multi-failure summary, got %q", summary)
	}
}

func uintPtr(value uint) *uint {
	return &value
}
