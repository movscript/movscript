package job

import (
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

// Job status constants match the jobs.status DB column values.
const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"
)

const DefaultMaxAttempts = 3

type ExecutionState string

const (
	StateClaimed                ExecutionState = "claimed"
	StateResolvingInputs        ExecutionState = "resolving_inputs"
	StateLoadingInputs          ExecutionState = "loading_inputs"
	StatePreparingRequest       ExecutionState = "preparing_request"
	StateSubmittingProviderTask ExecutionState = "submitting_provider_task"
	StateCallingProvider        ExecutionState = "calling_provider"
	StatePollingProviderTask    ExecutionState = "polling_provider_task"
	StateWaitingProviderTask    ExecutionState = "waiting_provider_task"
	StateValidatingProviderData ExecutionState = "validating_provider_data"
	StateSavingResult           ExecutionState = "saving_result"
	StatePersistingSuccess      ExecutionState = "persisting_success"
	StateRetryScheduled         ExecutionState = "retry_scheduled"
	StateSucceeded              ExecutionState = "succeeded"
	StateFailed                 ExecutionState = "failed"
	StateCancelled              ExecutionState = "cancelled"
)

type StateTraceEntry struct {
	State      ExecutionState `json:"state"`
	Status     string         `json:"status"`
	Message    string         `json:"message,omitempty"`
	Error      string         `json:"error,omitempty"`
	StartedAt  time.Time      `json:"started_at"`
	FinishedAt *time.Time     `json:"finished_at,omitempty"`
	DurationMs int64          `json:"duration_ms,omitempty"`
}

func MarkRetryScheduled(db *gorm.DB, job *model.Job, message string) {
	if db == nil || job == nil {
		return
	}
	var trace []StateTraceEntry
	if job.StateTrace != "" {
		_ = json.Unmarshal([]byte(job.StateTrace), &trace)
	}
	now := time.Now()
	trace = append(trace, StateTraceEntry{
		State:      StateRetryScheduled,
		Status:     "succeeded",
		Message:    message,
		StartedAt:  now,
		FinishedAt: &now,
	})
	b, err := json.Marshal(trace)
	if err != nil {
		return
	}
	job.ExecutionState = string(StateRetryScheduled)
	job.StateTrace = string(b)
	job.LastHeartbeatAt = &now
	db.Model(job).Updates(map[string]any{
		"execution_state":   string(StateRetryScheduled),
		"state_trace":       string(b),
		"last_heartbeat_at": &now,
	})
}
