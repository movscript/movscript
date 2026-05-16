package relation

import (
	"strings"

	"gorm.io/gorm"
)

func assetOwnerRelationType(slot AssetSlot) string {
	switch strings.TrimSpace(slot.Status) {
	case "locked", "selected", "approved", "final":
		return EntityRelationTypeUsesAsset
	default:
		if slot.ResourceID != nil || slot.LockedAssetSlotID != nil {
			return EntityRelationTypeUsesAsset
		}
		return EntityRelationTypeNeedsAsset
	}
}

func assetOwnerRelationTypes(slot AssetSlot) []string {
	return []string{EntityRelationTypeNeedsAsset, EntityRelationTypeUsesAsset}
}

func syncAssetSlotRelations(tx *gorm.DB, item *AssetSlot) error {
	if err := deleteTargetEntityRelations(tx, "asset_slot", item.ID, EntityRelationCategoryAsset, relationTypeList(EntityRelationTypeHasAsset, EntityRelationTypeNeedsAsset, EntityRelationTypeUsesAsset)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "asset_slot", item.ID, EntityRelationCategoryAsset, relationTypeList(EntityRelationTypeUsesResource, EntityRelationTypeLocks)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 6)
	if item.CreativeReferenceID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "creative_reference",
			SourceID:   *item.CreativeReferenceID,
			TargetType: "asset_slot",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryAsset,
			Type:       EntityRelationTypeHasAsset,
			Label:      item.SlotKey,
			Status:     relationStatus(item.Status),
		})
	}
	if item.CreativeReferenceStateID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "creative_reference_state",
			SourceID:   *item.CreativeReferenceStateID,
			TargetType: "asset_slot",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryAsset,
			Type:       EntityRelationTypeHasAsset,
			Label:      item.SlotKey,
			Status:     relationStatus(item.Status),
		})
	}
	if item.OwnerID != nil && strings.TrimSpace(item.OwnerType) != "" {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: item.OwnerType,
			SourceID:   *item.OwnerID,
			TargetType: "asset_slot",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryAsset,
			Type:       assetOwnerRelationType(*item),
			Label:      item.SlotKey,
			Status:     relationStatus(item.Status),
			MetadataJSON: relationMetadata(map[string]any{
				"asset_slot_id": item.ID,
				"status":        item.Status,
				"kind":          item.Kind,
			}),
		})
	}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "asset_slot",
			SourceID:   item.ID,
			TargetType: "raw_resource",
			TargetID:   *item.ResourceID,
			Category:   EntityRelationCategoryAsset,
			Type:       EntityRelationTypeUsesResource,
			Status:     relationStatus(item.Status),
		})
	}
	if item.LockedAssetSlotID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "asset_slot",
			SourceID:   item.ID,
			TargetType: "asset_slot",
			TargetID:   *item.LockedAssetSlotID,
			Category:   EntityRelationCategoryAsset,
			Type:       EntityRelationTypeLocks,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncAssetSlotCandidateRelations(tx *gorm.DB, item *AssetSlotCandidate) error {
	if err := deleteMetadataEntityRelations(tx, "asset_slot_candidate_id", item.ID); err != nil {
		return err
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:    item.ProjectID,
			SourceType:   "asset_slot",
			SourceID:     item.CandidateAssetSlotID,
			TargetType:   "asset_slot",
			TargetID:     item.AssetSlotID,
			Category:     EntityRelationCategoryAsset,
			Type:         EntityRelationTypeCandidateFor,
			Weight:       item.Score,
			Status:       relationStatus(item.Status),
			Source:       relationSource(item.SourceType),
			Evidence:     item.Note,
			MetadataJSON: relationMetadata(map[string]any{"asset_slot_candidate_id": item.ID, "source_id": item.SourceID}),
		}},
	)
}

func syncResourceBindingRelations(tx *gorm.DB, item *ResourceBinding) error {
	relationType := EntityRelationTypeUsesResource
	if item.OwnerType != "asset_slot" {
		relationType = EntityRelationTypeUsesResource
	}
	if err := deleteMetadataEntityRelations(tx, "resource_binding_id", item.ID); err != nil {
		return err
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:    item.ProjectID,
			SourceType:   item.OwnerType,
			SourceID:     item.OwnerID,
			TargetType:   "raw_resource",
			TargetID:     item.ResourceID,
			Category:     EntityRelationCategoryAsset,
			Type:         relationType,
			Label:        item.Role,
			Order:        item.SortOrder,
			Status:       relationStatus(item.Status),
			Source:       relationSource(item.SourceType),
			MetadataJSON: relationMetadata(map[string]any{"resource_binding_id": item.ID, "role": item.Role, "slot": item.Slot, "version": item.Version}),
			CreatedByID:  item.CreatedByID,
		}},
	)
}
