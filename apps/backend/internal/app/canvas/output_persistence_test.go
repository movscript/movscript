package canvas

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAttachAssetSlotCandidateOutputSyncsRelationsWithoutHooks(t *testing.T) {
	db := newCanvasOutputTestDB(t)
	projectID := uint(1)
	resourceID := uint(77)
	sourceSlot := persistencemodel.AssetSlot{
		ProjectID: projectID,
		Kind:      "image",
		Name:      "Hero still",
		Status:    "missing",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&sourceSlot).Error; err != nil {
		t.Fatalf("create source slot: %v", err)
	}
	target := persistencemodel.CanvasOutput{
		ProjectID:    projectID,
		CanvasID:     10,
		PortID:       "image",
		OwnerType:    "asset_slot",
		OwnerID:      sourceSlot.ID,
		OutputType:   "candidate",
		Status:       canvasruntime.CanvasOutputStatusPending,
		CanvasNodeID: "final-output",
		MetadataJSON: "{}",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create canvas output: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil, nil, nil)
	service.attachAssetSlotCandidateOutput(context.Background(), persistencemodel.Canvas{Model: gorm.Model{ID: 10}, ProjectID: &projectID}, 20, 30, target, canvasPortValue{
		Type:       "image",
		ResourceID: &resourceID,
	})

	var updatedTarget persistencemodel.CanvasOutput
	if err := db.First(&updatedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload canvas output: %v", err)
	}
	if updatedTarget.Status != canvasruntime.CanvasOutputStatusAttached || updatedTarget.ResourceID == nil || *updatedTarget.ResourceID != resourceID {
		t.Fatalf("canvas output was not attached: %+v", updatedTarget)
	}
	var candidate persistencemodel.AssetSlotCandidate
	if err := db.First(&candidate, "asset_slot_id = ?", sourceSlot.ID).Error; err != nil {
		t.Fatalf("expected asset slot candidate: %v", err)
	}
	var binding persistencemodel.ResourceBinding
	if err := db.First(&binding, "owner_type = ? AND owner_id = ? AND resource_id = ?", "asset_slot", candidate.CandidateAssetSlotID, resourceID).Error; err != nil {
		t.Fatalf("expected candidate resource binding: %v", err)
	}
	assertCanvasRelationExists(t, db, "asset_slot", candidate.CandidateAssetSlotID, "asset_slot", sourceSlot.ID, persistencemodel.EntityRelationTypeCandidateFor)
	assertCanvasRelationExists(t, db, "canvas_output", target.ID, "asset_slot", sourceSlot.ID, persistencemodel.EntityRelationTypeAppliesTo)
	assertCanvasRelationExists(t, db, "canvas_output", target.ID, "raw_resource", resourceID, persistencemodel.EntityRelationTypeProduces)
}

func TestCanvasRunHelpersSyncRelationsWithoutHooks(t *testing.T) {
	db := newCanvasOutputTestDB(t)
	projectID := uint(1)
	cv := persistencemodel.Canvas{
		OwnerID:    1,
		Name:       "Workflow",
		CanvasType: "workflow",
		ProjectID:  &projectID,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&cv).Error; err != nil {
		t.Fatalf("create canvas: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil, nil, nil)
	run := persistencemodel.CanvasRun{
		CanvasID: cv.ID,
		Status:   canvasruntime.CanvasRunStatusRunning,
	}
	if err := service.createCanvasRunWithRelations(&run); err != nil {
		t.Fatalf("create run: %v", err)
	}
	assertCanvasRelationStatus(t, db, "canvas_run", run.ID, "canvas", cv.ID, persistencemodel.EntityRelationTypeDerivedFrom, canvasruntime.CanvasRunStatusRunning)

	run.Status = canvasruntime.CanvasRunStatusDone
	if err := service.saveCanvasRunWithRelations(&run); err != nil {
		t.Fatalf("save run: %v", err)
	}
	assertCanvasRelationStatus(t, db, "canvas_run", run.ID, "canvas", cv.ID, persistencemodel.EntityRelationTypeDerivedFrom, canvasruntime.CanvasRunStatusDone)
}

func TestDeleteCanvasDeletesCanvasAndRunRelationsWithoutHooks(t *testing.T) {
	db := newCanvasOutputTestDB(t)
	projectID := uint(1)
	refSlot := persistencemodel.AssetSlot{
		ProjectID: projectID,
		Kind:      "image",
		Name:      "Reference slot",
		Status:    "missing",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&refSlot).Error; err != nil {
		t.Fatalf("create reference slot: %v", err)
	}
	refID := refSlot.ID
	cv := persistencemodel.Canvas{
		OwnerID:    7,
		Name:       "Workflow",
		CanvasType: "workflow",
		ProjectID:  &projectID,
		RefType:    "asset_slot",
		RefID:      &refID,
		Stage:      "generation",
	}
	if err := saveCanvasWithRelations(db.Session(&gorm.Session{SkipHooks: true}), &cv); err != nil {
		t.Fatalf("create canvas: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil, nil, nil)
	run := persistencemodel.CanvasRun{
		CanvasID: cv.ID,
		Status:   canvasruntime.CanvasRunStatusRunning,
	}
	if err := service.createCanvasRunWithRelations(&run); err != nil {
		t.Fatalf("create run: %v", err)
	}
	assertCanvasRelationExists(t, db, "canvas", cv.ID, "asset_slot", refSlot.ID, persistencemodel.EntityRelationTypeAttachedTo)
	assertCanvasRelationExists(t, db, "canvas_run", run.ID, "canvas", cv.ID, persistencemodel.EntityRelationTypeDerivedFrom)

	if err := service.DeleteCanvas(context.Background(), strconv.FormatUint(uint64(cv.ID), 10), cv.OwnerID, nil); err != nil {
		t.Fatalf("delete canvas: %v", err)
	}
	assertCanvasRelationMissing(t, db, "canvas", cv.ID, "asset_slot", refSlot.ID, persistencemodel.EntityRelationTypeAttachedTo)
	assertCanvasRelationMissing(t, db, "canvas_run", run.ID, "canvas", cv.ID, persistencemodel.EntityRelationTypeDerivedFrom)
}

func newCanvasOutputTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "canvas_output.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&persistencemodel.EntityRelation{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.Canvas{},
		&persistencemodel.CanvasTask{},
		&persistencemodel.CanvasNode{},
		&persistencemodel.CanvasEdge{},
		&persistencemodel.CanvasRun{},
		&persistencemodel.CanvasOutput{},
	); err != nil {
		t.Fatalf("migrate canvas output db: %v", err)
	}
	return db
}

func assertCanvasRelationMissing(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	var count int64
	if err := db.Model(&persistencemodel.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s to be missing, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func assertCanvasRelationStatus(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string, status string) {
	t.Helper()
	var relation persistencemodel.EntityRelation
	if err := db.
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.Status != status {
		t.Fatalf("relation status = %q, want %q", relation.Status, status)
	}
}

func assertCanvasRelationExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	var count int64
	if err := db.Model(&persistencemodel.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}
