package canvasruntime

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidCanvasType  = errors.New("invalid canvas type")
	ErrRefIDRequired      = errors.New("ref_id is required when ref_type is set")
	ErrUnsupportedRefType = errors.New("unsupported ref_type")
)

type CanvasCreateInput struct {
	OwnerID     uint
	OrgID       *uint
	Name        string
	Description string
	ProjectID   *uint
	CanvasType  string
	Stage       string
	RefType     string
	RefID       *uint
}

type AssetSlotTargetNodeInput struct {
	CanvasID      uint
	AssetSlotID   uint
	AssetKind     string
	AssetName     string
	FallbackLabel string
}

type EntityWriteAuditSpec struct {
	CanvasID           uint
	CanvasRunID        uint
	CanvasNodeID       string
	PortID             string
	EntityKind         string
	EntityID           uint
	UserID             uint
	OldValueJSON       string
	NewValueJSON       string
	ResourceBindingIDs string
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
	RefType      string       `json:"ref_type"`
	RefID        *uint        `json:"ref_id,omitempty"`
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

type EntityWriteAudit struct {
	ID                 uint       `json:"ID"`
	CanvasID           uint       `json:"canvas_id"`
	CanvasRunID        uint       `json:"canvas_run_id"`
	CanvasNodeID       string     `json:"canvas_node_id"`
	PortID             string     `json:"port_id"`
	EntityKind         string     `json:"entity_kind"`
	EntityID           uint       `json:"entity_id"`
	UserID             uint       `json:"user_id"`
	OldValueJSON       string     `json:"old_value_json,omitempty"`
	NewValueJSON       string     `json:"new_value_json,omitempty"`
	ResourceBindingIDs string     `json:"resource_binding_ids,omitempty"`
	CreatedAt          time.Time  `json:"CreatedAt"`
	UpdatedAt          time.Time  `json:"UpdatedAt"`
	DeletedAt          *time.Time `json:"DeletedAt"`
}

func NormalizeCreateInput(input *CanvasCreateInput) error {
	if input.CanvasType == "" {
		input.CanvasType = "inspiration"
	}
	if !ValidCanvasType(input.CanvasType) {
		return ErrInvalidCanvasType
	}
	input.RefType = strings.TrimSpace(input.RefType)
	if input.RefType != "" && input.RefID == nil {
		return ErrRefIDRequired
	}
	if input.RefType != "" && !ValidRefType(input.RefType) {
		return ErrUnsupportedRefType
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
		RefType:     input.RefType,
		RefID:       input.RefID,
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

func ValidRefType(value string) bool {
	switch value {
	case "script", "asset_slot", "content_unit":
		return true
	default:
		return false
	}
}

func SingleCanvasRefType(refType string) bool {
	switch strings.TrimSpace(refType) {
	case "production", "content_unit", "asset_slot":
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

func NewAssetSlotTargetNode(input AssetSlotTargetNodeInput) CanvasNode {
	title := strings.TrimSpace(input.AssetName)
	if title == "" {
		title = strings.TrimSpace(input.FallbackLabel)
	}
	if title == "" {
		title = "素材位"
	}
	portType := AssetSlotCanvasPortType(input.AssetKind)
	data, _ := json.Marshal(map[string]any{
		"source":        "manual",
		"label":         title,
		"entityKind":    "asset_slot",
		"entityId":      input.AssetSlotID,
		"entityTitle":   title,
		"assetSlotKind": input.AssetKind,
		"textContent":   title,
		"inputPorts": []map[string]any{
			{"id": "candidates", "type": portType, "label": "候选集", "maxCount": 12},
			{"id": "candidate_item", "type": portType, "label": "单个候选"},
		},
		"outputPorts": []map[string]any{
			{"id": "reference", "type": "resource", "label": "参考图"},
			{"id": "prompt_hint", "type": "text", "label": "参考说明"},
			{"id": "creative_reference_id", "type": "number", "label": "所属设定资料"},
		},
	})
	return CanvasNode{
		CanvasID: input.CanvasID,
		NodeID:   "asset-slot-target",
		Type:     "entity_card",
		Label:    title,
		PosX:     520,
		PosY:     180,
		Data:     string(data),
	}
}

func AssetSlotCanvasPortType(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "image", "video", "audio", "text":
		return strings.ToLower(strings.TrimSpace(kind))
	default:
		return "resource"
	}
}

func NewEntityWriteAudit(spec EntityWriteAuditSpec) EntityWriteAudit {
	return EntityWriteAudit{
		CanvasID:           spec.CanvasID,
		CanvasRunID:        spec.CanvasRunID,
		CanvasNodeID:       strings.TrimSpace(spec.CanvasNodeID),
		PortID:             strings.TrimSpace(spec.PortID),
		EntityKind:         strings.TrimSpace(spec.EntityKind),
		EntityID:           spec.EntityID,
		UserID:             spec.UserID,
		OldValueJSON:       strings.TrimSpace(spec.OldValueJSON),
		NewValueJSON:       strings.TrimSpace(spec.NewValueJSON),
		ResourceBindingIDs: strings.TrimSpace(spec.ResourceBindingIDs),
	}
}
