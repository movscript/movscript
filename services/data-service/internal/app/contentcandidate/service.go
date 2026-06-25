package contentcandidate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	appdecision "github.com/movscript/movscript/internal/app/decision"
	jobapp "github.com/movscript/movscript/internal/app/job"
	domaindecision "github.com/movscript/movscript/internal/domain/decision"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	TargetKindContentUnit = "content_unit"
)

var (
	ErrInvalidInput      = errors.New("invalid content unit candidate generation input")
	ErrUnsupportedOutput = errors.New("unsupported content unit candidate output kind")
)

type Service struct {
	db        *gorm.DB
	jobs      *jobapp.Service
	decisions *appdecision.Service
}

func NewService(db *gorm.DB, aiService *ai.AIService) *Service {
	return &Service{
		db:        db,
		jobs:      jobapp.NewService(db, aiService),
		decisions: appdecision.NewService(db),
	}
}

type GenerateInput struct {
	ProjectID        uint
	UserID           uint
	OrgID            *uint
	ContentUnitID    string
	CandidateID      string
	OutputKind       string
	ModelID          string
	JobType          string
	Title            string
	Prompt           string
	ExtraParams      string
	AspectRatio      string
	Duration         int
	InputResourceIDs []uint
	PromptSnapshot   json.RawMessage
	CreatedAt        time.Time
}

type GenerateResult struct {
	Job             domainjob.Job          `json:"job"`
	Candidate       json.RawMessage        `json:"candidate"`
	DecisionContext domaindecision.Context `json:"decision_context"`
}

func (s *Service) Generate(ctx context.Context, input GenerateInput) (GenerateResult, error) {
	normalized, err := normalizeGenerateInput(input)
	if err != nil {
		return GenerateResult{}, err
	}
	projectID := normalized.ProjectID
	binding := domainjob.ContentUnitCandidateBinding{
		ProjectID:      projectID,
		ContentUnitID:  normalized.ContentUnitID,
		TargetKind:     TargetKindContentUnit,
		TargetRef:      contentUnitTargetRef(normalized.ContentUnitID),
		CandidateID:    normalized.CandidateID,
		OutputKind:     normalized.OutputKind,
		PromptSnapshot: normalized.PromptSnapshot,
	}
	job, err := s.jobs.EnqueueGeneration(ctx, jobapp.EnqueueInput{
		UserID:               normalized.UserID,
		OrgID:                normalized.OrgID,
		ModelID:              normalized.ModelID,
		JobType:              normalized.JobType,
		FeatureKey:           contentUnitGenerationFeatureKey(normalized.OutputKind),
		Title:                normalized.Title,
		Prompt:               normalized.Prompt,
		ExtraParams:          normalized.ExtraParams,
		AspectRatio:          normalized.AspectRatio,
		Duration:             normalized.Duration,
		InputResourceIDs:     normalized.InputResourceIDs,
		ProjectID:            &projectID,
		CreatedAt:            normalized.CreatedAt,
		ContentUnitCandidate: &binding,
	})
	if err != nil {
		return GenerateResult{}, err
	}
	candidate := BuildCandidate(CandidateBuildInput{
		ContentUnitID:  normalized.ContentUnitID,
		CandidateID:    normalized.CandidateID,
		OutputKind:     normalized.OutputKind,
		Status:         statusOr(job.Status, "pending"),
		JobID:          job.ID,
		ModelID:        normalized.ModelID,
		JobType:        job.JobType,
		PromptSnapshot: normalized.PromptSnapshot,
		CreatedAt:      job.CreatedAt,
	})
	decisionContext, err := s.decisions.UpsertCandidate(ctx, appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  projectID,
			TargetKind: TargetKindContentUnit,
			TargetRef:  contentUnitTargetRef(normalized.ContentUnitID),
		},
		Candidate: candidate,
		ActorID:   &normalized.UserID,
	})
	if err != nil {
		return GenerateResult{}, err
	}
	return GenerateResult{
		Job:             job,
		Candidate:       candidate,
		DecisionContext: decisionContext,
	}, nil
}

type CandidateBuildInput struct {
	ContentUnitID  string
	CandidateID    string
	OutputKind     string
	Status         string
	JobID          uint
	ModelID        string
	JobType        string
	ResourceID     uint
	PromptSnapshot json.RawMessage
	CreatedAt      time.Time
}

func BuildCandidate(input CandidateBuildInput) json.RawMessage {
	promptSnapshot := promptSnapshotObject(input.PromptSnapshot)
	if _, ok := promptSnapshot["schema"]; !ok {
		promptSnapshot["schema"] = "movscript.content_unit_generation_prompt_snapshot.v1"
	}
	promptSnapshot["content_unit_id"] = input.ContentUnitID
	promptSnapshot["content_unit_ref"] = contentUnitTargetRef(input.ContentUnitID)
	promptSnapshot["output_kind"] = input.OutputKind
	if input.ModelID != "" {
		promptSnapshot["model_id"] = input.ModelID
	}
	if input.JobID != 0 {
		promptSnapshot["job_id"] = input.JobID
		promptSnapshot["input_hash"] = fmt.Sprintf("job:%d", input.JobID)
	}

	producer := map[string]any{
		"kind":   "generation",
		"tool":   contentUnitGenerationToolName(input.OutputKind),
		"job_id": input.JobID,
	}
	if input.ModelID != "" {
		producer["model_id"] = input.ModelID
	}
	if input.JobType != "" {
		producer["job_type"] = input.JobType
	}
	if modelParams, ok := promptSnapshot["model_params"].(map[string]any); ok && len(modelParams) > 0 {
		producer["model_params"] = modelParams
	}

	outputs := []map[string]any{}
	if input.ResourceID != 0 {
		outputs = append(outputs, map[string]any{
			"kind":        input.OutputKind,
			"resource_id": input.ResourceID,
			"metadata": map[string]any{
				"job_id": input.JobID,
				"tool":   contentUnitGenerationMonitorToolName(input.OutputKind),
			},
		})
	}
	createdAt := input.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	record := map[string]any{
		"schema":           "movscript.content_candidate.v1",
		"id":               input.CandidateID,
		"content_unit_ref": contentUnitTargetRef(input.ContentUnitID),
		"source":           "ai_generate",
		"status":           statusOr(input.Status, "pending"),
		"producer":         producer,
		"outputs":          outputs,
		"prompt_snapshot":  promptSnapshot,
		"created_at":       createdAt.Format(time.RFC3339Nano),
	}
	raw, err := json.Marshal(record)
	if err != nil {
		return json.RawMessage(`{"schema":"movscript.content_candidate.v1","id":"invalid","source":"ai_generate","status":"failed"}`)
	}
	return raw
}

func SyncJobSucceeded(ctx context.Context, db *gorm.DB, job *persistencemodel.Job, resourceID uint) error {
	return syncJobCandidate(ctx, db, job, "succeeded", resourceID)
}

func SyncJobFailed(ctx context.Context, db *gorm.DB, job *persistencemodel.Job, status string) error {
	return syncJobCandidate(ctx, db, job, statusOr(status, "failed"), 0)
}

func syncJobCandidate(ctx context.Context, db *gorm.DB, job *persistencemodel.Job, status string, resourceID uint) error {
	binding, ok := ContentUnitCandidateBindingFromRequestContext(job.RequestContext)
	if !ok {
		return nil
	}
	candidate := BuildCandidate(CandidateBuildInput{
		ContentUnitID:  binding.ContentUnitID,
		CandidateID:    binding.CandidateID,
		OutputKind:     binding.OutputKind,
		Status:         status,
		JobID:          job.ID,
		ModelID:        modelIDFromRequestContext(job.RequestContext),
		JobType:        job.JobType,
		ResourceID:     resourceID,
		PromptSnapshot: binding.PromptSnapshot,
		CreatedAt:      job.CreatedAt,
	})
	_, err := appdecision.NewService(db).UpsertCandidate(ctx, appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  binding.ProjectID,
			TargetKind: TargetKindContentUnit,
			TargetRef:  firstNonEmpty(binding.TargetRef, contentUnitTargetRef(binding.ContentUnitID)),
		},
		Candidate: candidate,
	})
	return err
}

func ContentUnitCandidateBindingFromRequestContext(value string) (domainjob.ContentUnitCandidateBinding, bool) {
	var snapshot struct {
		ContentUnitCandidate *domainjob.ContentUnitCandidateBinding `json:"content_unit_candidate"`
	}
	if err := json.Unmarshal([]byte(value), &snapshot); err != nil || snapshot.ContentUnitCandidate == nil {
		return domainjob.ContentUnitCandidateBinding{}, false
	}
	binding := *snapshot.ContentUnitCandidate
	binding.ContentUnitID = strings.TrimSpace(binding.ContentUnitID)
	binding.CandidateID = strings.TrimSpace(binding.CandidateID)
	binding.OutputKind = normalizeOutputKind(binding.OutputKind)
	if binding.ProjectID == 0 || binding.ContentUnitID == "" || binding.CandidateID == "" || binding.OutputKind == "" {
		return domainjob.ContentUnitCandidateBinding{}, false
	}
	if strings.TrimSpace(binding.TargetRef) == "" {
		binding.TargetRef = contentUnitTargetRef(binding.ContentUnitID)
	}
	if strings.TrimSpace(binding.TargetKind) == "" {
		binding.TargetKind = TargetKindContentUnit
	}
	return binding, true
}

func normalizeGenerateInput(input GenerateInput) (GenerateInput, error) {
	input.ContentUnitID = strings.TrimSpace(input.ContentUnitID)
	input.CandidateID = strings.TrimSpace(input.CandidateID)
	input.OutputKind = normalizeOutputKind(input.OutputKind)
	input.ModelID = strings.TrimSpace(input.ModelID)
	input.JobType = strings.TrimSpace(input.JobType)
	input.Prompt = strings.TrimSpace(input.Prompt)
	if input.CreatedAt.IsZero() {
		input.CreatedAt = time.Now()
	}
	if input.CandidateID == "" {
		input.CandidateID = fmt.Sprintf("content_candidate_%d", input.CreatedAt.UnixNano())
	}
	if input.ProjectID == 0 || input.UserID == 0 || input.ContentUnitID == "" || input.ModelID == "" || input.Prompt == "" {
		return GenerateInput{}, ErrInvalidInput
	}
	if input.OutputKind == "" {
		return GenerateInput{}, ErrUnsupportedOutput
	}
	if input.JobType == "" {
		input.JobType = input.OutputKind
	}
	if input.Title == "" {
		input.Title = "Content unit " + input.OutputKind + " generation"
	}
	return input, nil
}

func promptSnapshotObject(raw json.RawMessage) map[string]any {
	out := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

func normalizeOutputKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image":
		return "image"
	case "video":
		return "video"
	default:
		return ""
	}
}

func contentUnitTargetRef(contentUnitID string) string {
	return "content_units/" + strings.TrimSpace(contentUnitID)
}

func contentUnitGenerationFeatureKey(outputKind string) string {
	if outputKind == "video" {
		return "electron.generation.content_unit.video"
	}
	return "electron.generation.content_unit.image"
}

func contentUnitGenerationToolName(outputKind string) string {
	if outputKind == "video" {
		return "generation_content_unit_video_generate"
	}
	return "generation_content_unit_image_generate"
}

func contentUnitGenerationMonitorToolName(outputKind string) string {
	if outputKind == "video" {
		return "generation_content_unit_video_job_get"
	}
	return "generation_content_unit_image_job_get"
}

func modelIDFromRequestContext(value string) string {
	var snapshot struct {
		Model struct {
			Identifier string `json:"identifier"`
			ModelDefID string `json:"model_def_id"`
		} `json:"model"`
	}
	if err := json.Unmarshal([]byte(value), &snapshot); err != nil {
		return ""
	}
	return firstNonEmpty(snapshot.Model.Identifier, snapshot.Model.ModelDefID)
}

func statusOr(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
