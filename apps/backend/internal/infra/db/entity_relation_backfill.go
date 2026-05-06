package db

import (
	"fmt"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/entityrelation"
	"gorm.io/gorm"
)

func backfillCoreEntityRelations(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if err := db.AutoMigrate(&model.EntityRelation{}); err != nil {
		return err
	}
	if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&model.EntityRelation{}).Error; err != nil {
		return err
	}
	backfills := []struct {
		name string
		run  func() error
	}{
		{"script_versions", func() error { return backfillEntityRelationsByRows[model.ScriptVersion](db) }},
		{"productions", func() error { return backfillEntityRelationsByRows[model.Production](db) }},
		{"production_text_blocks", func() error { return backfillEntityRelationsByRows[model.ProductionTextBlock](db) }},
		{"creative_references", func() error { return backfillEntityRelationsByRows[model.CreativeReference](db) }},
		{"creative_reference_states", func() error { return backfillEntityRelationsByRows[model.CreativeReferenceState](db) }},
		{"creative_reference_usages", func() error { return backfillEntityRelationsByRows[model.CreativeReferenceUsage](db) }},
		{"creative_relationships", func() error { return backfillEntityRelationsByRows[model.CreativeRelationship](db) }},
		{"setting_relationships", func() error { return backfillEntityRelationsByRows[model.SettingRelationship](db) }},
		{"script_setting_refs", func() error { return backfillEntityRelationsByRows[model.ScriptSettingRef](db) }},
		{"segments", func() error { return backfillEntityRelationsByRows[model.Segment](db) }},
		{"scene_moments", func() error { return backfillEntityRelationsByRows[model.SceneMoment](db) }},
		{"content_units", func() error { return backfillEntityRelationsByRows[model.ContentUnit](db) }},
		{"asset_slots", func() error { return backfillEntityRelationsByRows[model.AssetSlot](db) }},
		{"storyboard_scripts", func() error { return backfillEntityRelationsByRows[model.StoryboardScript](db) }},
		{"storyboard_versions", func() error { return backfillEntityRelationsByRows[model.StoryboardVersion](db) }},
		{"storyboard_lines", func() error { return backfillEntityRelationsByRows[model.StoryboardLine](db) }},
		{"keyframes", func() error { return backfillEntityRelationsByRows[model.Keyframe](db) }},
		{"preview_timelines", func() error { return backfillEntityRelationsByRows[model.PreviewTimeline](db) }},
		{"preview_timeline_items", func() error { return backfillEntityRelationsByRows[model.PreviewTimelineItem](db) }},
		{"asset_slot_candidates", func() error { return backfillEntityRelationsByRows[model.AssetSlotCandidate](db) }},
		{"candidate_decisions", func() error { return backfillEntityRelationsByRows[model.CandidateDecision](db) }},
		{"review_events", func() error { return backfillEntityRelationsByRows[model.ReviewEvent](db) }},
		{"work_items", func() error { return backfillEntityRelationsByRows[model.WorkItem](db) }},
		{"work_dependencies", func() error { return backfillEntityRelationsByRows[model.WorkDependency](db) }},
		{"delivery_versions", func() error { return backfillEntityRelationsByRows[model.DeliveryVersion](db) }},
		{"delivery_timeline_items", func() error { return backfillEntityRelationsByRows[model.DeliveryTimelineItem](db) }},
		{"export_records", func() error { return backfillEntityRelationsByRows[model.ExportRecord](db) }},
		{"canvases", func() error { return backfillEntityRelationsByRows[model.Canvas](db) }},
		{"canvas_runs", func() error { return backfillEntityRelationsByRows[model.CanvasRun](db) }},
		{"canvas_outputs", func() error { return backfillEntityRelationsByRows[model.CanvasOutput](db) }},
		{"resource_bindings", func() error { return backfillEntityRelationsByRows[model.ResourceBinding](db) }},
	}
	for _, backfill := range backfills {
		if err := backfill.run(); err != nil {
			return fmt.Errorf("backfill entity relations from %s: %w", backfill.name, err)
		}
	}
	return nil
}

func backfillEntityRelationsByRows[T any](db *gorm.DB) error {
	var rows []T
	if err := db.Find(&rows).Error; err != nil {
		return err
	}
	for i := range rows {
		if err := entityrelation.SyncCoreEntityRelations(db, &rows[i]); err != nil {
			return err
		}
	}
	return nil
}
