package model

import (
	"time"

	"gorm.io/gorm"
)

// GenJob represents an asynchronous AI generation task (image or video).
// It decouples submission from execution — created instantly, processed by a background worker pool.
type GenJob struct {
	gorm.Model
	UserID           uint       `gorm:"not null" json:"user_id"`
	ModelConfigID    uint       `gorm:"not null" json:"model_config_id"` // AIModelConfig.ID
	JobType          string     `gorm:"not null" json:"job_type"`        // image | image_edit | video | video_i2v | video_v2v
	Status           string     `gorm:"not null;default:'pending'" json:"status"` // pending|running|succeeded|failed
	Prompt           string     `json:"prompt"`
	ExtraParams      string     `json:"extra_params,omitempty"` // JSON: size, quality, style, etc.
	AspectRatio      string     `gorm:"default:''" json:"aspect_ratio,omitempty"` // e.g. "16:9", "9:16"
	Duration         int        `gorm:"default:0" json:"duration,omitempty"`      // seconds; 0 = model default
	InputResourceID  *uint      `json:"input_resource_id,omitempty"`   // legacy single reference (kept for backward compat)
	InputResourceIDs string     `json:"input_resource_ids,omitempty"`  // JSON array of resource IDs e.g. "[1,2]"
	OutputResourceID *uint      `json:"output_resource_id,omitempty"`  // set when succeeded
	ProviderTaskID   string     `json:"provider_task_id,omitempty"`    // external task ID if async
	ErrorMsg         string     `json:"error_msg,omitempty"`
	DebugInfo        string     `json:"debug_info,omitempty"`          // JSON-encoded DebugCallResult (populated in debug mode)
	StartedAt        *time.Time `json:"started_at,omitempty"`
	FinishedAt       *time.Time `json:"finished_at,omitempty"`
	ProjectID        *uint      `json:"project_id,omitempty"` // optional project context

	// Eager-loaded output resource for API responses
	OutputResource *RawResource `gorm:"foreignKey:OutputResourceID" json:"output_resource,omitempty"`
}
