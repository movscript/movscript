package model

import "gorm.io/gorm"

// Scene represents a filming scene. It belongs to a Project directly,
// independent of any Episode. Episodes reference Scenes via EpisodeScene.
type Scene struct {
	gorm.Model
	ProjectID      uint    `gorm:"not null" json:"project_id"`
	PipelineNodeID *uint   `json:"pipeline_node_id,omitempty"`
	ScriptID       *uint   `json:"script_id,omitempty"`
	Script         *Script `gorm:"foreignKey:ScriptID" json:"script,omitempty"`
	Number         int     `json:"number"`
	Title          string  `json:"title"`
	Notes          string  `json:"notes"`
	// Reserved for legacy entity-level review. Disabled in the frontend for now;
	// pipeline node status is the active review source of truth.
	ReviewStatus string       `gorm:"default:'draft'" json:"review_status"`
	Settings     []Setting    `gorm:"many2many:scene_setting_refs;" json:"settings,omitempty"`
	Storyboards  []Storyboard `gorm:"foreignKey:SceneID" json:"storyboards,omitempty"`
	FinalVideos  []FinalVideo `gorm:"foreignKey:SceneID" json:"final_videos,omitempty"`
}

// SceneSettingRef links a scene to canonical settings used in that scene.
type SceneSettingRef struct {
	ProjectID uint `gorm:"not null;index" json:"project_id"`
	SceneID   uint `gorm:"primaryKey" json:"scene_id"`
	SettingID uint `gorm:"primaryKey" json:"setting_id"`
	Order     int  `json:"order"`
}

// EpisodeScene is the join table linking Episodes to Scenes (many-to-many).
type EpisodeScene struct {
	EpisodeID uint `gorm:"primaryKey" json:"episode_id"`
	SceneID   uint `gorm:"primaryKey" json:"scene_id"`
	Order     int  `json:"order"` // scene order within the episode
}
