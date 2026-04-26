package genjob

// Job status constants — match the gen_jobs.status DB column values.
const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
)

const (
	DefaultMaxAttempts = 3
)
