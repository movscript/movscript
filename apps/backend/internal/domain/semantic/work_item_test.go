package semantic

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestNewWorkItemAppliesDefaultsAndMapsToModel(t *testing.T) {
	assigneeID := uint(7)
	item := NewWorkItem(1, WorkItemPatch{
		TargetType: WorkItemTargetTypeContentUnit,
		TargetID:   10,
		Title:      "Render shot",
		AssigneeID: &assigneeID,
	})
	if item.Kind != "human" || item.Status != WorkItemStatusTodo || item.Priority != "normal" || item.ResultType != WorkItemResultNone || item.ApplyStatus != WorkItemApplyStatusNotApplicable {
		t.Fatalf("unexpected work item defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 11
	roundTrip := WorkItemFromModel(modelItem)
	if roundTrip.ID != 11 || roundTrip.AssigneeID == nil || *roundTrip.AssigneeID != assigneeID {
		t.Fatalf("unexpected work item round-trip: %+v", roundTrip)
	}
}

func TestWorkItemPatchKeepsAssignmentRejectsTargetChange(t *testing.T) {
	assigneeID := uint(7)
	item := model.WorkItem{
		TargetType:  "content_unit",
		TargetID:    10,
		Kind:        "human",
		Title:       "Render shot",
		Description: "Prepare output",
		Priority:    "normal",
		AssigneeID:  &assigneeID,
	}
	patch := WorkItemPatch{
		TargetType:  "asset_slot",
		TargetID:    10,
		Kind:        item.Kind,
		Title:       item.Title,
		Description: item.Description,
		Priority:    item.Priority,
		AssigneeID:  &assigneeID,
		Status:      "review",
	}

	if WorkItemPatchKeepsAssignment(item, patch) {
		t.Fatal("expected target changes to be rejected for assignee updates")
	}
}

func TestWorkItemPatchKeepsAssignmentAllowsStatusAndSubmissionChanges(t *testing.T) {
	assigneeID := uint(7)
	jobID := uint(11)
	item := model.WorkItem{
		TargetType:  "content_unit",
		TargetID:    10,
		Kind:        "human",
		Title:       "Render shot",
		Description: "Prepare output",
		Priority:    "normal",
		AssigneeID:  &assigneeID,
	}
	patch := WorkItemPatch{
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

	if !WorkItemPatchKeepsAssignment(item, patch) {
		t.Fatal("expected assignee to be able to submit status and source output changes")
	}
}

func TestWorkItemStatusRulesForPatch(t *testing.T) {
	item := model.WorkItem{Status: WorkItemStatusTodo}
	patch := WorkItemPatch{Status: WorkItemStatusReview}

	got := WorkItemStatusForPatch(item, patch)
	if got != WorkItemStatusReview {
		t.Fatalf("status for patch = %q, want %q", got, WorkItemStatusReview)
	}
	if !WorkItemAssigneeCanAdvanceTo(got) {
		t.Fatalf("expected assignee to advance to %q", got)
	}
	if WorkItemStatusRequiresManager(got) {
		t.Fatalf("did not expect manager-only status for %q", got)
	}
	if WorkItemPatchCompletes(item, patch) {
		t.Fatal("review patch should not complete the item")
	}
}

func TestWorkItemStatusRulesForDonePatch(t *testing.T) {
	item := model.WorkItem{Status: WorkItemStatusReview}
	patch := WorkItemPatch{Status: WorkItemStatusDone}

	if !WorkItemStatusRequiresManager(WorkItemStatusForPatch(item, patch)) {
		t.Fatal("done status should require manager")
	}
	if !WorkItemPatchCompletes(item, patch) {
		t.Fatal("done patch should complete the item")
	}
}

func TestDecodeWorkItemResultJSONParsesAssetSlotCandidate(t *testing.T) {
	payload, err := DecodeWorkItemResultJSON(`{"asset_slot_candidate_id":42}`)
	if err != nil {
		t.Fatal(err)
	}
	if payload.AssetSlotCandidateID != 42 {
		t.Fatalf("asset slot candidate id = %d, want 42", payload.AssetSlotCandidateID)
	}
}

func TestWorkItemResultApplicationForStatusChange(t *testing.T) {
	item := model.WorkItem{
		TargetType: WorkItemTargetTypeContentUnit,
		ResultType: WorkItemResultStatusChange,
		ResultJSON: `{"target_status":"confirmed"}`,
	}

	app, err := WorkItemResultApplicationFor(item)
	if err != nil {
		t.Fatal(err)
	}
	if app.Kind != WorkItemResultApplicationTargetStatus || app.TargetType != WorkItemTargetTypeContentUnit || app.TargetStatus != "confirmed" {
		t.Fatalf("unexpected application: %+v", app)
	}
}

func TestWorkItemResultApplicationForPresetTargetStatuses(t *testing.T) {
	keyframeApp, err := WorkItemResultApplicationFor(model.WorkItem{ResultType: WorkItemResultAcceptKeyframe})
	if err != nil {
		t.Fatal(err)
	}
	if keyframeApp.TargetType != WorkItemTargetTypeKeyframe || keyframeApp.TargetStatus != KeyframeStatusAccepted {
		t.Fatalf("unexpected keyframe application: %+v", keyframeApp)
	}

	deliveryApp, err := WorkItemResultApplicationFor(model.WorkItem{ResultType: WorkItemResultApproveDeliveryVersion})
	if err != nil {
		t.Fatal(err)
	}
	if deliveryApp.TargetType != WorkItemTargetTypeDeliveryVersion || deliveryApp.TargetStatus != DeliveryVersionStatusApprove {
		t.Fatalf("unexpected delivery application: %+v", deliveryApp)
	}
}

func TestWorkItemResultApplicationForAssetCandidate(t *testing.T) {
	app, err := WorkItemResultApplicationFor(model.WorkItem{
		TargetType: WorkItemTargetTypeAssetSlot,
		ResultType: WorkItemResultLockAssetCandidate,
		ResultJSON: `{"asset_slot_candidate_id":42}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if app.Kind != WorkItemResultApplicationLockAssetSlotCandidate || app.AssetSlotCandidateID != 42 {
		t.Fatalf("unexpected asset candidate application: %+v", app)
	}
}

func TestApplyStatusForWorkItemPatchResetsWhenResultChanges(t *testing.T) {
	item := model.WorkItem{
		ResultType:  "status_change",
		ResultJSON:  `{"status":"confirmed"}`,
		ApplyStatus: "applied",
	}
	patch := WorkItemPatch{
		ResultType: "status_change",
		ResultJSON: `{"status":"locked"}`,
	}
	if got := ApplyStatusForWorkItemPatch(item, patch); got != "pending" {
		t.Fatalf("apply status = %q, want pending", got)
	}
}

func TestApplyWorkItemUpdatesCopiesResultFields(t *testing.T) {
	item := model.WorkItem{ResultType: WorkItemResultNone, ApplyStatus: WorkItemApplyStatusNotApplicable}
	ApplyWorkItemUpdates(&item, map[string]any{
		"status":       WorkItemStatusDone,
		"result_type":  WorkItemResultStatusChange,
		"result_json":  `{"status":"confirmed"}`,
		"apply_status": WorkItemApplyStatusPending,
	})
	if item.Status != WorkItemStatusDone || item.ResultType != WorkItemResultStatusChange || item.ApplyStatus != WorkItemApplyStatusPending {
		t.Fatalf("unexpected item after updates: %+v", item)
	}
}

func TestPrepareWorkItemResultApplicationMarksNoneNotApplicable(t *testing.T) {
	item := model.WorkItem{
		ResultType:  "",
		ApplyStatus: WorkItemApplyStatusApplied,
		AppliedAt:   "2026-05-07T12:00:00Z",
		ApplyError:  "old error",
	}

	PrepareWorkItemResultApplication(&item)

	if item.ResultType != WorkItemResultNone {
		t.Fatalf("result type = %q, want %q", item.ResultType, WorkItemResultNone)
	}
	if item.ApplyStatus != WorkItemApplyStatusNotApplicable || item.AppliedAt != "" || item.ApplyError != "" {
		t.Fatalf("unexpected apply state: %+v", item)
	}
}

func TestPrepareWorkItemResultApplicationMarksResultPending(t *testing.T) {
	item := model.WorkItem{
		ResultType:  WorkItemResultStatusChange,
		ApplyStatus: WorkItemApplyStatusFailed,
		ApplyError:  "old error",
	}

	PrepareWorkItemResultApplication(&item)

	if item.ApplyStatus != WorkItemApplyStatusPending || item.ApplyError != "" {
		t.Fatalf("unexpected apply state: %+v", item)
	}
}

func TestMarkWorkItemResultAppliedAndFailed(t *testing.T) {
	item := model.WorkItem{}
	MarkWorkItemResultApplied(&item, "2026-05-07T12:00:00Z")
	if item.ApplyStatus != WorkItemApplyStatusApplied || item.AppliedAt == "" || item.ApplyError != "" {
		t.Fatalf("unexpected applied state: %+v", item)
	}

	MarkWorkItemResultApplyFailed(&item, "apply failed")
	if item.ApplyStatus != WorkItemApplyStatusFailed || item.ApplyError != "apply failed" {
		t.Fatalf("unexpected failed state: %+v", item)
	}
}

func TestCompactUpdatesSkipsEmptyValues(t *testing.T) {
	id := uint(9)
	updates := CompactUpdates(map[string]any{
		"name":   "",
		"status": "draft",
		"id":     &id,
		"none":   nil,
	})
	if _, ok := updates["name"]; ok {
		t.Fatalf("empty string should be omitted: %#v", updates)
	}
	if updates["status"] != "draft" || updates["id"] != &id {
		t.Fatalf("unexpected updates: %#v", updates)
	}
}

func TestTruthyFilter(t *testing.T) {
	if !TruthyFilter("on") || !TruthyFilter("true") || !TruthyFilter("1") {
		t.Fatal("expected truthy values")
	}
	if TruthyFilter("false") || TruthyFilter("off") {
		t.Fatal("expected falsey values")
	}
}
