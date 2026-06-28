package contentcandidate

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	appdecision "github.com/movscript/movscript/internal/app/decision"
	jobapp "github.com/movscript/movscript/internal/app/job"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestGenerateCreatesScopedProjectDataCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "content-candidate-generate-project-data.db",
		&persistencemodel.Project{},
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.DecisionContext{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	ctx := context.Background()
	project := persistencemodel.Project{Name: "Canvas Generate", ProjectUID: "prj_canvas_generate", OwnerID: 5}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "canvas-test-image",
		DisplayName:           "Canvas Test Image",
		Capabilities:          ai.CapabilityImage,
		ModelCapabilitiesJSON: `{"image_generation":{"operations":["text_to_image"]}}`,
		IsEnabled:             true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:            "default",
		ProviderModelID:       "canvas-test-image",
		IsEnabled:             true,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"image_generation":{"operations":["text_to_image"]}}`,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	result, err := service.Generate(ctx, GenerateInput{
		ProjectID:     project.ID,
		UserID:        5,
		ContentUnitID: "cu_asset_1",
		CandidateID:   "candidate_pending",
		ProjectUID:    "prj_canvas_generate",
		ProjectTitle:  "Canvas Generate",
		ScopeKind:     appdecision.ProjectDataScopeUser,
		ScopeID:       "5",
		OutputKind:    "image",
		ModelID:       "canvas-test-image",
		JobType:       ai.CapabilityImage,
		GenerationIntent: &jobapp.GenerationIntentInput{
			Capability: ai.CapabilityFamilyImageGeneration,
			Operation:  ai.ImageOperationTextToImage,
		},
		Prompt:         "draw a clean reference frame",
		PromptSnapshot: json.RawMessage(`{"prompt":"draw a clean reference frame"}`),
	})
	if err != nil {
		t.Fatalf("generate candidate: %v", err)
	}
	if result.ProjectDataDecisionContext == nil {
		t.Fatal("generate result did not include project data decision context")
	}

	projectDataDecision, err := appdecision.NewProjectDataService(db).Get(ctx, appdecision.ProjectDataTargetInput{
		ProjectDataSpaceInput: appdecision.ProjectDataSpaceInput{
			ProjectDataScopeInput: appdecision.ProjectDataScopeInput{
				ScopeKind: appdecision.ProjectDataScopeUser,
				ScopeID:   "5",
			},
			ProjectUID: "prj_canvas_generate",
		},
		TargetKind: TargetKindContentUnit,
		TargetRef:  "content_units/cu_asset_1",
	})
	if err != nil {
		t.Fatalf("get project data decision: %v", err)
	}
	if len(projectDataDecision.Candidates) != 1 {
		t.Fatalf("project data candidate count = %d, want 1", len(projectDataDecision.Candidates))
	}
	var candidate struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Producer struct {
			JobID uint `json:"job_id"`
		} `json:"producer"`
	}
	if err := json.Unmarshal(projectDataDecision.Candidates[0], &candidate); err != nil {
		t.Fatalf("decode project data candidate: %v", err)
	}
	if candidate.ID != "candidate_pending" || candidate.Status != "pending" || candidate.Producer.JobID != result.Job.ID {
		t.Fatalf("project data candidate = %#v, want pending candidate for job %d", candidate, result.Job.ID)
	}
}

func TestSyncJobSucceededUpdatesBoundContentUnitCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "content-candidate-sync.db",
		&persistencemodel.DecisionContext{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
	)
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
			ProjectUID:     "prj_canvas_generate",
			ProjectTitle:   "Canvas Generate",
			ScopeKind:      appdecision.ProjectDataScopeUser,
			ScopeID:        "5",
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
		UserID:         5,
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

	projectDataDecision, err := appdecision.NewProjectDataService(db).Get(ctx, appdecision.ProjectDataTargetInput{
		ProjectDataSpaceInput: appdecision.ProjectDataSpaceInput{
			ProjectDataScopeInput: appdecision.ProjectDataScopeInput{
				ScopeKind: appdecision.ProjectDataScopeUser,
				ScopeID:   "5",
			},
			ProjectUID: "prj_canvas_generate",
		},
		TargetKind: TargetKindContentUnit,
		TargetRef:  "content_units/cu_asset_1",
	})
	if err != nil {
		t.Fatalf("get project data decision: %v", err)
	}
	if len(projectDataDecision.Candidates) != 1 {
		t.Fatalf("project data candidate count = %d, want 1", len(projectDataDecision.Candidates))
	}
	var projectDataCandidate struct {
		ID      string `json:"id"`
		Status  string `json:"status"`
		Outputs []struct {
			ResourceID uint `json:"resource_id"`
		} `json:"outputs"`
	}
	if err := json.Unmarshal(projectDataDecision.Candidates[0], &projectDataCandidate); err != nil {
		t.Fatalf("decode project data candidate: %v", err)
	}
	if projectDataCandidate.ID != "candidate_1" || projectDataCandidate.Status != "succeeded" || len(projectDataCandidate.Outputs) != 1 || projectDataCandidate.Outputs[0].ResourceID != 99 {
		t.Fatalf("project data candidate = %#v, want succeeded candidate_1 with resource 99", projectDataCandidate)
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
