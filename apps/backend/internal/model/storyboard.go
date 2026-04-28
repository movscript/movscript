package model

import "gorm.io/gorm"

// Storyboard is the director's written/visual script for a scene.
// SceneID and EpisodeID are optional — storyboards can be created freely
// and associated with scenes/episodes later.
type Storyboard struct {
	gorm.Model
	ProjectID      uint  `gorm:"not null" json:"project_id"`
	SceneID        *uint `json:"scene_id,omitempty"`
	EpisodeID      *uint `json:"episode_id,omitempty"`
	PipelineNodeID *uint `json:"pipeline_node_id,omitempty"`
	AssigneeID     *uint `json:"assignee_id,omitempty"`
	Assignee       *User `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	// Reserved for legacy entity-level review. Disabled in the frontend for now;
	// pipeline node status is the active review source of truth.
	ReviewStatus string `gorm:"default:'draft'" json:"review_status"`
	Order        int    `json:"order"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	Notes        string `json:"notes"`

	// Content
	Characters string `json:"characters"` // JSON array of asset IDs or names
	Actions    string `json:"actions"`
	Dialogue   string `json:"dialogue"`
	Atmosphere string `json:"atmosphere"`

	// Camera parameters (apply to all shots within this storyboard)
	CameraAngle    string  `json:"camera_angle"`    // close-up|medium|wide|extreme-wide|overhead|pov
	CameraMovement string  `json:"camera_movement"` // static|pan|tilt|dolly|zoom|handheld
	DepthOfField   string  `json:"depth_of_field"`  // shallow|normal|deep
	Lighting       string  `json:"lighting"`
	Duration       float64 `json:"duration"`     // seconds
	ShotSize       string  `json:"shot_size"`    // close_up|near|medium|full|wide|extreme_wide
	Angle          string  `json:"angle"`        // eye_level|overhead|low_angle|side|top|dutch
	Movement       string  `json:"movement"`     // push|pull|pan|dolly|follow|crane|handheld|static
	FocalLength    string  `json:"focal_length"` // wide|standard|telephoto
	Pacing         string  `json:"pacing"`       // fast_cut|long_take|pause
	Intent         string  `json:"intent"`       // 镜头意图

	// Attached media (reference images, sketches, etc.)
	ResourceIDs string `json:"resource_ids"` // JSON array of RawResource IDs

	// Status: draft|approved
	Status string `gorm:"default:'draft'" json:"status"`

	Shots []Shot `gorm:"foreignKey:StoryboardID" json:"shots,omitempty"`
}
