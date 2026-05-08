package model

import (
	"time"

	"gorm.io/gorm"
)

// Job represents an asynchronous AI generation task (image or video).
// It decouples submission from execution: created instantly, processed by a background worker pool.
type Job struct {
	gorm.Model
	UserID              uint       `gorm:"not null" json:"user_id"`
	OrgID               *uint      `gorm:"index" json:"org_id,omitempty"`
	ModelConfigID       uint       `gorm:"not null" json:"model_config_id"`
	JobType             string     `gorm:"not null" json:"job_type"`
	FeatureKey          string     `gorm:"index;default:''" json:"feature_key,omitempty"`
	Status              string     `gorm:"not null;default:'pending'" json:"status"`
	AttemptCount        int        `gorm:"not null;default:0" json:"attempt_count"`
	MaxAttempts         int        `gorm:"not null;default:3" json:"max_attempts"`
	NextRunAt           *time.Time `json:"next_run_at,omitempty"`
	Prompt              string     `json:"prompt"`
	ExtraParams         string     `json:"extra_params,omitempty"`
	AspectRatio         string     `gorm:"default:''" json:"aspect_ratio,omitempty"`
	Duration            int        `gorm:"default:0" json:"duration,omitempty"`
	RequestContext      string     `gorm:"type:text" json:"request_context,omitempty"`
	InputResourceID     *uint      `json:"input_resource_id,omitempty"`
	InputResourceIDs    string     `json:"input_resource_ids,omitempty"`
	OutputResourceID    *uint      `json:"output_resource_id,omitempty"`
	UsageReservationID  *uint      `gorm:"index" json:"usage_reservation_id,omitempty"`
	ProviderTaskID      string     `json:"provider_task_id,omitempty"`
	ProviderTaskKind    string     `json:"provider_task_kind,omitempty"`
	ProviderTaskStatus  string     `json:"provider_task_status,omitempty"`
	ProviderTaskHistory string     `json:"provider_task_history,omitempty"`
	ErrorMsg            string     `json:"error_msg,omitempty"`
	DebugInfo           string     `json:"debug_info,omitempty"`
	ExecutionState      string     `json:"execution_state,omitempty"`
	StateTrace          string     `json:"state_trace,omitempty"`
	LockedBy            string     `gorm:"index" json:"locked_by,omitempty"`
	LeaseUntil          *time.Time `gorm:"index" json:"lease_until,omitempty"`
	LastHeartbeatAt     *time.Time `json:"last_heartbeat_at,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	FinishedAt          *time.Time `json:"finished_at,omitempty"`
	ProjectID           *uint      `json:"project_id,omitempty"`

	OutputResource *RawResource `gorm:"foreignKey:OutputResourceID" json:"output_resource,omitempty"`
}
