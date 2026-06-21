package contentcandidate

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	appdecision "github.com/movscript/movscript/internal/app/decision"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestSyncJobSucceededUpdatesBoundContentUnitCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "content-candidate-sync.db", &persistencemodel.DecisionContext{})
	ctx := context.Background()
	promptSnapshot := json.RawMessage(`{"schema":"movscript.content_unit_generation_prompt_snapshot.v1","model_params":{"quality":"auto"}}`)
	pending := BuildCandidate(CandidateBuildInput{
		ContentUnitID:  "cu_asset_1",
		CandidateID:    "candidate_1",
		OutputKind:     "image",
		Status:         "pending",
		JobID:          42,
		ModelID:        "gpt-image-2",
		JobType:        "image",
		PromptSnapshot: promptSnapshot,
		CreatedAt:      time.Date(2026, 6, 21, 4, 0, 0, 0, time.UTC),
	})
	decisionService := appdecision.NewService(db)
	if _, err := decisionService.UpsertCandidate(ctx, appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  7,
			TargetKind: TargetKindContentUnit,
			TargetRef:  "content_units/cu_asset_1",
		},
		Candidate: pending,
	}); err != nil {
		t.Fatalf("upsert pending candidate: %v", err)
	}

	requestContext, _ := json.Marshal(map[string]any{
		"model": map[string]any{
			"identifier": "gpt-image-2",
		},
		"content_unit_candidate": domainjob.ContentUnitCandidateBinding{
			ProjectID:      7,
			ContentUnitID:  "cu_asset_1",
			TargetKind:     TargetKindContentUnit,
			TargetRef:      "content_units/cu_asset_1",
			CandidateID:    "candidate_1",
			OutputKind:     "image",
			PromptSnapshot: promptSnapshot,
		},
	})
	job := &persistencemodel.Job{
		JobType:        "image",
		RequestContext: string(requestContext),
	}
	job.ID = 42
	job.CreatedAt = time.Date(2026, 6, 21, 4, 0, 0, 0, time.UTC)

	if err := SyncJobSucceeded(ctx, db, job, 99); err != nil {
		t.Fatalf("sync succeeded candidate: %v", err)
	}

	decision, err := decisionService.Get(ctx, appdecision.TargetInput{
		ProjectID:  7,
		TargetKind: TargetKindContentUnit,
		TargetRef:  "content_units/cu_asset_1",
	})
	if err != nil {
		t.Fatalf("get decision: %v", err)
	}
	if len(decision.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(decision.Candidates))
	}
	var candidate struct {
		ID      string `json:"id"`
		Status  string `json:"status"`
		Outputs []struct {
			Kind       string `json:"kind"`
			ResourceID uint   `json:"resource_id"`
		} `json:"outputs"`
		Producer struct {
			JobID uint `json:"job_id"`
		} `json:"producer"`
	}
	if err := json.Unmarshal(decision.Candidates[0], &candidate); err != nil {
		t.Fatalf("decode candidate: %v", err)
	}
	if candidate.ID != "candidate_1" || candidate.Status != "succeeded" || candidate.Producer.JobID != 42 {
		t.Fatalf("candidate = %#v, want succeeded candidate_1 for job 42", candidate)
	}
	if len(candidate.Outputs) != 1 || candidate.Outputs[0].Kind != "image" || candidate.Outputs[0].ResourceID != 99 {
		t.Fatalf("outputs = %#v, want image resource 99", candidate.Outputs)
	}
}

func TestReconcileDecisionCandidatesRepairsCompletedLegacyCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "content-candidate-reconcile.db",
		&persistencemodel.DecisionContext{},
		&persistencemodel.Job{},
	)
	ctx := context.Background()
	resourceID := uint(88)
	job := persistencemodel.Job{
		JobType:          "image",
		Status:           "succeeded",
		OutputResourceID: &resourceID,
		RequestContext:   `{"model":{"identifier":"gpt-image-2"}}`,
	}
	job.ID = 9
	job.CreatedAt = time.Date(2026, 6, 21, 5, 0, 0, 0, time.UTC)
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	pending := json.RawMessage(`{
		"schema":"movscript.content_candidate.v1",
		"id":"legacy_candidate",
		"source":"ai_generate",
		"status":"pending",
		"producer":{"kind":"generation","job_id":9,"model_id":"gpt-image-2"},
		"outputs":[],
		"prompt_snapshot":{"output_kind":"image","job_id":9}
	}`)
	decisionService := appdecision.NewService(db)
	if _, err := decisionService.UpsertCandidate(ctx, appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  3,
			TargetKind: TargetKindContentUnit,
			TargetRef:  "content_units/cu_legacy",
		},
		Candidate: pending,
	}); err != nil {
		t.Fatalf("upsert pending candidate: %v", err)
	}

	if err := ReconcileDecisionCandidates(ctx, db, 3, []string{"content_units/cu_legacy"}); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	decision, err := decisionService.Get(ctx, appdecision.TargetInput{
		ProjectID:  3,
		TargetKind: TargetKindContentUnit,
		TargetRef:  "content_units/cu_legacy",
	})
	if err != nil {
		t.Fatalf("get decision: %v", err)
	}
	var candidate struct {
		Status  string `json:"status"`
		Outputs []struct {
			ResourceID uint `json:"resource_id"`
		} `json:"outputs"`
	}
	if err := json.Unmarshal(decision.Candidates[0], &candidate); err != nil {
		t.Fatalf("decode candidate: %v", err)
	}
	if candidate.Status != "succeeded" || len(candidate.Outputs) != 1 || candidate.Outputs[0].ResourceID != 88 {
		t.Fatalf("candidate = %#v, want reconciled succeeded resource 88", candidate)
	}
}
