package model

import "gorm.io/gorm"

// Shot is the executable/final-output unit of a Storyboard.
// Camera and creative planning parameters live in Storyboard, not here.
// StoryboardID is optional — shots can exist independently of a storyboard.
type Shot struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null" json:"project_id"`
	StoryboardID *uint  `json:"storyboard_id,omitempty"`
	AssigneeID   *uint  `json:"assignee_id,omitempty"`
	Assignee     *User  `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	ReviewStatus string `gorm:"default:'draft'" json:"review_status"`
	Order        int    `json:"order"`
	Description  string `json:"description"`

	// AI generation
	Prompt   string `json:"prompt"`
	CanvasID *uint  `json:"canvas_id,omitempty"`

	// Final version — stored separately from the working draft fields above.
	FinalDescription string `json:"final_description"`
	FinalPrompt      string `json:"final_prompt"`
	IsApproved       bool   `gorm:"default:false" json:"is_approved"`

	// Status: draft|prompt_ready|generating|generated|approved
	Status string `gorm:"default:'draft'" json:"status"`
}
