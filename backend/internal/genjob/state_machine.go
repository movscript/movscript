package genjob

import (
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/model"
)

type JobExecutionState string

const (
	StateClaimed                JobExecutionState = "claimed"
	StateResolvingInputs        JobExecutionState = "resolving_inputs"
	StateLoadingInputs          JobExecutionState = "loading_inputs"
	StatePreparingRequest       JobExecutionState = "preparing_request"
	StateCallingProvider        JobExecutionState = "calling_provider"
	StateValidatingProviderData JobExecutionState = "validating_provider_data"
	StateSavingResult           JobExecutionState = "saving_result"
	StatePersistingSuccess      JobExecutionState = "persisting_success"
	StateSucceeded              JobExecutionState = "succeeded"
	StateFailed                 JobExecutionState = "failed"
)

type StateTraceEntry struct {
	State      JobExecutionState `json:"state"`
	Status     string            `json:"status"` // running|succeeded|failed
	Message    string            `json:"message,omitempty"`
	Error      string            `json:"error,omitempty"`
	StartedAt  time.Time         `json:"started_at"`
	FinishedAt *time.Time        `json:"finished_at,omitempty"`
	DurationMs int64             `json:"duration_ms,omitempty"`
}

type jobStateMachine struct {
	w     *Worker
	job   *model.GenJob
	trace []StateTraceEntry
}

func newJobStateMachine(w *Worker, job *model.GenJob) *jobStateMachine {
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
	sm.w.db.Model(sm.job).Updates(map[string]any{
		"execution_state": string(state),
		"state_trace":     string(b),
	})
}
