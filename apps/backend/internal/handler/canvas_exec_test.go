package handler

import (
	"context"
	"encoding/json"
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
