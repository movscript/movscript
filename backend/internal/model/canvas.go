package model

import (
	"time"

	"gorm.io/gorm"
)

type Canvas struct {
	gorm.Model
	OwnerID    uint         `gorm:"not null" json:"owner_id"`
	Owner      User         `json:"owner,omitempty"`
	Name       string       `gorm:"not null" json:"name"`
	CanvasType string       `gorm:"default:'inspiration'" json:"canvas_type"` // inspiration|workflow
	ProjectID  *uint        `json:"project_id,omitempty"`
	Stage      string       `json:"stage"`    // script_analysis|asset_prep|storyboard|generation|editing
	RefType    string       `json:"ref_type"` // asset_view|storyboard|scene
	RefID      *uint        `json:"ref_id,omitempty"`
	Nodes      []CanvasNode `gorm:"foreignKey:CanvasID" json:"nodes,omitempty"`
	Edges      []CanvasEdge `gorm:"foreignKey:CanvasID" json:"edges,omitempty"`
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
	CanvasID uint   `gorm:"not null" json:"canvas_id"`
	EdgeID   string `gorm:"not null" json:"edge_id"`
	Source   string `gorm:"not null" json:"source"` // source node_id
	Target   string `gorm:"not null" json:"target"` // target node_id
}

type CanvasRun struct {
	gorm.Model
	CanvasID    uint         `gorm:"not null" json:"canvas_id"`
	Status      string       `gorm:"default:'pending'" json:"status"` // pending | running | done | failed
	InputValues string       `json:"input_values,omitempty"`          // JSON object keyed by input node_id
	Error       string       `json:"error,omitempty"`
	StartedAt   *time.Time   `json:"started_at,omitempty"`
	FinishedAt  *time.Time   `json:"finished_at,omitempty"`
	Tasks       []CanvasTask `gorm:"foreignKey:CanvasRunID" json:"tasks,omitempty"`
}

type CanvasTask struct {
	gorm.Model
	CanvasNodeID   uint         `gorm:"not null" json:"canvas_node_id"`
	CanvasRunID    *uint        `json:"canvas_run_id,omitempty"`
	CanvasRun      *CanvasRun   `gorm:"foreignKey:CanvasRunID" json:"canvas_run,omitempty"`
	Status         string       `gorm:"default:'pending'" json:"status"` // pending | running | done | failed
	ProviderTaskID string       `json:"provider_task_id,omitempty"`
	Error          string       `json:"error,omitempty"`
	ResourceID     *uint        `json:"resource_id,omitempty"`
	Resource       *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
}
