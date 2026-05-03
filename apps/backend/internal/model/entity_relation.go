package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

const (
	EntityRelationCategoryStructure = "structure"
	EntityRelationCategoryCreative  = "creative"
	EntityRelationCategoryAsset     = "asset"
	EntityRelationCategoryWorkflow  = "workflow"
	EntityRelationCategoryDelivery  = "delivery"

	EntityRelationTypeOwns         = "owns"
	EntityRelationTypeContains     = "contains"
	EntityRelationTypeUses         = "uses"
	EntityRelationTypeHasVersion   = "has_version"
	EntityRelationTypeDerivedFrom  = "derived_from"
	EntityRelationTypeUsesPreview  = "uses_preview"
	EntityRelationTypeHasAsset     = "has_asset"
	EntityRelationTypeNeedsAsset   = "needs_asset"
	EntityRelationTypeUsesAsset    = "uses_asset"
	EntityRelationTypeUsesResource = "uses_resource"
	EntityRelationTypeBasedOn      = "based_on"
	EntityRelationTypeRepresents   = "represents"
	EntityRelationTypeHasKeyframe  = "has_keyframe"
	EntityRelationTypeCompilesTo   = "compiles_to"
	EntityRelationTypeCandidateFor = "candidate_for"
	EntityRelationTypeLocks        = "locks"
	EntityRelationTypeRelatedTo    = "related_to"
	EntityRelationTypeTargets      = "targets"
	EntityRelationTypeBlocks       = "blocks"
	EntityRelationTypeDependsOn    = "depends_on"
	EntityRelationTypeProduces     = "produces"
	EntityRelationTypeDecides      = "decides"
	EntityRelationTypeAppliesTo    = "applies_to"
	EntityRelationTypeReviews      = "reviews"
	EntityRelationTypeAttachedTo   = "attached_to"
	EntityRelationTypeExports      = "exports"

	EntityRelationStatusConfirmed = "confirmed"
	EntityRelationSourceSystem    = "system"
	EntityRelationSourceMigration = "migration"
)

// EntityRelation is the normalized semantic relation graph between project
// entities. Hard ownership foreign keys can stay on source tables; this table
// records the business meaning of those links.
type EntityRelation struct {
	gorm.Model
	ProjectID uint `gorm:"not null;index:idx_entity_relation_project_type" json:"project_id"`

	SourceType string `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_unique,unique" json:"source_type"`
	SourceID   uint   `gorm:"not null;index:idx_entity_relation_source;index:idx_entity_relation_unique,unique" json:"source_id"`
	TargetType string `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_unique,unique" json:"target_type"`
	TargetID   uint   `gorm:"not null;index:idx_entity_relation_target;index:idx_entity_relation_unique,unique" json:"target_id"`

	Category string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_unique,unique" json:"category"`
	Type     string `gorm:"not null;index:idx_entity_relation_project_type;index:idx_entity_relation_unique,unique" json:"type"`
	Label    string `json:"label"`

	ScopeType string `gorm:"index;index:idx_entity_relation_unique,unique" json:"scope_type"`
	ScopeID   *uint  `gorm:"index;index:idx_entity_relation_unique,unique" json:"scope_id,omitempty"`

	Direction string  `gorm:"not null;default:'directed';index" json:"direction"`
	Order     int     `gorm:"not null;default:0;index" json:"order"`
	Weight    float64 `gorm:"not null;default:1" json:"weight"`

	Status string `gorm:"not null;default:'confirmed';index" json:"status"`
	Source string `gorm:"not null;default:'system';index" json:"source"`

	Evidence     string `gorm:"type:text" json:"evidence"`
	MetadataJSON string `gorm:"type:text" json:"metadata_json"`
	CreatedByID  *uint  `gorm:"index" json:"created_by_id,omitempty"`
}

type entityRelationSeed struct {
	ProjectID    uint
	SourceType   string
	SourceID     uint
	TargetType   string
	TargetID     uint
	Category     string
	Type         string
	Label        string
	ScopeType    string
	ScopeID      *uint
	Order        int
	Weight       float64
	Status       string
	Source       string
	Evidence     string
	MetadataJSON string
	CreatedByID  *uint
}

type relationOwner struct {
	sourceType string
	sourceID   uint
	category   string
	types      []string
}

// SyncCoreEntityRelations rebuilds normalized relations for one core semantic
// entity using the entity's current database state. It is safe to call after
// Create, Updates, or Save.
func SyncCoreEntityRelations(db *gorm.DB, item any) error {
	if db == nil || item == nil {
		return nil
	}
	switch v := item.(type) {
	case *ScriptVersion:
		var current ScriptVersion
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncScriptVersionRelations(db, &current)
	case *Production:
		var current Production
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncProductionRelations(db, &current)
	case *ProductionTextBlock:
		var current ProductionTextBlock
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncProductionTextBlockRelations(db, &current)
	case *CreativeReference:
		var current CreativeReference
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCreativeReferenceRelations(db, &current)
	case *CreativeReferenceState:
		var current CreativeReferenceState
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCreativeReferenceStateRelations(db, &current)
	case *CreativeReferenceUsage:
		var current CreativeReferenceUsage
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCreativeReferenceUsageRelations(db, &current)
	case *CreativeRelationship:
		var current CreativeRelationship
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCreativeRelationshipRelations(db, &current)
	case *Segment:
		var current Segment
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncSegmentRelations(db, &current)
	case *SceneMoment:
		var current SceneMoment
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncSceneMomentRelations(db, &current)
	case *ContentUnit:
		var current ContentUnit
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncContentUnitRelations(db, &current)
	case *AssetSlot:
		var current AssetSlot
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncAssetSlotRelations(db, &current)
	case *StoryboardScript:
		var current StoryboardScript
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncStoryboardScriptRelations(db, &current)
	case *StoryboardVersion:
		var current StoryboardVersion
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncStoryboardVersionRelations(db, &current)
	case *StoryboardLine:
		var current StoryboardLine
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncStoryboardLineRelations(db, &current)
	case *Keyframe:
		var current Keyframe
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncKeyframeRelations(db, &current)
	case *PreviewTimeline:
		var current PreviewTimeline
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncPreviewTimelineRelations(db, &current)
	case *PreviewTimelineItem:
		var current PreviewTimelineItem
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncPreviewTimelineItemRelations(db, &current)
	case *AssetSlotCandidate:
		var current AssetSlotCandidate
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncAssetSlotCandidateRelations(db, &current)
	case *CandidateDecision:
		var current CandidateDecision
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCandidateDecisionRelations(db, &current)
	case *ReviewEvent:
		var current ReviewEvent
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncReviewEventRelations(db, &current)
	case *WorkItem:
		var current WorkItem
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncWorkItemRelations(db, &current)
	case *WorkDependency:
		var current WorkDependency
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncWorkDependencyRelations(db, &current)
	case *DeliveryVersion:
		var current DeliveryVersion
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncDeliveryVersionRelations(db, &current)
	case *DeliveryTimelineItem:
		var current DeliveryTimelineItem
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncDeliveryTimelineItemRelations(db, &current)
	case *ExportRecord:
		var current ExportRecord
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncExportRecordRelations(db, &current)
	case *Canvas:
		var current Canvas
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCanvasRelations(db, &current)
	case *CanvasRun:
		var current CanvasRun
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCanvasRunRelations(db, &current)
	case *CanvasOutput:
		var current CanvasOutput
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncCanvasOutputRelations(db, &current)
	case *ResourceBinding:
		var current ResourceBinding
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncResourceBindingRelations(db, &current)
	default:
		return nil
	}
}

func DeleteCoreEntityRelations(db *gorm.DB, item any) error {
	if db == nil || item == nil {
		return nil
	}
	switch v := item.(type) {
	case *ScriptVersion:
		return deleteEntityRelations(db, "script_version", v.ID)
	case *Production:
		return deleteEntityRelations(db, "production", v.ID)
	case *ProductionTextBlock:
		return deleteEntityRelations(db, "production_text_block", v.ID)
	case *CreativeReference:
		return deleteEntityRelations(db, "creative_reference", v.ID)
	case *CreativeReferenceState:
		return deleteEntityRelations(db, "creative_reference_state", v.ID)
	case *CreativeReferenceUsage:
		return deleteMetadataEntityRelations(db, "creative_reference_usage_id", v.ID)
	case *CreativeRelationship:
		return deleteMetadataEntityRelations(db, "creative_relationship_id", v.ID)
	case *Segment:
		return deleteEntityRelations(db, "segment", v.ID)
	case *SceneMoment:
		return deleteEntityRelations(db, "scene_moment", v.ID)
	case *ContentUnit:
		return deleteEntityRelations(db, "content_unit", v.ID)
	case *AssetSlot:
		return deleteEntityRelations(db, "asset_slot", v.ID)
	case *StoryboardScript:
		return deleteEntityRelations(db, "storyboard_script", v.ID)
	case *StoryboardVersion:
		return deleteEntityRelations(db, "storyboard_version", v.ID)
	case *StoryboardLine:
		return deleteEntityRelations(db, "storyboard_line", v.ID)
	case *Keyframe:
		return deleteEntityRelations(db, "keyframe", v.ID)
	case *PreviewTimeline:
		return deleteEntityRelations(db, "preview_timeline", v.ID)
	case *PreviewTimelineItem:
		return deleteEntityRelations(db, "preview_timeline_item", v.ID)
	case *AssetSlotCandidate:
		return deleteMetadataEntityRelations(db, "asset_slot_candidate_id", v.ID)
	case *CandidateDecision:
		return deleteEntityRelations(db, "candidate_decision", v.ID)
	case *ReviewEvent:
		return deleteEntityRelations(db, "review_event", v.ID)
	case *WorkItem:
		return deleteEntityRelations(db, "work_item", v.ID)
	case *WorkDependency:
		return deleteMetadataEntityRelations(db, "work_dependency_id", v.ID)
	case *DeliveryVersion:
		return deleteEntityRelations(db, "delivery_version", v.ID)
	case *DeliveryTimelineItem:
		return deleteEntityRelations(db, "delivery_timeline_item", v.ID)
	case *ExportRecord:
		return deleteEntityRelations(db, "export_record", v.ID)
	case *Canvas:
		return deleteEntityRelations(db, "canvas", v.ID)
	case *CanvasRun:
		return deleteEntityRelations(db, "canvas_run", v.ID)
	case *CanvasOutput:
		return deleteEntityRelations(db, "canvas_output", v.ID)
	case *ResourceBinding:
		return deleteMetadataEntityRelations(db, "resource_binding_id", v.ID)
	default:
		return nil
	}
}

func (s entityRelationSeed) relation() EntityRelation {
	weight := s.Weight
	if weight == 0 {
		weight = 1
	}
	status := strings.TrimSpace(s.Status)
	if status == "" {
		status = EntityRelationStatusConfirmed
	}
	source := strings.TrimSpace(s.Source)
	if source == "" {
		source = EntityRelationSourceSystem
	}
	return EntityRelation{
		ProjectID:    s.ProjectID,
		SourceType:   strings.TrimSpace(s.SourceType),
		SourceID:     s.SourceID,
		TargetType:   strings.TrimSpace(s.TargetType),
		TargetID:     s.TargetID,
		Category:     strings.TrimSpace(s.Category),
		Type:         strings.TrimSpace(s.Type),
		Label:        strings.TrimSpace(s.Label),
		ScopeType:    strings.TrimSpace(s.ScopeType),
		ScopeID:      s.ScopeID,
		Direction:    "directed",
		Order:        s.Order,
		Weight:       weight,
		Status:       status,
		Source:       source,
		Evidence:     s.Evidence,
		MetadataJSON: s.MetadataJSON,
		CreatedByID:  s.CreatedByID,
	}
}

func syncEntityRelations(tx *gorm.DB, owners []relationOwner, seeds []entityRelationSeed) error {
	if tx == nil {
		return nil
	}
	for _, owner := range owners {
		if owner.sourceType == "" || owner.sourceID == 0 || owner.category == "" || len(owner.types) == 0 {
			continue
		}
		if err := tx.Where(
			"source_type = ? AND source_id = ? AND category = ? AND type IN ?",
			owner.sourceType, owner.sourceID, owner.category, owner.types,
		).Unscoped().Delete(&EntityRelation{}).Error; err != nil {
			return err
		}
	}
	for _, seed := range seeds {
		if seed.ProjectID == 0 || seed.SourceType == "" || seed.SourceID == 0 || seed.TargetType == "" || seed.TargetID == 0 || seed.Category == "" || seed.Type == "" {
			continue
		}
		relation := seed.relation()
		err := tx.Where(
			"project_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND category = ? AND type = ? AND scope_type = ? AND ((scope_id IS NULL AND ? IS NULL) OR scope_id = ?)",
			relation.ProjectID, relation.SourceType, relation.SourceID, relation.TargetType, relation.TargetID,
			relation.Category, relation.Type, relation.ScopeType, relation.ScopeID, relation.ScopeID,
		).Assign(relation).FirstOrCreate(&relation).Error
		if err != nil {
			return err
		}
	}
	return nil
}

func deleteEntityRelations(tx *gorm.DB, entityType string, entityID uint) error {
	if tx == nil || entityType == "" || entityID == 0 {
		return nil
	}
	return tx.Where(
		"(source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)",
		entityType, entityID, entityType, entityID,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteSourceEntityRelations(tx *gorm.DB, sourceType string, sourceID uint, category string, types []string) error {
	if tx == nil || sourceType == "" || sourceID == 0 || category == "" || len(types) == 0 {
		return nil
	}
	return tx.Where(
		"source_type = ? AND source_id = ? AND category = ? AND type IN ?",
		sourceType, sourceID, category, types,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteTargetEntityRelations(tx *gorm.DB, targetType string, targetID uint, category string, types []string) error {
	if tx == nil || targetType == "" || targetID == 0 || category == "" || len(types) == 0 {
		return nil
	}
	return tx.Where(
		"target_type = ? AND target_id = ? AND category = ? AND type IN ?",
		targetType, targetID, category, types,
	).Unscoped().Delete(&EntityRelation{}).Error
}

func deleteMetadataEntityRelations(tx *gorm.DB, marker string, id uint) error {
	if tx == nil || marker == "" || id == 0 {
		return nil
	}
	return tx.Where("metadata_json LIKE ?", fmt.Sprintf("%%%q:%d%%", marker, id)).Unscoped().Delete(&EntityRelation{}).Error
}

func relationMetadata(values map[string]any) string {
	if len(values) == 0 {
		return ""
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return ""
	}
	return string(raw)
}

func relationSource(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return EntityRelationSourceSystem
	}
	return source
}

func relationStatus(status string) string {
	status = strings.TrimSpace(status)
	switch status {
	case "", "active", "locked", "selected", "approved", "confirmed":
		return EntityRelationStatusConfirmed
	case "ignored", "rejected", "archived":
		return status
	default:
		return status
	}
}

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

func relationTypeList(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	return out
}

func (item *CreativeReference) AfterSave(tx *gorm.DB) error {
	return syncCreativeReferenceRelations(tx, item)
}

func (item *ScriptVersion) AfterSave(tx *gorm.DB) error {
	return syncScriptVersionRelations(tx, item)
}

func syncScriptVersionRelations(tx *gorm.DB, item *ScriptVersion) error {
	if err := deleteTargetEntityRelations(tx, "script_version", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasVersion, EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "script",
		SourceID:   item.ScriptID,
		TargetType: "script_version",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeHasVersion,
		Order:      item.VersionNumber,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "script_version",
			SourceID:   item.ID,
			TargetType: "script_version",
			TargetID:   *item.ParentVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Order:      item.VersionNumber,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *ScriptVersion) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "script_version", item.ID)
}

func (item *Production) AfterSave(tx *gorm.DB) error {
	return syncProductionRelations(tx, item)
}

func syncProductionRelations(tx *gorm.DB, item *Production) error {
	if err := deleteSourceEntityRelations(tx, "production", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeDerivedFrom, EntityRelationTypeUsesPreview)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ScriptVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   item.ID,
			TargetType: "script_version",
			TargetID:   *item.ScriptVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Status:     relationStatus(item.Status),
		})
	}
	if item.PreviewTimelineID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   item.ID,
			TargetType: "preview_timeline",
			TargetID:   *item.PreviewTimelineID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeUsesPreview,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *Production) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "production", item.ID)
}

func (item *ProductionTextBlock) AfterSave(tx *gorm.DB) error {
	return syncProductionTextBlockRelations(tx, item)
}

func syncProductionTextBlockRelations(tx *gorm.DB, item *ProductionTextBlock) error {
	if err := deleteTargetEntityRelations(tx, "production_text_block", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "production",
		SourceID:   item.ProductionID,
		TargetType: "production_text_block",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeContains,
		Order:      item.Order,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production_text_block",
			SourceID:   *item.ParentBlockID,
			TargetType: "production_text_block",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *ProductionTextBlock) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "production_text_block", item.ID)
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

func (item *Segment) AfterSave(tx *gorm.DB) error {
	return syncSegmentRelations(tx, item)
}

func syncSegmentRelations(tx *gorm.DB, item *Segment) error {
	if err := deleteTargetEntityRelations(tx, "segment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   *item.ProductionID,
			TargetType: "segment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.ParentSegmentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.ParentSegmentID,
			TargetType: "segment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx,
		nil,
		seeds,
	)
}

func (item *Segment) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "segment", item.ID)
}

func (item *SceneMoment) AfterSave(tx *gorm.DB) error {
	return syncSceneMomentRelations(tx, item)
}

func syncSceneMomentRelations(tx *gorm.DB, item *SceneMoment) error {
	if err := deleteTargetEntityRelations(tx, "scene_moment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if item.SegmentID == nil {
		return nil
	}
	return syncEntityRelations(tx,
		nil,
		[]entityRelationSeed{{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.SegmentID,
			TargetType: "scene_moment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		}},
	)
}

func (item *SceneMoment) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "scene_moment", item.ID)
}

func (item *ContentUnit) AfterSave(tx *gorm.DB) error {
	return syncContentUnitRelations(tx, item)
}

func syncContentUnitRelations(tx *gorm.DB, item *ContentUnit) error {
	if err := deleteTargetEntityRelations(tx, "content_unit", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "content_unit", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.SegmentID,
			TargetType: "content_unit",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "content_unit",
			SourceID:   item.ID,
			TargetType: "scene_moment",
			TargetID:   *item.SceneMomentID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeBasedOn,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx,
		nil,
		seeds,
	)
}

func (item *ContentUnit) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "content_unit", item.ID)
}

func (item *AssetSlot) AfterSave(tx *gorm.DB) error {
	return syncAssetSlotRelations(tx, item)
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

func (item *AssetSlot) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "asset_slot", item.ID)
}

func (item *StoryboardScript) AfterSave(tx *gorm.DB) error {
	return syncStoryboardScriptRelations(tx, item)
}

func syncStoryboardScriptRelations(tx *gorm.DB, item *StoryboardScript) error {
	if err := deleteSourceEntityRelations(tx, "storyboard_script", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	if item.ScriptVersionID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.ID,
		TargetType: "script_version",
		TargetID:   *item.ScriptVersionID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeBasedOn,
		Status:     relationStatus(item.Status),
	}})
}

func (item *StoryboardScript) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "storyboard_script", item.ID)
}

func (item *StoryboardVersion) AfterSave(tx *gorm.DB) error {
	return syncStoryboardVersionRelations(tx, item)
}

func syncStoryboardVersionRelations(tx *gorm.DB, item *StoryboardVersion) error {
	if err := deleteTargetEntityRelations(tx, "storyboard_version", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasVersion, EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.StoryboardScriptID,
		TargetType: "storyboard_version",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeHasVersion,
		Order:      item.VersionNumber,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "storyboard_version",
			SourceID:   item.ID,
			TargetType: "storyboard_version",
			TargetID:   *item.ParentVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Order:      item.VersionNumber,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *StoryboardVersion) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "storyboard_version", item.ID)
}

func (item *StoryboardLine) AfterSave(tx *gorm.DB) error {
	return syncStoryboardLineRelations(tx, item)
}

func syncStoryboardLineRelations(tx *gorm.DB, item *StoryboardLine) error {
	if err := deleteTargetEntityRelations(tx, "storyboard_line", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "storyboard_line", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn, EntityRelationTypeCompilesTo)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.StoryboardScriptID,
		TargetType: "storyboard_line",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeContains,
		Order:      item.Order,
		Status:     relationStatus(item.Status),
	}}
	if item.StoryboardVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "storyboard_version",
			SourceID:   *item.StoryboardVersionID,
			TargetType: "storyboard_line",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "storyboard_line", SourceID: item.ID, TargetType: "segment", TargetID: *item.SegmentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeBasedOn, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "storyboard_line", SourceID: item.ID, TargetType: "scene_moment", TargetID: *item.SceneMomentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeBasedOn, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *StoryboardLine) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "storyboard_line", item.ID)
}

func (item *Keyframe) AfterSave(tx *gorm.DB) error {
	return syncKeyframeRelations(tx, item)
}

func syncKeyframeRelations(tx *gorm.DB, item *Keyframe) error {
	if err := deleteTargetEntityRelations(tx, "keyframe", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasKeyframe)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "keyframe", item.ID, EntityRelationCategoryAsset, relationTypeList(EntityRelationTypeUsesResource)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 3)
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "scene_moment", SourceID: *item.SceneMomentID, TargetType: "keyframe", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeHasKeyframe, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "content_unit", SourceID: *item.ContentUnitID, TargetType: "keyframe", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeHasKeyframe, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "keyframe", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryAsset, Type: EntityRelationTypeUsesResource, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *Keyframe) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "keyframe", item.ID)
}

func (item *PreviewTimeline) AfterSave(tx *gorm.DB) error {
	return syncPreviewTimelineRelations(tx, item)
}

func syncPreviewTimelineRelations(tx *gorm.DB, item *PreviewTimeline) error {
	if err := deleteSourceEntityRelations(tx, "preview_timeline", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.ID, TargetType: "production", TargetID: *item.ProductionID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	if item.ScriptVersionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.ID, TargetType: "script_version", TargetID: *item.ScriptVersionID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *PreviewTimeline) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "preview_timeline", item.ID)
}

func (item *PreviewTimelineItem) AfterSave(tx *gorm.DB) error {
	return syncPreviewTimelineItemRelations(tx, item)
}

func syncPreviewTimelineItemRelations(tx *gorm.DB, item *PreviewTimelineItem) error {
	if err := deleteTargetEntityRelations(tx, "preview_timeline_item", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "preview_timeline_item", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeRepresents, EntityRelationTypeUses)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.PreviewTimelineID, TargetType: "preview_timeline_item", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeContains, Order: item.Order, Status: relationStatus(item.Status)}}
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "segment", TargetID: *item.SegmentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "scene_moment", TargetID: *item.SceneMomentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "content_unit", TargetID: *item.ContentUnitID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.KeyframeID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "keyframe", TargetID: *item.KeyframeID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *PreviewTimelineItem) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "preview_timeline_item", item.ID)
}

func (item *AssetSlotCandidate) AfterSave(tx *gorm.DB) error {
	return syncAssetSlotCandidateRelations(tx, item)
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

func (item *AssetSlotCandidate) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "asset_slot_candidate_id", item.ID)
}

func (item *ResourceBinding) AfterSave(tx *gorm.DB) error {
	return syncResourceBindingRelations(tx, item)
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

func (item *ResourceBinding) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "resource_binding_id", item.ID)
}

func (item *CandidateDecision) AfterSave(tx *gorm.DB) error {
	return syncCandidateDecisionRelations(tx, item)
}

func syncCandidateDecisionRelations(tx *gorm.DB, item *CandidateDecision) error {
	if err := deleteSourceEntityRelations(tx, "candidate_decision", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeDecides, EntityRelationTypeAppliesTo)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.CandidateID != nil && item.CandidateType != "" {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "candidate_decision", SourceID: item.ID, TargetType: item.CandidateType, TargetID: *item.CandidateID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeDecides, Label: item.Decision, Status: relationStatus(item.Status), Source: relationSource(item.Source), Evidence: item.Reason})
	}
	if item.TargetID != nil && item.TargetType != "" {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "candidate_decision", SourceID: item.ID, TargetType: item.TargetType, TargetID: *item.TargetID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAppliesTo, Label: item.Decision, Status: relationStatus(item.Status), Source: relationSource(item.Source), Evidence: item.Note})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *CandidateDecision) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "candidate_decision", item.ID)
}

func (item *ReviewEvent) AfterSave(tx *gorm.DB) error {
	return syncReviewEventRelations(tx, item)
}

func syncReviewEventRelations(tx *gorm.DB, item *ReviewEvent) error {
	if err := deleteSourceEntityRelations(tx, "review_event", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeReviews)); err != nil {
		return err
	}
	if item.SubjectID == nil || item.SubjectType == "" {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "review_event",
		SourceID:     item.ID,
		TargetType:   item.SubjectType,
		TargetID:     *item.SubjectID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         EntityRelationTypeReviews,
		Label:        item.EventType,
		Status:       relationStatus(item.ToStatus),
		Source:       relationSource(item.Source),
		Evidence:     item.Comment,
		MetadataJSON: relationMetadata(map[string]any{"from_status": item.FromStatus, "to_status": item.ToStatus, "reason": item.Reason}),
	}})
}

func (item *ReviewEvent) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "review_event", item.ID)
}

func (item *WorkItem) AfterSave(tx *gorm.DB) error {
	return syncWorkItemRelations(tx, item)
}

func syncWorkItemRelations(tx *gorm.DB, item *WorkItem) error {
	if err := deleteSourceEntityRelations(tx, "work_item", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeTargets, EntityRelationTypeProduces)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "work_item",
		SourceID:     item.ID,
		TargetType:   item.TargetType,
		TargetID:     item.TargetID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         EntityRelationTypeTargets,
		Label:        item.Kind,
		Status:       relationStatus(item.Status),
		MetadataJSON: relationMetadata(map[string]any{"priority": item.Priority, "result_type": item.ResultType}),
	}}
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "production", SourceID: *item.ProductionID, TargetType: "work_item", TargetID: item.ID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeContains, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *WorkItem) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "work_item", item.ID)
}

func (item *WorkDependency) AfterSave(tx *gorm.DB) error {
	return syncWorkDependencyRelations(tx, item)
}

func syncWorkDependencyRelations(tx *gorm.DB, item *WorkDependency) error {
	if err := deleteMetadataEntityRelations(tx, "work_dependency_id", item.ID); err != nil {
		return err
	}
	relationType := EntityRelationTypeDependsOn
	if strings.TrimSpace(item.DependencyType) == "blocks" {
		relationType = EntityRelationTypeBlocks
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "work_item",
		SourceID:     item.DependsOnWorkItemID,
		TargetType:   "work_item",
		TargetID:     item.WorkItemID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         relationType,
		Label:        item.DependencyType,
		Status:       EntityRelationStatusConfirmed,
		MetadataJSON: relationMetadata(map[string]any{"work_dependency_id": item.ID}),
	}})
}

func (item *WorkDependency) AfterDelete(tx *gorm.DB) error {
	return deleteMetadataEntityRelations(tx, "work_dependency_id", item.ID)
}

func (item *DeliveryVersion) AfterSave(tx *gorm.DB) error {
	return syncDeliveryVersionRelations(tx, item)
}

func syncDeliveryVersionRelations(tx *gorm.DB, item *DeliveryVersion) error {
	if err := deleteSourceEntityRelations(tx, "delivery_version", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.ID, TargetType: "production", TargetID: *item.ProductionID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	if item.PreviewTimelineID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.ID, TargetType: "preview_timeline", TargetID: *item.PreviewTimelineID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *DeliveryVersion) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "delivery_version", item.ID)
}

func (item *DeliveryTimelineItem) AfterSave(tx *gorm.DB) error {
	return syncDeliveryTimelineItemRelations(tx, item)
}

func syncDeliveryTimelineItemRelations(tx *gorm.DB, item *DeliveryTimelineItem) error {
	if err := deleteTargetEntityRelations(tx, "delivery_timeline_item", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "delivery_timeline_item", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeUses, EntityRelationTypeUsesResource)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.DeliveryVersionID, TargetType: "delivery_timeline_item", TargetID: item.ID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeContains, Order: item.Order, Status: relationStatus(item.Status)}}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "content_unit", TargetID: *item.ContentUnitID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.AssetSlotID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "asset_slot", TargetID: *item.AssetSlotID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUsesResource, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *DeliveryTimelineItem) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "delivery_timeline_item", item.ID)
}

func (item *ExportRecord) AfterSave(tx *gorm.DB) error {
	return syncExportRecordRelations(tx, item)
}

func syncExportRecordRelations(tx *gorm.DB, item *ExportRecord) error {
	if err := deleteSourceEntityRelations(tx, "export_record", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeExports, EntityRelationTypeProduces)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "export_record", SourceID: item.ID, TargetType: "delivery_version", TargetID: item.DeliveryVersionID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeExports, Status: relationStatus(item.Status)}}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "export_record", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeProduces, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *ExportRecord) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "export_record", item.ID)
}

func (item *Canvas) AfterSave(tx *gorm.DB) error {
	return syncCanvasRelations(tx, item)
}

func syncCanvasRelations(tx *gorm.DB, item *Canvas) error {
	if err := deleteSourceEntityRelations(tx, "canvas", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeAttachedTo)); err != nil {
		return err
	}
	if item.RefID == nil || item.RefType == "" || item.ProjectID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{ProjectID: *item.ProjectID, SourceType: "canvas", SourceID: item.ID, TargetType: item.RefType, TargetID: *item.RefID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAttachedTo, Label: item.Stage, Status: "active"}})
}

func (item *Canvas) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "canvas", item.ID)
}

func (item *CanvasRun) AfterSave(tx *gorm.DB) error {
	return syncCanvasRunRelations(tx, item)
}

func syncCanvasRunRelations(tx *gorm.DB, item *CanvasRun) error {
	if err := deleteSourceEntityRelations(tx, "canvas_run", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	var canvas Canvas
	if err := tx.Select("id, project_id").First(&canvas, item.CanvasID).Error; err != nil || canvas.ProjectID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{ProjectID: *canvas.ProjectID, SourceType: "canvas_run", SourceID: item.ID, TargetType: "canvas", TargetID: item.CanvasID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)}})
}

func (item *CanvasRun) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "canvas_run", item.ID)
}

func (item *CanvasOutput) AfterSave(tx *gorm.DB) error {
	return syncCanvasOutputRelations(tx, item)
}

func syncCanvasOutputRelations(tx *gorm.DB, item *CanvasOutput) error {
	if err := deleteSourceEntityRelations(tx, "canvas_output", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeProduces, EntityRelationTypeAppliesTo)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "canvas_output", SourceID: item.ID, TargetType: item.OwnerType, TargetID: item.OwnerID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAppliesTo, Label: item.OutputType, Status: relationStatus(item.Status)}}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "canvas_output", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeProduces, Label: item.OutputType, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *CanvasOutput) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "canvas_output", item.ID)
}

func BackfillCoreEntityRelations(db *gorm.DB, source string) error {
	if db == nil {
		return nil
	}
	source = strings.TrimSpace(source)
	if source == "" {
		source = EntityRelationSourceMigration
	}
	if err := db.AutoMigrate(&EntityRelation{}); err != nil {
		return err
	}
	if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&EntityRelation{}).Error; err != nil {
		return err
	}
	backfills := []struct {
		name string
		run  func() error
	}{
		{"script_versions", func() error { return backfillByRows[ScriptVersion](db, source) }},
		{"productions", func() error { return backfillByRows[Production](db, source) }},
		{"production_text_blocks", func() error { return backfillByRows[ProductionTextBlock](db, source) }},
		{"creative_references", func() error { return backfillByRows[CreativeReference](db, source) }},
		{"creative_reference_states", func() error { return backfillByRows[CreativeReferenceState](db, source) }},
		{"creative_reference_usages", func() error { return backfillByRows[CreativeReferenceUsage](db, source) }},
		{"creative_relationships", func() error { return backfillByRows[CreativeRelationship](db, source) }},
		{"segments", func() error { return backfillByRows[Segment](db, source) }},
		{"scene_moments", func() error { return backfillByRows[SceneMoment](db, source) }},
		{"content_units", func() error { return backfillByRows[ContentUnit](db, source) }},
		{"asset_slots", func() error { return backfillByRows[AssetSlot](db, source) }},
		{"storyboard_scripts", func() error { return backfillByRows[StoryboardScript](db, source) }},
		{"storyboard_versions", func() error { return backfillByRows[StoryboardVersion](db, source) }},
		{"storyboard_lines", func() error { return backfillByRows[StoryboardLine](db, source) }},
		{"keyframes", func() error { return backfillByRows[Keyframe](db, source) }},
		{"preview_timelines", func() error { return backfillByRows[PreviewTimeline](db, source) }},
		{"preview_timeline_items", func() error { return backfillByRows[PreviewTimelineItem](db, source) }},
		{"asset_slot_candidates", func() error { return backfillByRows[AssetSlotCandidate](db, source) }},
		{"candidate_decisions", func() error { return backfillByRows[CandidateDecision](db, source) }},
		{"review_events", func() error { return backfillByRows[ReviewEvent](db, source) }},
		{"work_items", func() error { return backfillByRows[WorkItem](db, source) }},
		{"work_dependencies", func() error { return backfillByRows[WorkDependency](db, source) }},
		{"delivery_versions", func() error { return backfillByRows[DeliveryVersion](db, source) }},
		{"delivery_timeline_items", func() error { return backfillByRows[DeliveryTimelineItem](db, source) }},
		{"export_records", func() error { return backfillByRows[ExportRecord](db, source) }},
		{"canvases", func() error { return backfillByRows[Canvas](db, source) }},
		{"canvas_runs", func() error { return backfillByRows[CanvasRun](db, source) }},
		{"canvas_outputs", func() error { return backfillByRows[CanvasOutput](db, source) }},
		{"resource_bindings", func() error { return backfillByRows[ResourceBinding](db, source) }},
	}
	for _, backfill := range backfills {
		if err := backfill.run(); err != nil {
			return fmt.Errorf("backfill entity relations from %s: %w", backfill.name, err)
		}
	}
	return nil
}

func backfillByRows[T any](db *gorm.DB, source string) error {
	_ = source
	var rows []T
	if err := db.Find(&rows).Error; err != nil {
		return err
	}
	for i := range rows {
		if err := db.Session(&gorm.Session{FullSaveAssociations: false}).Save(&rows[i]).Error; err != nil {
			return err
		}
	}
	return nil
}
