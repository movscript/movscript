package contentcandidate

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func ReconcileDecisionCandidates(ctx context.Context, db *gorm.DB, projectID uint, targetRefs []string) error {
	if db == nil || projectID == 0 {
		return nil
	}
	targetRefs = normalizedTargetRefs(targetRefs)
	if len(targetRefs) == 0 {
		return nil
	}
	var rows []persistencemodel.DecisionContext
	if err := db.WithContext(ctx).
		Where("project_id = ? AND target_kind = ? AND target_ref IN ?", projectID, TargetKindContentUnit, targetRefs).
		Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		next, changed := reconcileCandidatesJSON(ctx, db, row.TargetRef, row.CandidatesJSON)
		if !changed {
			continue
		}
		if err := db.WithContext(ctx).
			Model(&persistencemodel.DecisionContext{}).
			Where("id = ?", row.ID).
			Update("candidates_json", next).Error; err != nil {
			return err
		}
	}
	return nil
}

func reconcileCandidatesJSON(ctx context.Context, db *gorm.DB, targetRef string, value string) (string, bool) {
	var candidates []map[string]any
	if err := json.Unmarshal([]byte(value), &candidates); err != nil || len(candidates) == 0 {
		return value, false
	}
	changed := false
	contentUnitID := strings.TrimPrefix(targetRef, "content_units/")
	for index, candidate := range candidates {
		status := strings.ToLower(stringFrom(candidate["status"]))
		if status != "queued" && status != "pending" && status != "running" {
			continue
		}
		jobID := jobIDFromCandidate(candidate)
		if jobID == 0 {
			continue
		}
		var job persistencemodel.Job
		if err := db.WithContext(ctx).
			Select("id", "job_type", "status", "output_resource_id", "request_context", "created_at").
			First(&job, jobID).Error; err != nil {
			continue
		}
		if job.Status != "succeeded" && job.Status != "failed" && job.Status != "cancelled" {
			continue
		}
		resourceID := uint(0)
		if job.Status == "succeeded" {
			if job.OutputResourceID == nil || *job.OutputResourceID == 0 {
				continue
			}
			resourceID = *job.OutputResourceID
		}
		promptSnapshot := rawObject(candidate["prompt_snapshot"])
		outputKind := normalizeOutputKind(firstNonEmpty(stringFrom(promptSnapshot["output_kind"]), outputKindFromJobType(job.JobType)))
		if outputKind == "" {
			outputKind = "image"
		}
		candidateID := stringFrom(candidate["id"])
		if candidateID == "" {
			continue
		}
		createdAt := job.CreatedAt
		if existingCreatedAt := stringFrom(candidate["created_at"]); existingCreatedAt != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, existingCreatedAt); err == nil {
				createdAt = parsed
			}
		}
		nextRaw := BuildCandidate(CandidateBuildInput{
			ContentUnitID:  contentUnitID,
			CandidateID:    candidateID,
			OutputKind:     outputKind,
			Status:         job.Status,
			JobID:          job.ID,
			ModelID:        firstNonEmpty(modelIDFromCandidate(candidate), modelIDFromRequestContext(job.RequestContext)),
			JobType:        job.JobType,
			ResourceID:     resourceID,
			PromptSnapshot: mustMarshalRaw(promptSnapshot),
			CreatedAt:      createdAt,
		})
		var nextCandidate map[string]any
		if err := json.Unmarshal(nextRaw, &nextCandidate); err != nil {
			continue
		}
		candidates[index] = nextCandidate
		changed = true
	}
	if !changed {
		return value, false
	}
	raw, err := json.Marshal(candidates)
	if err != nil {
		return value, false
	}
	return string(raw), true
}

func normalizedTargetRefs(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func jobIDFromCandidate(candidate map[string]any) uint {
	if producer, ok := candidate["producer"].(map[string]any); ok {
		if id := uintFrom(producer["job_id"]); id != 0 {
			return id
		}
	}
	if promptSnapshot, ok := candidate["prompt_snapshot"].(map[string]any); ok {
		return uintFrom(promptSnapshot["job_id"])
	}
	return 0
}

func modelIDFromCandidate(candidate map[string]any) string {
	if producer, ok := candidate["producer"].(map[string]any); ok {
		return firstNonEmpty(stringFrom(producer["model_id"]), stringFrom(producer["model"]))
	}
	return ""
}

func outputKindFromJobType(jobType string) string {
	if strings.HasPrefix(jobType, "video") {
		return "video"
	}
	return "image"
}

func rawObject(value any) map[string]any {
	if object, ok := value.(map[string]any); ok {
		return object
	}
	return map[string]any{}
}

func mustMarshalRaw(value map[string]any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	return raw
}

func stringFrom(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func uintFrom(value any) uint {
	switch typed := value.(type) {
	case float64:
		if typed > 0 {
			return uint(typed)
		}
	case uint:
		return typed
	case int:
		if typed > 0 {
			return uint(typed)
		}
	case string:
		parsed, err := strconv.ParseUint(strings.TrimSpace(typed), 10, 64)
		if err == nil {
			return uint(parsed)
		}
	case json.Number:
		parsed, err := strconv.ParseUint(strings.TrimSpace(typed.String()), 10, 64)
		if err == nil {
			return uint(parsed)
		}
	}
	return 0
}
