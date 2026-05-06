package entityrelation

import (
	"strings"

	"gorm.io/gorm"
)

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

func syncCreativeReferenceStateRelations(tx *gorm.DB, item *CreativeReferenceState) error {
	if err := deleteTargetEntityRelations(tx, "creative_reference_state", item.ID, EntityRelationCategoryCreative, relationTypeList(EntityRelationTypeHasState)); err != nil {
		return err
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "creative_reference",
		SourceID:   item.CreativeReferenceID,
		TargetType: "creative_reference_state",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryCreative,
		Type:       EntityRelationTypeHasState,
		ScopeType:  item.ScopeType,
		ScopeID:    item.ScopeID,
		Status:     relationStatus(item.Status),
	}})
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
