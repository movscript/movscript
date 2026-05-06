package job

import (
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
)

const (
	StatusPending      = domainjob.StatusPending
	StatusRunning      = domainjob.StatusRunning
	StatusSucceeded    = domainjob.StatusSucceeded
	StatusFailed       = domainjob.StatusFailed
	StatusCancelled    = domainjob.StatusCancelled
	DefaultMaxAttempts = domainjob.DefaultMaxAttempts
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
