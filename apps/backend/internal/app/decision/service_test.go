package decision

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestServiceStoresCandidatesAndSelectionInBackend(t *testing.T) {
	db := testutil.OpenSQLite(t, "decision.db",
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.DecisionContext{},
	)
	project := persistencemodel.Project{Name: "Demo", OwnerID: 1}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	service := NewService(db)
	target := TargetInput{ProjectID: project.ID, TargetKind: "content_unit", TargetRef: "content_units/cu_storyboard_ref"}
	actorID := uint(7)

	stored, err := service.ReplaceCandidates(context.Background(), ReplaceCandidatesInput{
		TargetInput: target,
		Candidates: []json.RawMessage{
			json.RawMessage(`{"id":"candidate_a","resource_id":101,"source":"ai_generate"}`),
			json.RawMessage(`{"id":"candidate_b","resource_id":102,"source":"upload"}`),
		},
		ActorID: &actorID,
	})
	if err != nil {
		t.Fatalf("replace candidates: %v", err)
	}
	if stored.ProjectID != project.ID || stored.TargetKind != "content_unit" || stored.TargetRef != "content_units/cu_storyboard_ref" {
		t.Fatalf("unexpected decision target: %#v", stored)
	}
	if len(stored.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2", len(stored.Candidates))
	}

	selected, err := service.Select(context.Background(), SelectInput{
		TargetInput: target,
		CandidateID: "candidate_b",
		Reason:      "manual_review",
		SelectedBy:  &actorID,
		ActorID:     &actorID,
	})
	if err != nil {
		t.Fatalf("select candidate: %v", err)
	}
	if selected.Status != "selected" {
		t.Fatalf("status = %q, want selected", selected.Status)
	}
	var selection struct {
		CandidateID string `json:"candidate_id"`
		Reason      string `json:"reason"`
	}
	if err := json.Unmarshal(selected.Selection, &selection); err != nil {
		t.Fatalf("selection json: %v", err)
	}
	if selection.CandidateID != "candidate_b" || selection.Reason != "manual_review" {
		t.Fatalf("unexpected selection: %#v", selection)
	}

	readBack, err := service.Get(context.Background(), target)
	if err != nil {
		t.Fatalf("get decision: %v", err)
	}
	if len(readBack.Candidates) != 2 || len(readBack.Selection) == 0 {
		t.Fatalf("read back did not include backend candidates and selection: %#v", readBack)
	}

	cleared, err := service.ClearSelection(context.Background(), target, &actorID)
	if err != nil {
		t.Fatalf("clear selection: %v", err)
	}
	if cleared.Status != "open" || len(cleared.Selection) != 0 {
		t.Fatalf("selection not cleared: %#v", cleared)
	}
}

func TestServiceRejectsSelectionForMissingCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "decision.db",
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.DecisionContext{},
	)
	project := persistencemodel.Project{Name: "Demo", OwnerID: 1}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	service := NewService(db)
	target := TargetInput{ProjectID: project.ID, TargetKind: "content_unit", TargetRef: "content_units/cu_storyboard_ref"}
	if _, err := service.ReplaceCandidates(context.Background(), ReplaceCandidatesInput{
		TargetInput: target,
		Candidates:  []json.RawMessage{json.RawMessage(`{"id":"candidate_a","resource_id":101}`)},
	}); err != nil {
		t.Fatalf("replace candidates: %v", err)
	}

	_, err := service.Select(context.Background(), SelectInput{
		TargetInput: target,
		CandidateID: "missing",
	})
	if !errors.Is(err, ErrCandidateNotFound) {
		t.Fatalf("select missing candidate error = %v, want ErrCandidateNotFound", err)
	}
}
