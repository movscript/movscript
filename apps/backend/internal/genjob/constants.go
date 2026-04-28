package genjob

// Job status constants — match the gen_jobs.status DB column values.
const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"
)

const (
	DefaultMaxAttempts = 3
)
