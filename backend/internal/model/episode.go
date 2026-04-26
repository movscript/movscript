package model

import "gorm.io/gorm"

type Episode struct {
	gorm.Model
	ProjectID   uint   `json:"project_id"` // direct project reference
	Title       string `gorm:"not null" json:"title"`
	Number      int    `json:"number"`
	Synopsis    string `json:"synopsis"`
	// draft|scripted|storyboarded|generating|editing|done
	Status      string `gorm:"default:'draft'" json:"status"`
	ScriptID    *uint  `json:"script_id,omitempty"` // optional — nil if created without a script
	Script      Script `json:"script,omitempty"`
	TargetStoryboards int    `json:"target_storyboards"` // expected storyboard count for this episode
	TargetScenes      int    `json:"target_scenes"`      // expected scene count for this episode
	ResourceIDs       string `json:"resource_ids"`       // JSON array of RawResource IDs

	Scenes      []Scene      `gorm:"many2many:episode_scenes;" json:"scenes,omitempty"`
	Storyboards []Storyboard `gorm:"foreignKey:EpisodeID" json:"storyboards,omitempty"`
}
