package model

import (
	"time"

	"gorm.io/gorm"
)

// Task represents a work item assigned to a project member.
type Task struct {
	gorm.Model
	ProjectID      uint          `gorm:"not null" json:"project_id"`
	PipelineNodeID *uint         `gorm:"index" json:"pipeline_node_id,omitempty"`
	PipelineNode   *PipelineNode `gorm:"foreignKey:PipelineNodeID" json:"pipeline_node,omitempty"`
	AssigneeID     *uint         `json:"assignee_id,omitempty"`
	Assignee       *User         `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	CreatorID      uint          `gorm:"not null" json:"creator_id"`

	Title       string `gorm:"not null" json:"title"`
	Description string `json:"description"`
	Priority    string `gorm:"default:'medium'" json:"priority"` // low|medium|high
	Status      string `gorm:"default:'pending'" json:"status"`  // pending|in_progress|review|done

	// What this task is about
	RefType string `json:"ref_type"` // episode|scene|storyboard|shot
	RefID   *uint  `json:"ref_id,omitempty"`

	Deadline *time.Time `json:"deadline,omitempty"`

	Comments []TaskComment `gorm:"foreignKey:TaskID" json:"comments,omitempty"`
}

type TaskComment struct {
	gorm.Model
	TaskID  uint   `gorm:"not null" json:"task_id"`
	UserID  uint   `gorm:"not null" json:"user_id"`
	User    User   `json:"user,omitempty"`
	Content string `gorm:"not null" json:"content"`
}
