package job

import (
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

type ExecutionState = domainjob.ExecutionState

const (
	StateClaimed                = domainjob.StateClaimed
	StateResolvingInputs        = domainjob.StateResolvingInputs
	StateLoadingInputs          = domainjob.StateLoadingInputs
	StatePreparingRequest       = domainjob.StatePreparingRequest
	StateSubmittingProviderTask = domainjob.StateSubmittingProviderTask
	StateCallingProvider        = domainjob.StateCallingProvider
	StatePollingProviderTask    = domainjob.StatePollingProviderTask
	StateWaitingProviderTask    = domainjob.StateWaitingProviderTask
	StateValidatingProviderData = domainjob.StateValidatingProviderData
	StateSavingResult           = domainjob.StateSavingResult
	StatePersistingSuccess      = domainjob.StatePersistingSuccess
	StateRetryScheduled         = domainjob.StateRetryScheduled
	StateSucceeded              = domainjob.StateSucceeded
	StateFailed                 = domainjob.StateFailed
	StateCancelled              = domainjob.StateCancelled
)

type StateTraceEntry = domainjob.StateTraceEntry
