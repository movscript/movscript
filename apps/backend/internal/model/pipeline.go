package model

import (
	"time"

	"gorm.io/gorm"
)

// PipelineNode is a production work item in the content pipeline.
// Content entities (Script, Storyboard, Shot, etc.) remain the source of truth;
// a node only tracks production assignment, review state, and optional entity binding.
// Status transitions: draft → under_review → final | rejected
//
//	rejected → draft (reopen, cascades to child nodes)
type PipelineNode struct {
	gorm.Model
	ProjectID   uint       `gorm:"not null" json:"project_id"`
	Type        string     `json:"type"` // production stage type; legacy artifact/custom node types are still readable
	Name        string     `json:"name"`
	Status      string     `gorm:"default:'draft'" json:"status"` // draft|under_review|rejected|final
	Description string     `json:"description,omitempty"`
	AssigneeID  *uint      `json:"assignee_id,omitempty"`
	Assignee    *User      `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	// Review metadata
	ReviewNote string     `json:"review_note,omitempty"`
	ReviewedBy *uint      `json:"reviewed_by,omitempty"`
	ReviewedAt *time.Time `json:"reviewed_at,omitempty"`
	// Stage lead (responsible for the stage outcome) vs assignee (content executor)
	LeadID *uint `json:"lead_id,omitempty"`
	Lead   *User `gorm:"foreignKey:LeadID" json:"lead,omitempty"`
	// Content type for stage workspace routing
	ContentType string `gorm:"default:'custom'" json:"content_type"` // script|setting|storyboard|shot|asset|episode|scene|final_video|custom
	// Optional link to a content entity
	EntityType string `json:"entity_type,omitempty"` // script|setting|storyboard|shot|asset|episode|scene|final_video
	EntityID   *uint  `json:"entity_id,omitempty"`
	// Legacy position fields kept for old clients/data. Tree view no longer depends on them.
	PosX float64 `json:"pos_x"`
	PosY float64 `json:"pos_y"`
}

// PipelineEdge represents a directed relation between two pipeline nodes.
// RelationType is "hierarchy" for the task-layer parent-child tree, or "dependency"
// for extra DAG dependencies in the dependency layer.
type PipelineEdge struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null" json:"project_id"`
	FromNodeID   uint   `gorm:"not null" json:"from_node_id"`
	ToNodeID     uint   `gorm:"not null" json:"to_node_id"`
	RelationType string `gorm:"default:'hierarchy'" json:"relation_type"` // hierarchy|dependency
}
