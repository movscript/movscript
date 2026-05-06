package model

import (
	"time"

	"gorm.io/gorm"
)

// Job represents an asynchronous AI generation task (image or video).
// It decouples submission from execution — created instantly, processed by a background worker pool.
type Job struct {
	gorm.Model
	UserID              uint       `gorm:"not null" json:"user_id"`
	OrgID               *uint      `gorm:"index" json:"org_id,omitempty"`
	ModelConfigID       uint       `gorm:"not null" json:"model_config_id"`               // AIModelConfig.ID
	JobType             string     `gorm:"not null" json:"job_type"`                      // image | image_edit | video | video_i2v | video_v2v
	FeatureKey          string     `gorm:"index;default:''" json:"feature_key,omitempty"` // product feature/tool key, e.g. ref_image_gen
	Status              string     `gorm:"not null;default:'pending'" json:"status"`      // pending|running|succeeded|failed|cancelled
	AttemptCount        int        `gorm:"not null;default:0" json:"attempt_count"`
	MaxAttempts         int        `gorm:"not null;default:3" json:"max_attempts"`
	NextRunAt           *time.Time `json:"next_run_at,omitempty"`
	Prompt              string     `json:"prompt"`
	ExtraParams         string     `json:"extra_params,omitempty"`                     // JSON: size, quality, style, etc.
	AspectRatio         string     `gorm:"default:''" json:"aspect_ratio,omitempty"`   // e.g. "16:9", "9:16"
	Duration            int        `gorm:"default:0" json:"duration,omitempty"`        // seconds; 0 = model default
	RequestContext      string     `gorm:"type:text" json:"request_context,omitempty"` // JSON snapshot of model, inputs, and params at creation time
	InputResourceID     *uint      `json:"input_resource_id,omitempty"`                // legacy single reference (kept for backward compat)
	InputResourceIDs    string     `json:"input_resource_ids,omitempty"`               // JSON array of resource IDs e.g. "[1,2]"
	OutputResourceID    *uint      `json:"output_resource_id,omitempty"`               // set when succeeded
	UsageReservationID  *uint      `gorm:"index" json:"usage_reservation_id,omitempty"`
	ProviderTaskID      string     `json:"provider_task_id,omitempty"`      // external task ID if async
	ProviderTaskKind    string     `json:"provider_task_kind,omitempty"`    // provider-specific async task kind/endpoint
	ProviderTaskStatus  string     `json:"provider_task_status,omitempty"`  // latest external task status
	ProviderTaskHistory string     `json:"provider_task_history,omitempty"` // JSON-encoded provider status history
	ErrorMsg            string     `json:"error_msg,omitempty"`
	DebugInfo           string     `json:"debug_info,omitempty"`      // JSON-encoded DebugCallResult (populated in debug mode)
	ExecutionState      string     `json:"execution_state,omitempty"` // current worker state-machine state
	StateTrace          string     `json:"state_trace,omitempty"`     // JSON-encoded []job.StateTraceEntry
	LockedBy            string     `gorm:"index" json:"locked_by,omitempty"`
	LeaseUntil          *time.Time `gorm:"index" json:"lease_until,omitempty"`
	LastHeartbeatAt     *time.Time `json:"last_heartbeat_at,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	FinishedAt          *time.Time `json:"finished_at,omitempty"`
	ProjectID           *uint      `json:"project_id,omitempty"` // optional project context

	// Eager-loaded output resource for API responses
	OutputResource *RawResource `gorm:"foreignKey:OutputResourceID" json:"output_resource,omitempty"`
}
