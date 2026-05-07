package semantic

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestWorkItemInputKeepsAssignmentRejectsTargetChange(t *testing.T) {
	assigneeID := uint(7)
	item := domainsemantic.WorkItem{
		TargetType:  "content_unit",
		TargetID:    10,
		Kind:        "human",
		Title:       "Render shot",
		Description: "Prepare output",
		Priority:    "normal",
		AssigneeID:  &assigneeID,
	}
	req := WorkItemInput{
		TargetType:  "asset_slot",
		TargetID:    10,
		Kind:        item.Kind,
		Title:       item.Title,
		Description: item.Description,
		Priority:    item.Priority,
		AssigneeID:  &assigneeID,
		Status:      "review",
	}

	if WorkItemInputKeepsAssignment(item, req) {
		t.Fatal("expected target changes to be rejected for assignee updates")
	}
}

func TestWorkItemInputKeepsAssignmentAllowsStatusAndSubmissionChanges(t *testing.T) {
	assigneeID := uint(7)
	jobID := uint(11)
	item := domainsemantic.WorkItem{
		TargetType:  "content_unit",
		TargetID:    10,
		Kind:        "human",
		Title:       "Render shot",
		Description: "Prepare output",
		Priority:    "normal",
		AssigneeID:  &assigneeID,
	}
	req := WorkItemInput{
		TargetType:  item.TargetType,
		TargetID:    item.TargetID,
		Kind:        item.Kind,
		Title:       item.Title,
		Description: item.Description,
		Priority:    item.Priority,
		AssigneeID:  &assigneeID,
		Status:      "review",
		SourceJobID: &jobID,
	}

	if !WorkItemInputKeepsAssignment(item, req) {
		t.Fatal("expected assignee to be able to submit status and source output changes")
	}
}

func TestDecodeWorkItemResultJSONParsesAssetSlotCandidate(t *testing.T) {
	payload, err := domainsemantic.DecodeWorkItemResultJSON(`{"asset_slot_candidate_id":42}`)
	if err != nil {
		t.Fatal(err)
	}
	if payload.AssetSlotCandidateID != 42 {
		t.Fatalf("asset slot candidate id = %d, want 42", payload.AssetSlotCandidateID)
	}
}

func TestApplyStatusForWorkItemPatchResetsWhenResultChanges(t *testing.T) {
	item := domainsemantic.WorkItem{
		ResultType:  "status_change",
		ResultJSON:  `{"status":"confirmed"}`,
		ApplyStatus: "applied",
	}
	req := WorkItemInput{
		ResultType: "status_change",
		ResultJSON: `{"status":"locked"}`,
	}
	if got := domainsemantic.ApplyStatusForWorkItemPatch(item, req.domainPatch()); got != "pending" {
		t.Fatalf("apply status = %q, want pending", got)
	}
}

func TestApplyWorkItemUpdatesCopiesResultFields(t *testing.T) {
	item := domainsemantic.WorkItem{ResultType: "none", ApplyStatus: "not_applicable"}
	domainsemantic.ApplyWorkItemUpdates(&item, map[string]any{
		"status":       "done",
		"result_type":  "status_change",
		"result_json":  `{"status":"confirmed"}`,
		"apply_status": "pending",
	})
	if item.Status != "done" || item.ResultType != "status_change" || item.ApplyStatus != "pending" {
		t.Fatalf("unexpected item after updates: %+v", item)
	}
}

func TestCompleteWorkItemAppliesAssetCandidateRelationsWithoutHooks(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	targetSlot := model.AssetSlot{
		ProjectID: 1,
		Kind:      "image",
		Name:      "Final frame",
		Status:    "missing",
	}
	candidateSlot := model.AssetSlot{
		ProjectID: 1,
		OwnerType: "asset_slot",
		Kind:      "image",
		Name:      "Candidate frame",
		Status:    "candidate",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&targetSlot).Error; err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlot.OwnerID = &targetSlot.ID
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidateSlot).Error; err != nil {
		t.Fatalf("create candidate slot: %v", err)
	}
	candidate := model.AssetSlotCandidate{
		ProjectID:            1,
		AssetSlotID:          targetSlot.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		SourceType:           "manual",
		Status:               "candidate",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create candidate: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "asset_slot",
		TargetID:    targetSlot.ID,
		Kind:        "human",
		Title:       "Choose candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "lock_asset_candidate",
		ResultJSON:  `{"asset_slot_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	got, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), map[string]any{
		"status":       "done",
		"result_type":  "lock_asset_candidate",
		"result_json":  work.ResultJSON,
		"apply_status": "pending",
	}, nil)
	if err != nil {
		t.Fatalf("complete work item: %v", err)
	}
	if got.ApplyStatus != "applied" {
		t.Fatalf("apply status = %q, want applied", got.ApplyStatus)
	}

	var reloadedTarget model.AssetSlot
	if err := db.First(&reloadedTarget, targetSlot.ID).Error; err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.Status != "locked" || reloadedTarget.LockedAssetSlotID == nil || *reloadedTarget.LockedAssetSlotID != candidateSlot.ID {
		t.Fatalf("target slot was not locked to candidate: %+v", reloadedTarget)
	}
	assertSemanticRelationExists(t, db, "work_item", work.ID, "asset_slot", targetSlot.ID, model.EntityRelationTypeTargets)
	assertSemanticRelationExists(t, db, "asset_slot", candidateSlot.ID, "asset_slot", targetSlot.ID, model.EntityRelationTypeCandidateFor)
	assertSemanticRelationExists(t, db, "candidate_decision", 1, "asset_slot_candidate", candidate.ID, model.EntityRelationTypeDecides)
	assertSemanticRelationExists(t, db, "review_event", 1, "asset_slot", targetSlot.ID, model.EntityRelationTypeReviews)
}

func newSemanticWorkTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "semantic_work.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.EntityRelation{},
		&model.User{},
		&model.WorkItem{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.CandidateDecision{},
		&model.ReviewEvent{},
	); err != nil {
		t.Fatalf("migrate semantic work db: %v", err)
	}
	return db
}

func assertSemanticRelationExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func uintString(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}
