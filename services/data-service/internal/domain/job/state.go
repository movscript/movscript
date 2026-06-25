package job

import (
	"encoding/json"
	"time"
)

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

type DeleteAction string

const (
	DeleteActionRemove DeleteAction = "remove"
	DeleteActionCancel DeleteAction = "cancel"
	DeleteActionBlock  DeleteAction = "block"
)

func (job Job) DeleteAction() DeleteAction {
	switch job.Status {
	case StatusPending:
		return DeleteActionCancel
	case StatusRunning:
		return DeleteActionBlock
	default:
		return DeleteActionRemove
	}
}

func (job *Job) ScheduleRetry(now time.Time, message string) {
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = DefaultMaxAttempts
	}
	job.Status = StatusPending
	job.AttemptCount = 0
	job.MaxAttempts = maxAttempts
	job.ErrorMsg = ""
	job.NextRunAt = &now
	job.FinishedAt = nil
	job.LockedBy = ""
	job.LeaseUntil = nil
	job.LastHeartbeatAt = nil
	job.OutputResourceID = nil
	job.ProviderTaskID = ""
	job.ProviderTaskKind = ""
	job.ProviderTaskStatus = ""
	job.ProviderTaskHistory = ""
	job.appendFinishedTrace(StateRetryScheduled, StatusSucceeded, message, now)
}

func (job *Job) MarkCancelled(now time.Time, providerStatus string, message string) {
	job.Status = StatusCancelled
	job.ProviderTaskStatus = providerStatus
	job.ErrorMsg = message
	job.NextRunAt = nil
	job.FinishedAt = &now
	job.LockedBy = ""
	job.LeaseUntil = nil
	job.LastHeartbeatAt = &now
}

func (job *Job) MarkCancelledForDelete(now time.Time, message string) {
	job.Status = StatusCancelled
	job.ErrorMsg = message
	job.FinishedAt = &now
	job.NextRunAt = nil
	job.LockedBy = ""
	job.LeaseUntil = nil
	job.LastHeartbeatAt = &now
}

func (job *Job) appendFinishedTrace(state ExecutionState, status string, message string, now time.Time) {
	var trace []StateTraceEntry
	if job.StateTrace != "" {
		_ = json.Unmarshal([]byte(job.StateTrace), &trace)
	}
	trace = append(trace, StateTraceEntry{
		State:      state,
		Status:     status,
		Message:    message,
		StartedAt:  now,
		FinishedAt: &now,
	})
	b, err := json.Marshal(trace)
	if err != nil {
		return
	}
	job.ExecutionState = string(state)
	job.StateTrace = string(b)
	job.LastHeartbeatAt = &now
}
