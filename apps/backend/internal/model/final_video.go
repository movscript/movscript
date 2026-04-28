package model

import "gorm.io/gorm"

// FinalVideo is the edited deliverable for a project, episode, scene,
// storyboard, or shot. The media itself lives in RawResource.
type FinalVideo struct {
	gorm.Model
	ProjectID      uint         `gorm:"not null" json:"project_id"`
	EpisodeID      *uint        `json:"episode_id,omitempty"`
	SceneID        *uint        `json:"scene_id,omitempty"`
	StoryboardID   *uint        `json:"storyboard_id,omitempty"`
	ShotID         *uint        `json:"shot_id,omitempty"`
	PipelineNodeID *uint        `json:"pipeline_node_id,omitempty"`
	Title          string       `json:"title"`
	Description    string       `json:"description"`
	ResourceID     *uint        `json:"resource_id,omitempty"`
	Resource       *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
	Status         string       `gorm:"default:'draft'" json:"status"`
	Order          int          `json:"order"`
}
