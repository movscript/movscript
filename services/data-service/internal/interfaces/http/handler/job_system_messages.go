package handler

import (
	"strconv"
	"time"

	"github.com/movscript/movscript/internal/app/systemstream"
	domainjob "github.com/movscript/movscript/internal/domain/job"
)

type jobStatusSystemPayload struct {
	JobID          uint   `json:"jobId"`
	Status         string `json:"status,omitempty"`
	ProjectID      *uint  `json:"projectId,omitempty"`
	JobType        string `json:"jobType,omitempty"`
	ProviderTaskID string `json:"providerTaskId,omitempty"`
	Message        string `json:"message,omitempty"`
	UpdatedAt      string `json:"updatedAt"`
	Source         string `json:"source"`
}

func (h *JobHandler) publishJobStatus(job domainjob.Job, message string) {
	if h == nil || h.systemMessages == nil || job.ID == 0 {
		return
	}
	scope := systemstream.Scope{Kind: systemstream.ScopeUser, ID: strconv.FormatUint(uint64(job.UserID), 10)}
	if job.OrgID != nil && *job.OrgID != 0 {
		scope = systemstream.Scope{Kind: systemstream.ScopeOrg, ID: strconv.FormatUint(uint64(*job.OrgID), 10)}
	}
	updatedAt := job.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = time.Now().UTC()
	}
	h.systemMessages.Publish(systemstream.Message{
		Topic:  systemstream.TopicGenerationJob,
		Type:   systemstream.TypeJobStatusChanged,
		Scope:  scope,
		Entity: systemstream.EntityRef("job", job.ID),
		Payload: jobStatusSystemPayload{
			JobID:          job.ID,
			Status:         job.Status,
			ProjectID:      job.ProjectID,
			JobType:        job.JobType,
			ProviderTaskID: job.ProviderTaskID,
			Message:        firstNonEmptyHandler(message, job.ErrorMsg),
			UpdatedAt:      updatedAt.UTC().Format(time.RFC3339Nano),
			Source:         "backend-job-handler",
		},
	})
}

func firstNonEmptyHandler(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
