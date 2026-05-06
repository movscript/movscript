package model

import "gorm.io/gorm"

// ScriptAnalysis stores one structured analysis snapshot for a script.
// Confirmed analysis rows can be used as the source for Setting records.
type ScriptAnalysis struct {
	gorm.Model
	ProjectID              uint    `gorm:"not null;index" json:"project_id"`
	ScriptID               uint    `gorm:"not null;index" json:"script_id"`
	Script                 *Script `gorm:"foreignKey:ScriptID" json:"script,omitempty"`
	Status                 string  `gorm:"default:'draft'" json:"status"` // draft|confirmed
	Summary                string  `gorm:"type:text" json:"summary"`
	WorldSetting           string  `gorm:"type:text" json:"world_setting"`
	CharacterExtractJSON   string  `gorm:"type:text" json:"character_extract_json"`
	SceneExtractJSON       string  `gorm:"type:text" json:"scene_extract_json"`
	PropExtractJSON        string  `gorm:"type:text" json:"prop_extract_json"`
	RelationshipJSON       string  `gorm:"type:text" json:"relationship_json"`
	CoreSettingJSON        string  `gorm:"type:text" json:"core_setting_json"`
	ScriptPointJSON        string  `gorm:"type:text" json:"script_point_json"`
	SourceModelConfigID    *uint   `json:"source_model_config_id,omitempty"`
	Prompt                 string  `gorm:"type:text" json:"prompt"`
	RawResponse            string  `gorm:"type:text" json:"raw_response"`
	NormalizedResponseJSON string  `gorm:"type:text" json:"normalized_response_json"`
}
