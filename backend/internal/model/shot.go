package model

import "gorm.io/gorm"

// Shot is the executable unit of a Storyboard — one generation task.
// Camera parameters live in Storyboard, not here.
// StoryboardID is optional — shots can exist independently of a storyboard.
type Shot struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null" json:"project_id"`
	StoryboardID *uint  `json:"storyboard_id,omitempty"`
	PipelineNodeID *uint `json:"pipeline_node_id,omitempty"`
	AssigneeID     *uint `json:"assignee_id,omitempty"`
	Assignee       *User `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	ReviewStatus   string `gorm:"default:'draft'" json:"review_status"`
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

	// Cinematography parameters
	ShotSize    string `json:"shot_size"`    // close_up|near|medium|full|wide|extreme_wide
	Angle       string `json:"angle"`        // eye_level|overhead|low_angle|side|top|dutch
	Movement    string `json:"movement"`     // push|pull|pan|dolly|follow|crane|handheld|static
	FocalLength string `json:"focal_length"` // wide|standard|telephoto
	Pacing      string `json:"pacing"`       // fast_cut|long_take|pause
	Intent      string `json:"intent"`       // 镜头意图（区别于 description）

	// Status: draft|prompt_ready|generating|generated|approved
	Status string `gorm:"default:'draft'" json:"status"`
}
