package model

import (
	"strings"

	"gorm.io/gorm"
)

func (item *CreativeReference) AfterSave(tx *gorm.DB) error {
	return syncCreativeReferenceRelations(tx, item)
}

func syncCreativeReferenceRelations(tx *gorm.DB, item *CreativeReference) error {
	if err := deleteTargetEntityRelations(tx, "creative_reference", item.ID, EntityRelationCategoryCreative, relationTypeList(EntityRelationTypeOwns)); err != nil {
		return err
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:  item.ProjectID,
			SourceType: "project",
			SourceID:   item.ProjectID,
			TargetType: "creative_reference",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryCreative,
			Type:       EntityRelationTypeOwns,
			Status:     relationStatus(item.Status),
		}},
	)
}

func (item *CreativeReference) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "creative_reference", item.ID)
}

func (item *CreativeReferenceState) AfterSave(tx *gorm.DB) error {
	return syncCreativeReferenceStateRelations(tx, item)
}

func syncCreativeReferenceStateRelations(tx *gorm.DB, item *CreativeReferenceState) error {
	if err := deleteTargetEntityRelations(tx, "creative_reference_state", item.ID, EntityRelationCategoryCreative, relationTypeList("has_state")); err != nil {
		return err
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "creative_reference",
		SourceID:   item.CreativeReferenceID,
		TargetType: "creative_reference_state",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryCreative,
		Type:       "has_state",
		ScopeType:  item.ScopeType,
		ScopeID:    item.ScopeID,
		Status:     relationStatus(item.Status),
	}})
}

func (item *CreativeReferenceState) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "creative_reference_state", item.ID)
}

func (item *CreativeReferenceUsage) AfterSave(tx *gorm.DB) error {
	return syncCreativeReferenceUsageRelations(tx, item)
}

func syncCreativeReferenceUsageRelations(tx *gorm.DB, item *CreativeReferenceUsage) error {
	if err := deleteMetadataEntityRelations(tx, "creative_reference_usage_id", item.ID); err != nil {
		return err
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:    item.ProjectID,
			SourceType:   item.OwnerType,
			SourceID:     item.OwnerID,
			TargetType:   "creative_reference",
			TargetID:     item.CreativeReferenceID,
			Category:     EntityRelationCategoryCreative,
			Type:         EntityRelationTypeUses,
			Label:        item.Role,
			Order:        item.Order,
			Status:       relationStatus(item.Status),
			Source:       relationSource(item.Source),
			Evidence:     item.Evidence,
			MetadataJSON: relationMetadata(map[string]any{"creative_reference_usage_id": item.ID, "role": item.Role, "creative_reference_state_id": item.CreativeReferenceStateID}),
		}},
	)
}

func (item *CreativeReferenceUsage) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "creative_reference_usage_id", item.ID)
}

func (item *CreativeRelationship) AfterSave(tx *gorm.DB) error {
	return syncCreativeRelationshipRelations(tx, item)
}

func syncCreativeRelationshipRelations(tx *gorm.DB, item *CreativeRelationship) error {
	relationType := strings.TrimSpace(item.Type)
	if relationType == "" {
		relationType = EntityRelationTypeRelatedTo
	}
	category := strings.TrimSpace(item.Category)
	if category == "" || category == "relationship" {
		category = EntityRelationCategoryCreative
	}
	if err := deleteMetadataEntityRelations(tx, "creative_relationship_id", item.ID); err != nil {
		return err
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:    item.ProjectID,
			SourceType:   "creative_reference",
			SourceID:     item.SourceCreativeReferenceID,
			TargetType:   "creative_reference",
			TargetID:     item.TargetCreativeReferenceID,
			Category:     category,
			Type:         relationType,
			Label:        item.Label,
			ScopeType:    item.ScopeType,
			ScopeID:      item.ScopeID,
			Status:       relationStatus(item.Status),
			Source:       relationSource(item.Source),
			Evidence:     item.Evidence,
			MetadataJSON: relationMetadata(map[string]any{"creative_relationship_id": item.ID, "description": item.Description}),
		}},
	)
}

func (item *CreativeRelationship) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "creative_relationship_id", item.ID)
}
