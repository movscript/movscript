package model

import "gorm.io/gorm"

// Setting is the "bible" entry for a character, scene location, or prop.
// Type: character | scene | prop
type Setting struct {
	gorm.Model
	ProjectID        uint            `gorm:"not null;index" json:"project_id"`
	ScriptID         *uint           `json:"script_id,omitempty"`
	SourceScriptID   *uint           `json:"source_script_id,omitempty"`
	SourceAnalysisID *uint           `json:"source_analysis_id,omitempty"`
	SourceAnalysis   *ScriptAnalysis `gorm:"foreignKey:SourceAnalysisID" json:"source_analysis,omitempty"`
	Type             string          `gorm:"not null;index" json:"type"`
	Name             string          `gorm:"not null" json:"name"`
	Alias            string          `json:"alias"`
	Description      string          `json:"description"`
	Content          string          `gorm:"type:text" json:"content"`
	Status           string          `gorm:"default:'extracted'" json:"status"`      // extracted|confirmed|locked
	Importance       string          `gorm:"default:'supporting'" json:"importance"` // main|supporting|background
	Tags             string          `gorm:"type:text" json:"tags"`                  // JSON array
	ProfileJSON      string          `gorm:"type:text" json:"profile_json"`          // type-specific structured profile
}
