package db

import (
	"fmt"
	"github.com/movscript/movscript/internal/infra/entityrelation"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func backfillCoreEntityRelations(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if err := db.AutoMigrate(&persistencemodel.EntityRelation{}); err != nil {
		return err
	}
	if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&persistencemodel.EntityRelation{}).Error; err != nil {
		return err
	}
	backfills := []struct {
		name string
		run  func() error
	}{
		{"script_versions", func() error { return backfillEntityRelationsByRows[persistencemodel.ScriptVersion](db) }},
		{"productions", func() error { return backfillEntityRelationsByRows[persistencemodel.Production](db) }},
		{"production_text_blocks", func() error { return backfillEntityRelationsByRows[persistencemodel.ProductionTextBlock](db) }},
		{"creative_references", func() error { return backfillEntityRelationsByRows[persistencemodel.CreativeReference](db) }},
		{"creative_reference_states", func() error { return backfillEntityRelationsByRows[persistencemodel.CreativeReferenceState](db) }},
		{"creative_reference_usages", func() error { return backfillEntityRelationsByRows[persistencemodel.CreativeReferenceUsage](db) }},
		{"creative_relationships", func() error { return backfillEntityRelationsByRows[persistencemodel.CreativeRelationship](db) }},
		{"segments", func() error { return backfillEntityRelationsByRows[persistencemodel.Segment](db) }},
		{"scene_moments", func() error { return backfillEntityRelationsByRows[persistencemodel.SceneMoment](db) }},
		{"content_units", func() error { return backfillEntityRelationsByRows[persistencemodel.ContentUnit](db) }},
		{"asset_slots", func() error { return backfillEntityRelationsByRows[persistencemodel.AssetSlot](db) }},
		{"storyboard_scripts", func() error { return backfillEntityRelationsByRows[persistencemodel.StoryboardScript](db) }},
		{"storyboard_versions", func() error { return backfillEntityRelationsByRows[persistencemodel.StoryboardVersion](db) }},
		{"storyboard_lines", func() error { return backfillEntityRelationsByRows[persistencemodel.StoryboardLine](db) }},
		{"keyframes", func() error { return backfillEntityRelationsByRows[persistencemodel.Keyframe](db) }},
		{"preview_timelines", func() error { return backfillEntityRelationsByRows[persistencemodel.PreviewTimeline](db) }},
		{"preview_timeline_items", func() error { return backfillEntityRelationsByRows[persistencemodel.PreviewTimelineItem](db) }},
		{"asset_slot_candidates", func() error { return backfillEntityRelationsByRows[persistencemodel.AssetSlotCandidate](db) }},
		{"candidate_decisions", func() error { return backfillEntityRelationsByRows[persistencemodel.CandidateDecision](db) }},
		{"review_events", func() error { return backfillEntityRelationsByRows[persistencemodel.ReviewEvent](db) }},
		{"work_items", func() error { return backfillEntityRelationsByRows[persistencemodel.WorkItem](db) }},
		{"work_dependencies", func() error { return backfillEntityRelationsByRows[persistencemodel.WorkDependency](db) }},
		{"delivery_versions", func() error { return backfillEntityRelationsByRows[persistencemodel.DeliveryVersion](db) }},
		{"delivery_timeline_items", func() error { return backfillEntityRelationsByRows[persistencemodel.DeliveryTimelineItem](db) }},
		{"export_records", func() error { return backfillEntityRelationsByRows[persistencemodel.ExportRecord](db) }},
		{"canvases", func() error { return backfillEntityRelationsByRows[persistencemodel.Canvas](db) }},
		{"canvas_runs", func() error { return backfillEntityRelationsByRows[persistencemodel.CanvasRun](db) }},
		{"canvas_outputs", func() error { return backfillEntityRelationsByRows[persistencemodel.CanvasOutput](db) }},
		{"resource_bindings", func() error { return backfillEntityRelationsByRows[persistencemodel.ResourceBinding](db) }},
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
