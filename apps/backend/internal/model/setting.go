package model

import "gorm.io/gorm"

// Setting is the "bible" entry for a character, scene location, or prop.
// Type: character | scene | prop
type Setting struct {
	gorm.Model
	ProjectID   uint   `gorm:"not null" json:"project_id"`
	ScriptID    *uint  `json:"script_id,omitempty"`
	Type        string `gorm:"not null" json:"type"`
	Name        string `gorm:"not null" json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
}
