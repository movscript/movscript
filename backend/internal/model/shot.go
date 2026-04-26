package model

import "gorm.io/gorm"

// Shot is the executable unit of a Storyboard — one generation task.
// Camera parameters live in Storyboard, not here.
// StoryboardID is optional — shots can exist independently of a storyboard.
type Shot struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null" json:"project_id"`
	StoryboardID *uint  `json:"storyboard_id,omitempty"`
	Order        int    `json:"order"`
	Description  string `json:"description"`

	// AI generation
	Prompt         string `json:"prompt"`
	CanvasID       *uint  `json:"canvas_id,omitempty"`
	GeneratedResID *uint  `json:"generated_res_id,omitempty"`
	RefResourceIDs string `json:"ref_resource_ids"` // JSON array of reference RawResource IDs

	// Final version — stored separately from the working draft fields above.
	FinalDescription string `json:"final_description"`
	FinalPrompt      string `json:"final_prompt"`
	IsApproved       bool   `gorm:"default:false" json:"is_approved"`

	// Status: draft|prompt_ready|generating|generated|approved
	Status string `gorm:"default:'draft'" json:"status"`
}
