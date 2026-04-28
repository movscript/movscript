package model

import "gorm.io/gorm"

// Scene represents a filming scene. It belongs to a Project directly,
// independent of any Episode. Episodes reference Scenes via EpisodeScene.
type Scene struct {
	gorm.Model
	ProjectID      uint   `gorm:"not null" json:"project_id"`
	PipelineNodeID *uint  `json:"pipeline_node_id,omitempty"`
	Number         int    `json:"number"`
	Title          string `json:"title"`
	Location       string `json:"location"`
	TimeOfDay      string `json:"time_of_day"` // day|night|dawn|dusk
	Notes          string `json:"notes"`
	// Reserved for legacy entity-level review. Disabled in the frontend for now;
	// pipeline node status is the active review source of truth.
	ReviewStatus string       `gorm:"default:'draft'" json:"review_status"`
	Storyboards  []Storyboard `gorm:"foreignKey:SceneID" json:"storyboards,omitempty"`
}

// EpisodeScene is the join table linking Episodes to Scenes (many-to-many).
type EpisodeScene struct {
	EpisodeID uint `gorm:"primaryKey" json:"episode_id"`
	SceneID   uint `gorm:"primaryKey" json:"scene_id"`
	Order     int  `json:"order"` // scene order within the episode
}
