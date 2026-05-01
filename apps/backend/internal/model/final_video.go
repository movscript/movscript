package model

import "gorm.io/gorm"

// FinalVideo is the edited deliverable for a project, episode, scene,
// storyboard, or shot. The media itself lives in RawResource.
type FinalVideo struct {
	gorm.Model
	ProjectID    uint   `gorm:"not null" json:"project_id"`
	EpisodeID    *uint  `json:"episode_id,omitempty"`
	SceneID      *uint  `json:"scene_id,omitempty"`
	StoryboardID *uint  `json:"storyboard_id,omitempty"`
	ShotID       *uint  `json:"shot_id,omitempty"`
	Title        string `json:"title"`
	Description  string `json:"description"`
}
