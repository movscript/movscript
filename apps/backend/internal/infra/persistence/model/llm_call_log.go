package model

import (
	"time"

	"gorm.io/gorm"
)

type LLMCallLog struct {
	gorm.Model
	RequestID       string `gorm:"index;size:128" json:"request_id,omitempty"`
	UserID          uint   `gorm:"not null;index" json:"user_id"`
	OrgID           *uint  `gorm:"index" json:"org_id,omitempty"`
	ProjectID       *uint  `gorm:"index" json:"project_id,omitempty"`
	GatewayAPIKeyID *uint  `gorm:"index" json:"gateway_api_key_id,omitempty"`

	AIModelConfigID uint `gorm:"not null;index" json:"ai_model_config_id"`
	CredentialID    uint `gorm:"not null;index" json:"credential_id"`

	OperationType string `gorm:"not null;index;size:64" json:"operation_type"`
	PromptName    string `gorm:"index;size:128" json:"prompt_name,omitempty"`
	Provider      string `gorm:"index;size:64" json:"provider,omitempty"`
	RequestModel  string `gorm:"size:255" json:"request_model,omitempty"`
	ResponseModel string `gorm:"size:255" json:"response_model,omitempty"`
	Status        string `gorm:"not null;index;size:32" json:"status"`
	Error         string `gorm:"type:text" json:"error,omitempty"`

	LatencyMs    int64 `gorm:"default:0" json:"latency_ms"`
	InputTokens  int   `gorm:"default:0" json:"input_tokens"`
	OutputTokens int   `gorm:"default:0" json:"output_tokens"`

	RequestJSON      string        `gorm:"type:text" json:"request_json,omitempty"`
	ResponseJSON     string        `gorm:"type:text" json:"response_json,omitempty"`
	PayloadTruncated bool          `gorm:"default:false" json:"payload_truncated"`
	ExpiresAt        *time.Time    `gorm:"index" json:"expires_at,omitempty"`
	RetentionDays    int           `gorm:"default:0" json:"retention_days"`
	User             User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AIModelConfig    AIModelConfig `gorm:"foreignKey:AIModelConfigID" json:"ai_model_config,omitempty"`
}
