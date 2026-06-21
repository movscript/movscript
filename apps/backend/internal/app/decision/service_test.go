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

func TestServiceQueriesDecisionsByTargetRefs(t *testing.T) {
	db := testutil.OpenSQLite(t, "decision-query.db",
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.DecisionContext{},
	)
	project := persistencemodel.Project{Name: "Demo", OwnerID: 1}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	service := NewService(db)
	for _, ref := range []string{"content_units/cu_a", "content_units/cu_b"} {
		if _, err := service.ReplaceCandidates(context.Background(), ReplaceCandidatesInput{
			TargetInput: TargetInput{ProjectID: project.ID, TargetKind: "content_unit", TargetRef: ref},
			Candidates:  []json.RawMessage{json.RawMessage(`{"id":"candidate_a","resource_id":101}`)},
		}); err != nil {
			t.Fatalf("replace candidates for %s: %v", ref, err)
		}
	}

	results, err := service.Query(context.Background(), QueryTargetsInput{
		ProjectID:  project.ID,
		TargetKind: "content_unit",
		TargetRefs: []string{"content_units/cu_a", "content_units/missing", "content_units/cu_a", "content_units/cu_b"},
	})
	if err != nil {
		t.Fatalf("query decisions: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("result count = %d, want 2", len(results))
	}
	seen := map[string]bool{}
	for _, result := range results {
		seen[result.TargetRef] = true
	}
	if !seen["content_units/cu_a"] || !seen["content_units/cu_b"] || seen["content_units/missing"] {
		t.Fatalf("unexpected query refs: %#v", seen)
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

func TestProjectDataServiceStoresCandidatesUnderScopedProjectUID(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-data-decision.db",
		&persistencemodel.User{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
	)

	service := NewProjectDataService(db)
	actorID := uint(7)
	target := ProjectDataTargetInput{
		ProjectDataSpaceInput: ProjectDataSpaceInput{
			ProjectDataScopeInput: ProjectDataScopeInput{ScopeKind: ProjectDataScopeUser, ScopeID: "7"},
			ProjectUID:            "prj_same_uid",
			Title:                 "Local Project",
			ActorID:               &actorID,
		},
		TargetKind: "content_unit",
		TargetRef:  "content_units/cu_storyboard_ref",
	}

	stored, err := service.ReplaceCandidates(context.Background(), ProjectDataReplaceCandidatesInput{
		ProjectDataTargetInput: target,
		Candidates: []json.RawMessage{
			json.RawMessage(`{"id":"candidate_a","resource_id":101}`),
			json.RawMessage(`{"id":"candidate_b","resource_id":102}`),
		},
	})
	if err != nil {
		t.Fatalf("replace scoped candidates: %v", err)
	}
	if stored.ProjectUID != "prj_same_uid" || stored.ScopeKind != ProjectDataScopeUser || stored.ScopeID != "7" {
		t.Fatalf("unexpected scoped decision identity: %#v", stored)
	}
	if stored.ProjectDataSpaceID == 0 || len(stored.Candidates) != 2 {
		t.Fatalf("unexpected stored context: %#v", stored)
	}

	selected, err := service.Select(context.Background(), ProjectDataSelectInput{
		ProjectDataTargetInput: target,
		CandidateID:            "candidate_b",
		Reason:                 "manual_review",
		SelectedBy:             &actorID,
	})
	if err != nil {
		t.Fatalf("select scoped candidate: %v", err)
	}
	if selected.Status != "selected" || len(selected.Selection) == 0 {
		t.Fatalf("selection not stored: %#v", selected)
	}

	orgTarget := target
	orgTarget.ProjectDataScopeInput = ProjectDataScopeInput{ScopeKind: ProjectDataScopeOrg, ScopeID: "7"}
	if _, err := service.EnsureSpace(context.Background(), orgTarget.ProjectDataSpaceInput); err != nil {
		t.Fatalf("ensure org scoped data space: %v", err)
	}

	userSpaces, err := service.ListSpaces(context.Background(), ProjectDataScopeInput{ScopeKind: ProjectDataScopeUser, ScopeID: "7"})
	if err != nil {
		t.Fatalf("list user scoped spaces: %v", err)
	}
	if len(userSpaces) != 1 {
		t.Fatalf("user space count = %d, want 1", len(userSpaces))
	}
	if userSpaces[0].ProjectUID != "prj_same_uid" || userSpaces[0].CandidateCount != 2 || userSpaces[0].SelectionCount != 1 {
		t.Fatalf("unexpected user space summary: %#v", userSpaces[0])
	}

	orgSpaces, err := service.ListSpaces(context.Background(), ProjectDataScopeInput{ScopeKind: ProjectDataScopeOrg, ScopeID: "7"})
	if err != nil {
		t.Fatalf("list org scoped spaces: %v", err)
	}
	if len(orgSpaces) != 1 || orgSpaces[0].ProjectUID != "prj_same_uid" || orgSpaces[0].DecisionCount != 0 {
		t.Fatalf("unexpected org space summary: %#v", orgSpaces)
	}
}

func TestProjectDataQueryMissingSpaceReturnsEmpty(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-data-query-empty.db",
		&persistencemodel.User{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
	)

	service := NewProjectDataService(db)
	result, err := service.Query(context.Background(), ProjectDataQueryTargetsInput{
		ProjectDataSpaceInput: ProjectDataSpaceInput{
			ProjectDataScopeInput: ProjectDataScopeInput{ScopeKind: ProjectDataScopeUser, ScopeID: "7"},
			ProjectUID:            "prj_empty",
		},
		TargetKind: "content_unit",
		TargetRefs: []string{"content_units/cu_missing"},
	})
	if err != nil {
		t.Fatalf("query missing scoped project data space: %v", err)
	}
	if len(result) != 0 {
		t.Fatalf("missing scoped project data query returned %#v, want empty", result)
	}
}
