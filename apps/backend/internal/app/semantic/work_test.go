package semantic

import (
	"context"
	"strconv"
	"testing"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
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
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	targetSlot := model.AssetSlot{
		ProjectID: 1,
		Kind:      "image",
		Name:      "Final frame",
		Status:    "missing",
	}
	candidateSlot := model.AssetSlot{
		ProjectID:  1,
		OwnerType:  "asset_slot",
		Kind:       "image",
		Name:       "Candidate frame",
		ResourceID: &resource.ID,
		Status:     "candidate",
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
	got, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "lock_asset_candidate",
		ResultJSON: work.ResultJSON,
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
	if reloadedTarget.Status != "locked" || reloadedTarget.LockedAssetSlotID == nil || *reloadedTarget.LockedAssetSlotID != candidateSlot.ID || reloadedTarget.ResourceID == nil || *reloadedTarget.ResourceID != resource.ID {
		t.Fatalf("target slot was not locked to candidate: %+v", reloadedTarget)
	}
	assertSemanticRelationExists(t, db, "work_item", work.ID, "asset_slot", targetSlot.ID, model.EntityRelationTypeTargets)
	assertSemanticRelationExists(t, db, "asset_slot", candidateSlot.ID, "asset_slot", targetSlot.ID, model.EntityRelationTypeCandidateFor)
	assertSemanticRelationExists(t, db, "candidate_decision", 1, "asset_slot_candidate", candidate.ID, model.EntityRelationTypeDecides)
	assertSemanticRelationExists(t, db, "review_event", 1, "asset_slot", targetSlot.ID, model.EntityRelationTypeReviews)
}

func TestCompleteWorkItemRejectsRejectedAssetCandidateWithoutHooks(t *testing.T) {
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
		Status:               "rejected",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create rejected asset candidate: %v", err)
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
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "lock_asset_candidate",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "素材候选已被拒绝" {
		t.Fatalf("complete work item error = %v, want rejected asset candidate error", err)
	}
	var reloadedTarget model.AssetSlot
	if err := db.First(&reloadedTarget, targetSlot.ID).Error; err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.LockedAssetSlotID != nil || reloadedTarget.Status != "missing" {
		t.Fatalf("target slot changed despite rejected candidate: %+v", reloadedTarget)
	}
}

func TestCompleteWorkItemRejectsAssetCandidateWithoutResource(t *testing.T) {
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
		t.Fatalf("create candidate slot without resource: %v", err)
	}
	candidate := model.AssetSlotCandidate{
		ProjectID:            1,
		AssetSlotID:          targetSlot.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		SourceType:           "manual",
		Status:               "candidate",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create asset candidate without resource: %v", err)
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
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "lock_asset_candidate",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "素材候选缺少资源" {
		t.Fatalf("complete work item error = %v, want missing resource error", err)
	}
	var reloadedTarget model.AssetSlot
	if err := db.First(&reloadedTarget, targetSlot.ID).Error; err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.LockedAssetSlotID != nil || reloadedTarget.ResourceID != nil || reloadedTarget.Status != "missing" {
		t.Fatalf("target slot changed despite resource-less candidate: %+v", reloadedTarget)
	}
}

func TestCompleteWorkItemRejectsAssetCandidateWithUnknownResource(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	targetSlot := model.AssetSlot{
		ProjectID: 1,
		Kind:      "image",
		Name:      "Final frame",
		Status:    "missing",
	}
	missingResourceID := uint(999)
	candidateSlot := model.AssetSlot{
		ProjectID:  1,
		OwnerType:  "asset_slot",
		Kind:       "image",
		Name:       "Candidate frame",
		ResourceID: &missingResourceID,
		Status:     "candidate",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&targetSlot).Error; err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlot.OwnerID = &targetSlot.ID
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidateSlot).Error; err != nil {
		t.Fatalf("create candidate slot with unknown resource: %v", err)
	}
	candidate := model.AssetSlotCandidate{
		ProjectID:            1,
		AssetSlotID:          targetSlot.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		SourceType:           "manual",
		Status:               "candidate",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create asset candidate with unknown resource: %v", err)
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
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "lock_asset_candidate",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "素材候选资源不存在" {
		t.Fatalf("complete work item error = %v, want unknown resource error", err)
	}
	var reloadedTarget model.AssetSlot
	if err := db.First(&reloadedTarget, targetSlot.ID).Error; err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.LockedAssetSlotID != nil || reloadedTarget.ResourceID != nil || reloadedTarget.Status != "missing" {
		t.Fatalf("target slot changed despite unknown resource: %+v", reloadedTarget)
	}
}

func TestCompleteWorkItemAcceptsCurrentKeyframeWithoutCandidate(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	target := model.Keyframe{
		ProjectID:   1,
		Title:       "Hero frame",
		Description: "approved composition",
		Status:      "draft",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Accept current keyframe",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	got, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: "",
	}, nil)
	if err != nil {
		t.Fatalf("complete work item: %v", err)
	}
	if got.ApplyStatus != "applied" {
		t.Fatalf("apply status = %q, want applied", got.ApplyStatus)
	}
	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.Status != "accepted" || reloadedTarget.Description != "approved composition" {
		t.Fatalf("target keyframe after direct accept = %+v, want accepted without content changes", reloadedTarget)
	}
}

func TestCompleteWorkItemAppliesKeyframeCandidateWithoutHooks(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target := model.Keyframe{
		ProjectID:   1,
		Title:       "Hero frame",
		Description: "old description",
		Prompt:      "old prompt",
		Status:      "generated",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate := model.Keyframe{
		ProjectID:    1,
		Title:        "Candidate frame",
		Description:  "new description",
		Prompt:       "new prompt",
		ResourceID:   &resource.ID,
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create candidate keyframe: %v", err)
	}
	sibling := model.Keyframe{
		ProjectID:    1,
		Title:        "Other candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&sibling).Error; err != nil {
		t.Fatalf("create sibling keyframe candidate: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Choose keyframe candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ResultJSON:  `{"keyframe_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	actorID := uint(7)
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	got, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: work.ResultJSON,
	}, &actorID)
	if err != nil {
		t.Fatalf("complete work item: %v", err)
	}
	if got.ApplyStatus != "applied" {
		t.Fatalf("apply status = %q, want applied", got.ApplyStatus)
	}

	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.Status != "accepted" || reloadedTarget.ResourceID == nil || *reloadedTarget.ResourceID != resource.ID || reloadedTarget.Description != "new description" || reloadedTarget.Prompt != "new prompt" {
		t.Fatalf("target keyframe was not updated from candidate: %+v", reloadedTarget)
	}
	var reloadedCandidate model.Keyframe
	if err := db.First(&reloadedCandidate, candidate.ID).Error; err != nil {
		t.Fatalf("reload candidate keyframe: %v", err)
	}
	if reloadedCandidate.Status != "accepted" {
		t.Fatalf("candidate status = %q, want accepted", reloadedCandidate.Status)
	}
	var reloadedSibling model.Keyframe
	if err := db.First(&reloadedSibling, sibling.ID).Error; err != nil {
		t.Fatalf("reload sibling keyframe: %v", err)
	}
	if reloadedSibling.Status != "rejected" {
		t.Fatalf("sibling status = %q, want rejected", reloadedSibling.Status)
	}
	assertSemanticRelationExists(t, db, "candidate_decision", 1, "keyframe", candidate.ID, model.EntityRelationTypeDecides)
	assertSemanticRelationExists(t, db, "candidate_decision", 1, "keyframe", target.ID, model.EntityRelationTypeAppliesTo)
	assertSemanticRelationExists(t, db, "review_event", 1, "keyframe", target.ID, model.EntityRelationTypeReviews)
}

func TestCompleteWorkItemRejectsNonGeneratedKeyframeCandidateWithoutHooks(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target := model.Keyframe{
		ProjectID: 1,
		Title:     "Target frame",
		Status:    "generated",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate := model.Keyframe{
		ProjectID:    1,
		Title:        "Malformed candidate frame",
		ResourceID:   &resource.ID,
		Status:       "candidate",
		MetadataJSON: `{"target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create malformed keyframe candidate: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Choose keyframe candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ResultJSON:  `{"keyframe_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "关键帧候选不是 AI 生成候选" {
		t.Fatalf("complete work item error = %v, want non-generated keyframe candidate error", err)
	}
	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.ResourceID != nil || reloadedTarget.Status != "generated" {
		t.Fatalf("target keyframe changed despite rejected candidate: %+v", reloadedTarget)
	}
}

func TestCompleteWorkItemRejectsKeyframeCandidateWithoutResource(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	existingResource := model.RawResource{OwnerID: 1, Type: "image", Name: "target.png", FilePath: "/tmp/target.png"}
	if err := db.Create(&existingResource).Error; err != nil {
		t.Fatalf("create existing resource: %v", err)
	}
	target := model.Keyframe{
		ProjectID:  1,
		Title:      "Target frame",
		ResourceID: &existingResource.ID,
		Status:     "generated",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate := model.Keyframe{
		ProjectID:    1,
		Title:        "Candidate without resource",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create keyframe candidate without resource: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Choose keyframe candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ResultJSON:  `{"keyframe_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "关键帧候选缺少资源" {
		t.Fatalf("complete work item error = %v, want missing resource error", err)
	}
	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.ResourceID == nil || *reloadedTarget.ResourceID != existingResource.ID || reloadedTarget.Status != "generated" {
		t.Fatalf("target keyframe changed despite resource-less candidate: %+v", reloadedTarget)
	}
}

func TestCompleteWorkItemRejectsKeyframeCandidateWithUnknownResource(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	existingResource := model.RawResource{OwnerID: 1, Type: "image", Name: "target.png", FilePath: "/tmp/target.png"}
	if err := db.Create(&existingResource).Error; err != nil {
		t.Fatalf("create existing resource: %v", err)
	}
	target := model.Keyframe{
		ProjectID:  1,
		Title:      "Target frame",
		ResourceID: &existingResource.ID,
		Status:     "generated",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	missingResourceID := uint(999)
	candidate := model.Keyframe{
		ProjectID:    1,
		Title:        "Candidate with unknown resource",
		ResourceID:   &missingResourceID,
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create keyframe candidate with unknown resource: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Choose keyframe candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ResultJSON:  `{"keyframe_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "关键帧候选资源不存在" {
		t.Fatalf("complete work item error = %v, want unknown resource error", err)
	}
	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.ResourceID == nil || *reloadedTarget.ResourceID != existingResource.ID || reloadedTarget.Status != "generated" {
		t.Fatalf("target keyframe changed despite unknown resource: %+v", reloadedTarget)
	}
}

func TestKeyframeCandidateMetadataRecognizesLegacyTargetIDForExclusion(t *testing.T) {
	if !isKeyframeCandidateMetadata(`{"target_keyframe_id":7}`) {
		t.Fatalf("legacy target metadata was not recognized as keyframe candidate metadata")
	}
	if isGeneratedKeyframeCandidateMetadata(`{"target_keyframe_id":7}`) {
		t.Fatalf("legacy target metadata should not be accepted as AI-generated candidate metadata")
	}
	if isKeyframeCandidateMetadata(`{"source":"manual"}`) {
		t.Fatalf("manual metadata should not be recognized as keyframe candidate metadata")
	}
}

func TestCompleteWorkItemRejectsRejectedKeyframeCandidate(t *testing.T) {
	db := newSemanticWorkTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target := model.Keyframe{
		ProjectID: 1,
		Title:     "Target frame",
		Status:    "generated",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate := model.Keyframe{
		ProjectID:    1,
		Title:        "Rejected candidate",
		ResourceID:   &resource.ID,
		Status:       "rejected",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + uintString(target.ID) + `}`,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&candidate).Error; err != nil {
		t.Fatalf("create rejected keyframe candidate: %v", err)
	}
	work := model.WorkItem{
		ProjectID:   1,
		TargetType:  "keyframe",
		TargetID:    target.ID,
		Kind:        "human",
		Title:       "Choose keyframe candidate",
		Status:      "review",
		Priority:    "normal",
		ResultType:  "accept_keyframe",
		ResultJSON:  `{"keyframe_candidate_id":` + uintString(candidate.ID) + `}`,
		ApplyStatus: "pending",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&work).Error; err != nil {
		t.Fatalf("create work item: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	_, err := service.completeWorkItem(ctx, 1, domainsemantic.WorkItemFromModel(work), domainsemantic.WorkItemPatch{
		TargetType: work.TargetType,
		TargetID:   work.TargetID,
		Kind:       work.Kind,
		Title:      work.Title,
		Status:     "done",
		Priority:   work.Priority,
		ResultType: "accept_keyframe",
		ResultJSON: work.ResultJSON,
	}, nil)
	if err == nil || err.Error() != "关键帧候选已被拒绝" {
		t.Fatalf("complete work item error = %v, want rejected candidate error", err)
	}
	var reloadedTarget model.Keyframe
	if err := db.First(&reloadedTarget, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if reloadedTarget.ResourceID != nil || reloadedTarget.Status != "generated" {
		t.Fatalf("target keyframe changed despite rejected candidate: %+v", reloadedTarget)
	}
}

func newSemanticWorkTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "semantic_work.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.User{},
		&model.WorkItem{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.Keyframe{},
		&model.RawResource{},
		&model.CandidateDecision{},
		&model.ReviewEvent{},
	)
}

func assertSemanticRelationExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ? AND valid_to IS NULL", sourceType, sourceID, targetType, targetID, relationType).
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
