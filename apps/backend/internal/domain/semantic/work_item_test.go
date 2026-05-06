package semantic

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

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

func TestDecodeWorkItemResultJSONParsesAssetSlotCandidate(t *testing.T) {
	payload, err := DecodeWorkItemResultJSON(`{"asset_slot_candidate_id":42}`)
	if err != nil {
		t.Fatal(err)
	}
	if payload.AssetSlotCandidateID != 42 {
		t.Fatalf("asset slot candidate id = %d, want 42", payload.AssetSlotCandidateID)
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
	item := model.WorkItem{ResultType: "none", ApplyStatus: "not_applicable"}
	ApplyWorkItemUpdates(&item, map[string]any{
		"status":       "done",
		"result_type":  "status_change",
		"result_json":  `{"status":"confirmed"}`,
		"apply_status": "pending",
	})
	if item.Status != "done" || item.ResultType != "status_change" || item.ApplyStatus != "pending" {
		t.Fatalf("unexpected item after updates: %+v", item)
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
