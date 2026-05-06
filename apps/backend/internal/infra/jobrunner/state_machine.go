package jobrunner

import (
	"encoding/json"
	"time"

	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type JobExecutionState = jobapp.ExecutionState

const (
	StateClaimed                = jobapp.StateClaimed
	StateResolvingInputs        = jobapp.StateResolvingInputs
	StateLoadingInputs          = jobapp.StateLoadingInputs
	StatePreparingRequest       = jobapp.StatePreparingRequest
	StateSubmittingProviderTask = jobapp.StateSubmittingProviderTask
	StateCallingProvider        = jobapp.StateCallingProvider
	StatePollingProviderTask    = jobapp.StatePollingProviderTask
	StateWaitingProviderTask    = jobapp.StateWaitingProviderTask
	StateValidatingProviderData = jobapp.StateValidatingProviderData
	StateSavingResult           = jobapp.StateSavingResult
	StatePersistingSuccess      = jobapp.StatePersistingSuccess
	StateRetryScheduled         = jobapp.StateRetryScheduled
	StateSucceeded              = jobapp.StateSucceeded
	StateFailed                 = jobapp.StateFailed
	StateCancelled              = jobapp.StateCancelled
)

type StateTraceEntry = jobapp.StateTraceEntry

type jobStateMachine struct {
	w     *Worker
	job   *model.Job
	trace []StateTraceEntry
}

func newJobStateMachine(w *Worker, job *model.Job) *jobStateMachine {
	sm := &jobStateMachine{w: w, job: job}
	if job.StateTrace != "" {
		_ = json.Unmarshal([]byte(job.StateTrace), &sm.trace)
	}
	return sm
}

func (sm *jobStateMachine) reset(state JobExecutionState, message string) {
	sm.trace = nil
	sm.enter(state, message)
}

func (sm *jobStateMachine) enter(state JobExecutionState, message string) {
	sm.trace = append(sm.trace, StateTraceEntry{
		State:     state,
		Status:    "running",
		Message:   message,
		StartedAt: time.Now(),
	})
	sm.persist(state)
}

func (sm *jobStateMachine) succeed(message string) {
	if len(sm.trace) == 0 {
		return
	}
	now := time.Now()
	idx := len(sm.trace) - 1
	sm.trace[idx].Status = "succeeded"
	sm.trace[idx].Message = firstNonEmpty(message, sm.trace[idx].Message)
	sm.trace[idx].FinishedAt = &now
	sm.trace[idx].DurationMs = now.Sub(sm.trace[idx].StartedAt).Milliseconds()
	sm.persist(sm.trace[idx].State)
}

func (sm *jobStateMachine) fail(err error) {
	if err == nil {
		return
	}
	now := time.Now()
	if len(sm.trace) > 0 {
		idx := len(sm.trace) - 1
		sm.trace[idx].Status = "failed"
		sm.trace[idx].Error = err.Error()
		sm.trace[idx].FinishedAt = &now
		sm.trace[idx].DurationMs = now.Sub(sm.trace[idx].StartedAt).Milliseconds()
	}
	sm.trace = append(sm.trace, StateTraceEntry{
		State:      StateFailed,
		Status:     "failed",
		Error:      err.Error(),
		StartedAt:  now,
		FinishedAt: &now,
	})
	sm.persist(StateFailed)
}

func (sm *jobStateMachine) cancel(message string) {
	now := time.Now()
	if len(sm.trace) > 0 {
		idx := len(sm.trace) - 1
		sm.trace[idx].Status = "failed"
		sm.trace[idx].Message = firstNonEmpty(message, sm.trace[idx].Message)
		sm.trace[idx].FinishedAt = &now
		sm.trace[idx].DurationMs = now.Sub(sm.trace[idx].StartedAt).Milliseconds()
	}
	sm.trace = append(sm.trace, StateTraceEntry{
		State:      StateCancelled,
		Status:     "succeeded",
		Message:    message,
		StartedAt:  now,
		FinishedAt: &now,
	})
	sm.persist(StateCancelled)
}

func (sm *jobStateMachine) finish(state JobExecutionState, message string) {
	now := time.Now()
	sm.trace = append(sm.trace, StateTraceEntry{
		State:      state,
		Status:     "succeeded",
		Message:    message,
		StartedAt:  now,
		FinishedAt: &now,
	})
	sm.persist(state)
}

func (sm *jobStateMachine) persist(state JobExecutionState) {
	b, err := json.Marshal(sm.trace)
	if err != nil {
		return
	}
	sm.job.ExecutionState = string(state)
	sm.job.StateTrace = string(b)
	now := time.Now()
	sm.job.LastHeartbeatAt = &now
	sm.w.db.Model(sm.job).Updates(map[string]any{
		"execution_state":   string(state),
		"state_trace":       string(b),
		"last_heartbeat_at": &now,
	})
}

func MarkRetryScheduled(db *gorm.DB, job *model.Job, message string) {
	jobapp.MarkRetryScheduled(db, job, message)
}
