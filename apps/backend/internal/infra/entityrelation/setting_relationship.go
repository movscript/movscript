package entityrelation

import (
	"strings"

	"gorm.io/gorm"
)

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
