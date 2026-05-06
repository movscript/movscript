package semantic

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestWorkItemInputKeepsAssignmentRejectsTargetChange(t *testing.T) {
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
	item := model.WorkItem{
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
	req := WorkItemInput{
		ResultType: "status_change",
		ResultJSON: `{"status":"locked"}`,
	}
	if got := ApplyStatusForWorkItemPatch(item, req); got != "pending" {
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
