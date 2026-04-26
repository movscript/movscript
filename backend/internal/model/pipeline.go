package model

import (
	"time"

	"gorm.io/gorm"
)

// PipelineNode is an independent workflow unit in the content production pipeline.
// It sits above the existing content entities (Script, Storyboard, etc.) as a review layer.
// Status transitions: draft → under_review → final | rejected
//                     rejected → draft (reopen, cascades to downstream)
type PipelineNode struct {
	gorm.Model
	ProjectID   uint       `gorm:"not null" json:"project_id"`
	Type        string     `json:"type"` // raw_script|main_script|episode_script|scene_script|storyboard_script|shot_production|episode_edit|custom
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
	// Optional link to a content entity
	EntityType string `json:"entity_type,omitempty"` // script|episode|storyboard
	EntityID   *uint  `json:"entity_id,omitempty"`
	// Position for DAG visualization
	PosX float64 `json:"pos_x"`
	PosY float64 `json:"pos_y"`
}

// PipelineEdge represents a dependency between two pipeline nodes.
// FromNode must be in "final" status before ToNode can be submitted for review.
type PipelineEdge struct {
	gorm.Model
	ProjectID  uint `gorm:"not null" json:"project_id"`
	FromNodeID uint `gorm:"not null" json:"from_node_id"`
	ToNodeID   uint `gorm:"not null" json:"to_node_id"`
}
