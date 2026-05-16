package runner

import domainjob "github.com/movscript/movscript/internal/domain/job"

const (
	StatusPending   = domainjob.StatusPending
	StatusRunning   = domainjob.StatusRunning
	StatusSucceeded = domainjob.StatusSucceeded
	StatusFailed    = domainjob.StatusFailed
	StatusCancelled = domainjob.StatusCancelled
)

const DefaultMaxAttempts = domainjob.DefaultMaxAttempts
