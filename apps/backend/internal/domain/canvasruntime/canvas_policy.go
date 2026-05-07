package canvasruntime

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
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
	ID           uint
	OwnerID      uint
	OrgID        *uint
	Name         string
	Description  string
	CanvasType   string
	ProjectID    *uint
	Stage        string
	RefType      string
	RefID        *uint
	Visibility   string
	WorkflowKey  string
	WorkflowTags string
	PublishedAt  *time.Time
}

type CanvasNode struct {
	ID       uint
	CanvasID uint
	NodeID   string
	Type     string
	Label    string
	PosX     float64
	PosY     float64
	Data     string
}

type EntityWriteAudit struct {
	ID                 uint
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
	case "script", "setting", "asset_slot", "content_unit":
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

func WorkflowBootstrapGraph(canvasID uint) ([]model.CanvasNode, model.CanvasEdge) {
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
	nodes := []model.CanvasNode{
		{CanvasID: canvasID, NodeID: "input", Type: "input", Label: "输入", PosX: 120, PosY: 160, Data: string(inputData)},
		{CanvasID: canvasID, NodeID: "final-output", Type: "output", Label: "最终输出", PosX: 560, PosY: 160, Data: string(outputData)},
	}
	edge := model.CanvasEdge{CanvasID: canvasID, EdgeID: "input-output", Source: "input", Target: "final-output", SourceHandle: "value", TargetHandle: "value"}
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
			{"id": "creative_reference_id", "type": "number", "label": "所属资料"},
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
