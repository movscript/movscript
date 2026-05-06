package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

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
	case *SettingRelationship:
		var current SettingRelationship
		if err := db.First(&current, v.ID).Error; err != nil {
			return err
		}
		return syncSettingRelationshipRelations(db, &current)
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
	case *SettingRelationship:
		return deleteMetadataEntityRelations(db, "setting_relationship_id", v.ID)
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
		{"setting_relationships", func() error { return backfillByRows[SettingRelationship](db, source) }},
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
