package entityrelation

import "gorm.io/gorm"

func syncScriptSettingRefRelations(tx *gorm.DB, item *ScriptSettingRef) error {
	if err := deleteMetadataEntityRelations(tx, "script_setting_ref_id", item.ID); err != nil {
		return err
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "script",
		SourceID:     item.ScriptID,
		TargetType:   "setting",
		TargetID:     item.SettingID,
		Category:     EntityRelationCategorySetting,
		Type:         EntityRelationTypeUses,
		Label:        item.Role,
		ScopeType:    item.Scope,
		Order:        item.Order,
		Weight:       item.Confidence,
		Status:       relationStatus(item.State),
		Source:       relationSource(item.Source),
		Evidence:     item.Evidence,
		MetadataJSON: relationMetadata(map[string]any{"script_setting_ref_id": item.ID, "first_mention": item.FirstMention, "emotion": item.Emotion, "purpose": item.Purpose}),
	}})
}
