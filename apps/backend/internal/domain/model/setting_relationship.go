package model

import (
	"strings"

	"gorm.io/gorm"
)

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
	Category        string  `gorm:"not null;default:'relationship';index" json:"category"`
	Type            string  `json:"type"`
	Label           string  `json:"label"`
	Description     string  `gorm:"type:text" json:"description"`
	Source          string  `gorm:"default:'manual'" json:"source"` // ai|manual
}

func (item *SettingRelationship) AfterSave(tx *gorm.DB) error {
	return syncSettingRelationshipRelations(tx, item)
}

func syncSettingRelationshipRelations(tx *gorm.DB, item *SettingRelationship) error {
	if err := deleteMetadataEntityRelations(tx, "setting_relationship_id", item.ID); err != nil {
		return err
	}
	relationType := strings.TrimSpace(item.Type)
	if relationType == "" {
		relationType = EntityRelationTypeRelatedTo
	}
	category := strings.TrimSpace(item.Category)
	if category == "" {
		category = "relationship"
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "setting",
		SourceID:     item.SourceSettingID,
		TargetType:   "setting",
		TargetID:     item.TargetSettingID,
		Category:     category,
		Type:         relationType,
		Label:        item.Label,
		ScopeType:    "script",
		ScopeID:      item.ScopeScriptID,
		Status:       EntityRelationStatusConfirmed,
		Source:       relationSource(item.Source),
		Evidence:     item.Description,
		MetadataJSON: relationMetadata(map[string]any{"setting_relationship_id": item.ID}),
	}})
}

func (item *SettingRelationship) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "setting_relationship_id", item.ID)
}
