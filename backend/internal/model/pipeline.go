package model

import (
	"time"

	"gorm.io/gorm"
)

// PipelineNode is an independent workflow unit or artifact in the content production pipeline.
// It sits above the existing content entities (Script, Storyboard, etc.) as a review layer.
// Status transitions: draft → under_review → final | rejected
//
//	rejected → draft (reopen, cascades to child nodes)
type PipelineNode struct {
	gorm.Model
	ProjectID   uint       `gorm:"not null" json:"project_id"`
	Type        string     `json:"type"` // work/artifact/custom pipeline node type; tool node types are not supported
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
	ContentType string `gorm:"default:'custom'" json:"content_type"` // script|storyboard|shot|asset|custom
	// Optional link to a content entity
	EntityType string `json:"entity_type,omitempty"` // script|episode|storyboard
	EntityID   *uint  `json:"entity_id,omitempty"`
	// Legacy position fields kept for old clients/data. Tree view no longer depends on them.
	PosX float64 `json:"pos_x"`
	PosY float64 `json:"pos_y"`
}

// PipelineEdge represents a tree parent-child relation between two pipeline nodes.
// FromNodeID is the parent and ToNodeID is the child. The table name is kept for compatibility.
type PipelineEdge struct {
	gorm.Model
	ProjectID  uint `gorm:"not null" json:"project_id"`
	FromNodeID uint `gorm:"not null" json:"from_node_id"`
	ToNodeID   uint `gorm:"not null" json:"to_node_id"`
}
