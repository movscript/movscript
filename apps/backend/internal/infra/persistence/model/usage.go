package model

import "gorm.io/gorm"

type UsageLog struct {
	gorm.Model
	UserID             uint          `gorm:"not null" json:"user_id"`
	OrgID              *uint         `gorm:"index" json:"org_id,omitempty"`
	AIModelConfigID    uint          `gorm:"not null" json:"ai_model_config_id"`
	UsageReservationID *uint         `gorm:"index" json:"usage_reservation_id,omitempty"`
	GatewayAPIKeyID    *uint         `gorm:"index" json:"gateway_api_key_id,omitempty"`
	ProjectID          *uint         `gorm:"index" json:"project_id,omitempty"`
	OperationType      string        `gorm:"not null" json:"operation_type"`
	InputTokens        int           `gorm:"default:0" json:"input_tokens"`
	OutputTokens       int           `gorm:"default:0" json:"output_tokens"`
	DurationSec        int           `gorm:"default:0" json:"duration_sec"`
	ImageCount         int           `gorm:"default:1" json:"image_count"`
	Cost               float64       `gorm:"default:0" json:"cost"`
	User               User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AIModelConfig      AIModelConfig `gorm:"foreignKey:AIModelConfigID" json:"ai_model_config,omitempty"`
}

type UsageReservation struct {
	gorm.Model
	UserID          uint          `gorm:"not null;index" json:"user_id"`
	OrgID           *uint         `gorm:"index" json:"org_id,omitempty"`
	AIModelConfigID uint          `gorm:"not null;index" json:"ai_model_config_id"`
	GatewayAPIKeyID *uint         `gorm:"index" json:"gateway_api_key_id,omitempty"`
	ProjectID       *uint         `gorm:"index" json:"project_id,omitempty"`
	JobID           *uint         `gorm:"index" json:"job_id,omitempty"`
	OperationType   string        `gorm:"not null;index" json:"operation_type"`
	EstimatedCost   float64       `gorm:"not null;default:0" json:"estimated_cost"`
	ActualCost      float64       `gorm:"not null;default:0" json:"actual_cost"`
	Status          string        `gorm:"not null;default:'reserved';index" json:"status"`
	ReleaseReason   string        `json:"release_reason,omitempty"`
	UsageLogID      *uint         `gorm:"index" json:"usage_log_id,omitempty"`
	Metadata        string        `gorm:"type:text" json:"metadata,omitempty"`
	User            User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AIModelConfig   AIModelConfig `gorm:"foreignKey:AIModelConfigID" json:"ai_model_config,omitempty"`
}
