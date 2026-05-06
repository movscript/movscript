package jobrunner

import jobapp "github.com/movscript/movscript/internal/app/job"

const (
	StatusPending   = jobapp.StatusPending
	StatusRunning   = jobapp.StatusRunning
	StatusSucceeded = jobapp.StatusSucceeded
	StatusFailed    = jobapp.StatusFailed
	StatusCancelled = jobapp.StatusCancelled
)

const DefaultMaxAttempts = jobapp.DefaultMaxAttempts
