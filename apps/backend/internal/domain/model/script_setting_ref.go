package model

import "gorm.io/gorm"

// ScriptSettingRef links script content to the project bible.
// Script owns the local usage context; Setting owns the canonical profile.
type ScriptSettingRef struct {
	gorm.Model
	ProjectID    uint    `gorm:"not null;index" json:"project_id"`
	ScriptID     uint    `gorm:"not null;index" json:"script_id"`
	Script       Script  `gorm:"foreignKey:ScriptID" json:"script,omitempty"`
	SettingID    uint    `gorm:"not null;index" json:"setting_id"`
	Setting      Setting `gorm:"foreignKey:SettingID" json:"setting,omitempty"`
	Role         string  `json:"role"`               // protagonist|antagonist|supporting|location|prop|mentioned|world_rule
	Scope        string  `gorm:"index" json:"scope"` // main|episode|scene
	FirstMention string  `gorm:"type:text" json:"first_mention"`
	Evidence     string  `gorm:"type:text" json:"evidence"`
	Note         string  `gorm:"type:text" json:"note"`
	Emotion      string  `json:"emotion"`
	State        string  `json:"state"`
	Purpose      string  `gorm:"type:text" json:"purpose"`
	Order        int     `json:"order"`
	Source       string  `gorm:"default:'manual'" json:"source"` // ai|manual
	Confidence   float64 `json:"confidence"`
}
