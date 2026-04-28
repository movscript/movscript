package model

import "gorm.io/gorm"

// SettingRelationship stores global or script-scoped relationships between settings.
type SettingRelationship struct {
	gorm.Model
	ProjectID       uint    `gorm:"not null;index" json:"project_id"`
	SourceSettingID uint    `gorm:"not null;index" json:"source_setting_id"`
	SourceSetting   Setting `gorm:"foreignKey:SourceSettingID" json:"source_setting,omitempty"`
	TargetSettingID uint    `gorm:"not null;index" json:"target_setting_id"`
	TargetSetting   Setting `gorm:"foreignKey:TargetSettingID" json:"target_setting,omitempty"`
	ScopeScriptID   *uint   `gorm:"index" json:"scope_script_id,omitempty"`
	ScopeScript     *Script `gorm:"foreignKey:ScopeScriptID" json:"scope_script,omitempty"`
	Type            string  `json:"type"` // alliance|family|love|conflict|secret|other
	Label           string  `json:"label"`
	Description     string  `gorm:"type:text" json:"description"`
	Source          string  `gorm:"default:'manual'" json:"source"` // ai|manual
}
