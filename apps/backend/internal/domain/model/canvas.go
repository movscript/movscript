package model

import (
	"time"

	"gorm.io/gorm"
)

type Canvas struct {
	gorm.Model
	OwnerID      uint         `gorm:"not null" json:"owner_id"`
	OrgID        *uint        `gorm:"index" json:"org_id,omitempty"`
	Owner        User         `json:"owner,omitempty"`
	Name         string       `gorm:"not null" json:"name"`
	Description  string       `gorm:"size:512" json:"description,omitempty"`
	CanvasType   string       `gorm:"default:'inspiration'" json:"canvas_type"` // inspiration|workflow
	ProjectID    *uint        `json:"project_id,omitempty"`
	Stage        string       `json:"stage"`    // script_analysis|asset_prep|storyboard|generation|editing
	RefType      string       `json:"ref_type"` // script|setting|asset_slot
	RefID        *uint        `json:"ref_id,omitempty"`
	Visibility   string       `gorm:"default:'private';index" json:"visibility"` // private|public
	WorkflowKey  string       `gorm:"size:160;index" json:"workflow_key,omitempty"`
	WorkflowTags string       `gorm:"type:text" json:"workflow_tags,omitempty"` // JSON array for marketplace filtering
	PublishedAt  *time.Time   `json:"published_at,omitempty"`
	Nodes        []CanvasNode `gorm:"foreignKey:CanvasID" json:"nodes,omitempty"`
	Edges        []CanvasEdge `gorm:"foreignKey:CanvasID" json:"edges,omitempty"`
}

// CanvasNode stores a React Flow node persisted to DB.
// Data is a JSON string: { source, resourceId?, prompt?, modelId?, status?, taskId?, error? }
// Type values:
//
//	media:    text | image | video | audio
//	tools:    canvas | ref_image_gen | ref_video_gen | multi_angle | style_transfer | motion_imitation
type CanvasNode struct {
	gorm.Model
	CanvasID uint    `gorm:"not null" json:"canvas_id"`
	NodeID   string  `gorm:"not null" json:"node_id"` // React Flow node id
	Type     string  `gorm:"not null" json:"type"`
	Label    string  `json:"label"`
	PosX     float64 `json:"pos_x"`
	PosY     float64 `json:"pos_y"`
	Data     string  `json:"data"` // JSON blob
}

type CanvasEdge struct {
	gorm.Model
	CanvasID     uint   `gorm:"not null" json:"canvas_id"`
	EdgeID       string `gorm:"not null" json:"edge_id"`
	Source       string `gorm:"not null" json:"source"`  // source node_id
	Target       string `gorm:"not null" json:"target"`  // target node_id
	SourceHandle string `json:"source_handle,omitempty"` // output port id
	TargetHandle string `json:"target_handle,omitempty"` // input port id
}

type CanvasRun struct {
	gorm.Model
	CanvasID          uint         `gorm:"not null" json:"canvas_id"`
	Status            string       `gorm:"default:'pending';index" json:"status"`    // pending | running | done | failed
	InputValues       string       `json:"input_values,omitempty"`                   // JSON object keyed by input node_id
	OutputValues      string       `gorm:"type:text" json:"output_values,omitempty"` // JSON object keyed by output node_id / param name
	Error             string       `json:"error,omitempty"`
	GraphSnapshot     string       `gorm:"type:text" json:"graph_snapshot,omitempty"`
	SnapshotHash      string       `gorm:"size:64;index" json:"snapshot_hash,omitempty"`
	SnapshotNodeCount int          `json:"snapshot_node_count"`
	SnapshotEdgeCount int          `json:"snapshot_edge_count"`
	StartedAt         *time.Time   `json:"started_at,omitempty"`
	FinishedAt        *time.Time   `json:"finished_at,omitempty"`
	Tasks             []CanvasTask `gorm:"foreignKey:CanvasRunID" json:"tasks,omitempty"`
}

type CanvasTask struct {
	gorm.Model
	CanvasNodeID   uint         `gorm:"not null" json:"canvas_node_id"`
	CanvasRunID    *uint        `json:"canvas_run_id,omitempty"`
	CanvasRun      *CanvasRun   `gorm:"foreignKey:CanvasRunID" json:"canvas_run,omitempty"`
	NodeID         string       `gorm:"index" json:"node_id,omitempty"`
	NodeLabel      string       `json:"node_label,omitempty"`
	NodeType       string       `json:"node_type,omitempty"`
	Status         string       `gorm:"default:'pending'" json:"status"` // pending | running | done | failed
	ProviderTaskID string       `json:"provider_task_id,omitempty"`
	Error          string       `json:"error,omitempty"`
	InputValues    string       `gorm:"type:text" json:"input_values,omitempty"`  // JSON: input port id -> values
	OutputValues   string       `gorm:"type:text" json:"output_values,omitempty"` // JSON: output port id -> value
	ResourceID     *uint        `json:"resource_id,omitempty"`
	Resource       *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
}

type CanvasEntityWriteAudit struct {
	gorm.Model
	CanvasID           uint   `gorm:"index" json:"canvas_id"`
	CanvasRunID        uint   `gorm:"index" json:"canvas_run_id"`
	CanvasNodeID       string `gorm:"index" json:"canvas_node_id"`
	PortID             string `gorm:"not null;index" json:"port_id"`
	EntityKind         string `gorm:"not null;index:idx_canvas_entity_write_audit_entity" json:"entity_kind"`
	EntityID           uint   `gorm:"not null;index:idx_canvas_entity_write_audit_entity" json:"entity_id"`
	UserID             uint   `gorm:"index" json:"user_id"`
	OldValueJSON       string `gorm:"type:text" json:"old_value_json,omitempty"`
	NewValueJSON       string `gorm:"type:text" json:"new_value_json,omitempty"`
	ResourceBindingIDs string `gorm:"type:text" json:"resource_binding_ids,omitempty"`
}

// CanvasOutput records an explicit output target from a canvas run to a semantic entity or
// legacy entity. It complements the write audit with product-level intent.
type CanvasOutput struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null;index" json:"project_id"`
	CanvasID     uint   `gorm:"not null;index" json:"canvas_id"`
	CanvasRunID  *uint  `gorm:"index" json:"canvas_run_id,omitempty"`
	CanvasNodeID string `gorm:"index" json:"canvas_node_id"`
	PortID       string `gorm:"not null;index" json:"port_id"`
	OwnerType    string `gorm:"not null;index:idx_canvas_output_owner" json:"owner_type"`
	OwnerID      uint   `gorm:"not null;index:idx_canvas_output_owner" json:"owner_id"`
	OutputType   string `gorm:"not null;default:'resource';index" json:"output_type"` // resource|field|candidate|note
	ResourceID   *uint  `gorm:"index" json:"resource_id,omitempty"`
	TargetField  string `json:"target_field"`
	ValueJSON    string `gorm:"type:text" json:"value_json"`
	Status       string `gorm:"not null;default:'pending';index" json:"status"` // pending|attached|applied|rejected
	MetadataJSON string `gorm:"type:text" json:"metadata_json"`
}
