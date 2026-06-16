package runner

import (
	"strconv"
	"time"

	"github.com/movscript/movscript/internal/app/systemstream"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

type generationJobStatusPayload struct {
	JobID          uint   `json:"jobId"`
	Status         string `json:"status,omitempty"`
	ProjectID      *uint  `json:"projectId,omitempty"`
	JobType        string `json:"jobType,omitempty"`
	ProviderTaskID string `json:"providerTaskId,omitempty"`
	Message        string `json:"message,omitempty"`
	UpdatedAt      string `json:"updatedAt"`
	Source         string `json:"source"`
}

func (w *Worker) publishGenerationJobStatus(job *persistencemodel.Job, message string) {
	if w == nil || w.systemMessages == nil || job == nil || job.ID == 0 {
		return
	}
	snapshot := *job
	if w.db != nil {
		var loaded persistencemodel.Job
		if err := w.db.Select(
			"id",
			"user_id",
			"org_id",
			"project_id",
			"job_type",
			"status",
			"provider_task_id",
			"error_msg",
			"updated_at",
		).First(&loaded, job.ID).Error; err == nil {
			snapshot = loaded
		}
	}
	updatedAt := snapshot.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = time.Now().UTC()
	}
	scope := systemstream.Scope{Kind: systemstream.ScopeUser, ID: strconv.FormatUint(uint64(snapshot.UserID), 10)}
	if snapshot.OrgID != nil && *snapshot.OrgID != 0 {
		scope = systemstream.Scope{Kind: systemstream.ScopeOrg, ID: strconv.FormatUint(uint64(*snapshot.OrgID), 10)}
	}
	w.systemMessages.Publish(systemstream.Message{
		Topic:  systemstream.TopicGenerationJob,
		Type:   systemstream.TypeJobStatusChanged,
		Scope:  scope,
		Entity: systemstream.EntityRef("job", snapshot.ID),
		Payload: generationJobStatusPayload{
			JobID:          snapshot.ID,
			Status:         snapshot.Status,
			ProjectID:      snapshot.ProjectID,
			JobType:        snapshot.JobType,
			ProviderTaskID: snapshot.ProviderTaskID,
			Message:        firstNonEmpty(message, snapshot.ErrorMsg),
			UpdatedAt:      updatedAt.UTC().Format(time.RFC3339Nano),
			Source:         "backend-job-runner",
		},
	})
}
