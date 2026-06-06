package canvas

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidCanvasType = errors.New("invalid canvas type")
)

type CanvasCreateInput struct {
	OwnerID     uint
	OrgID       *uint
	Name        string
	Description string
	ProjectID   *uint
	CanvasType  string
	Stage       string
}

type Canvas struct {
	ID           uint         `json:"ID"`
	OwnerID      uint         `json:"owner_id"`
	OrgID        *uint        `json:"org_id,omitempty"`
	Name         string       `json:"name"`
	Description  string       `json:"description,omitempty"`
	CanvasType   string       `json:"canvas_type"`
	ProjectID    *uint        `json:"project_id,omitempty"`
	Stage        string       `json:"stage"`
	Visibility   string       `json:"visibility"`
	WorkflowKey  string       `json:"workflow_key,omitempty"`
	WorkflowTags string       `json:"workflow_tags,omitempty"`
	PublishedAt  *time.Time   `json:"published_at,omitempty"`
	Nodes        []CanvasNode `json:"nodes,omitempty"`
	Edges        []CanvasEdge `json:"edges,omitempty"`
	CreatedAt    time.Time    `json:"CreatedAt"`
	UpdatedAt    time.Time    `json:"UpdatedAt"`
	DeletedAt    *time.Time   `json:"DeletedAt"`
}

type CanvasNode struct {
	ID        uint       `json:"ID"`
	CanvasID  uint       `json:"canvas_id"`
	NodeID    string     `json:"node_id"`
	Type      string     `json:"type"`
	Label     string     `json:"label"`
	PosX      float64    `json:"pos_x"`
	PosY      float64    `json:"pos_y"`
	Data      string     `json:"data"`
	CreatedAt time.Time  `json:"CreatedAt"`
	UpdatedAt time.Time  `json:"UpdatedAt"`
	DeletedAt *time.Time `json:"DeletedAt"`
}

type CanvasEdge struct {
	ID           uint       `json:"ID"`
	CanvasID     uint       `json:"canvas_id"`
	EdgeID       string     `json:"edge_id"`
	Source       string     `json:"source"`
	Target       string     `json:"target"`
	SourceHandle string     `json:"source_handle,omitempty"`
	TargetHandle string     `json:"target_handle,omitempty"`
	CreatedAt    time.Time  `json:"CreatedAt"`
	UpdatedAt    time.Time  `json:"UpdatedAt"`
	DeletedAt    *time.Time `json:"DeletedAt"`
}

func NormalizeCreateInput(input *CanvasCreateInput) error {
	if input.CanvasType == "" {
		input.CanvasType = "inspiration"
	}
	if !ValidCanvasType(input.CanvasType) {
		return ErrInvalidCanvasType
	}
	input.Description = strings.TrimSpace(input.Description)
	return nil
}

func NewCanvas(input CanvasCreateInput) Canvas {
	return Canvas{
		OwnerID:     input.OwnerID,
		OrgID:       input.OrgID,
		Name:        input.Name,
		Description: input.Description,
		ProjectID:   input.ProjectID,
		CanvasType:  input.CanvasType,
		Stage:       input.Stage,
		Visibility:  "private",
	}
}

func ValidCanvasType(value string) bool {
	switch value {
	case "inspiration", "workflow":
		return true
	default:
		return false
	}
}

func WorkflowBootstrapGraph(canvasID uint) ([]CanvasNode, CanvasEdge) {
	inputData, _ := json.Marshal(map[string]any{
		"source":     "manual",
		"inputValue": "",
		"paramName":  "input",
		"paramType":  "text",
	})
	outputData, _ := json.Marshal(map[string]any{
		"source":            "manual",
		"label":             "最终输出",
		"paramName":         "final_output",
		"paramType":         "resource",
		"lockedFinalOutput": true,
	})
	nodes := []CanvasNode{
		{CanvasID: canvasID, NodeID: "input", Type: "input", Label: "输入", PosX: 120, PosY: 160, Data: string(inputData)},
		{CanvasID: canvasID, NodeID: "final-output", Type: "output", Label: "最终输出", PosX: 560, PosY: 160, Data: string(outputData)},
	}
	edge := CanvasEdge{CanvasID: canvasID, EdgeID: "input-output", Source: "input", Target: "final-output", SourceHandle: "value", TargetHandle: "value"}
	return nodes, edge
}
