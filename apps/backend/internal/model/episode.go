package model

import "gorm.io/gorm"

type Episode struct {
	gorm.Model
	ProjectID    uint    `json:"project_id"` // direct project reference
	Title        string  `gorm:"not null" json:"title"`
	Number       int     `json:"number"`
	Synopsis     string  `json:"synopsis"`
	ReviewStatus string  `gorm:"default:'draft'" json:"review_status"`
	ScriptID     *uint   `json:"script_id,omitempty"` // optional — nil if created without a script
	Script       *Script `gorm:"foreignKey:ScriptID" json:"script,omitempty"`

	Settings    []Setting    `gorm:"many2many:episode_setting_refs;" json:"settings,omitempty"`
	Scenes      []Scene      `gorm:"many2many:episode_scenes;" json:"scenes,omitempty"`
	Storyboards []Storyboard `gorm:"foreignKey:EpisodeID" json:"storyboards,omitempty"`
}

// EpisodeSettingRef links an episode to canonical settings used in that episode.
type EpisodeSettingRef struct {
	ProjectID uint `gorm:"not null;index" json:"project_id"`
	EpisodeID uint `gorm:"primaryKey" json:"episode_id"`
	SettingID uint `gorm:"primaryKey" json:"setting_id"`
	Order     int  `json:"order"`
}
