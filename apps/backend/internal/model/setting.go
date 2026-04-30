package model

import "gorm.io/gorm"

// Setting is a canonical project entity: a uniquely named thing with type,
// stable tags, default asset state, state-specific tags, notes, and relationships.
type Setting struct {
	gorm.Model
	ProjectID        uint            `gorm:"not null;index" json:"project_id"`
	PipelineNodeID   *uint           `json:"pipeline_node_id,omitempty"`
	ScriptID         *uint           `json:"script_id,omitempty"`
	SourceScriptID   *uint           `json:"source_script_id,omitempty"`
	SourceAnalysisID *uint           `json:"source_analysis_id,omitempty"`
	SourceAnalysis   *ScriptAnalysis `gorm:"foreignKey:SourceAnalysisID" json:"source_analysis,omitempty"`
	Type             string          `gorm:"index" json:"type"`
	Name             string          `gorm:"not null" json:"name"`
	Alias            string          `json:"alias"`
	Description      string          `json:"description"`
	Content          string          `gorm:"type:text" json:"content"`
	Status           string          `json:"status"`                                 // user-defined default asset state
	Importance       string          `gorm:"default:'supporting'" json:"importance"` // main|supporting|background
	Tags             string          `gorm:"type:text" json:"tags"`                  // JSON array of stable tags
	StateTags        string          `gorm:"type:text" json:"state_tags"`            // JSON object: state -> tag array
	ProfileJSON      string          `gorm:"type:text" json:"profile_json"`          // type-specific structured profile
}
