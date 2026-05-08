package model

import (
	"time"

	"gorm.io/gorm"
)

// GatewayAPIKey stores hashed API keys for OpenAI-compatible model gateway calls.
// The raw key is only returned once by the create endpoint.
type GatewayAPIKey struct {
	gorm.Model
	Name            string     `gorm:"not null" json:"name"`
	KeyPrefix       string     `gorm:"not null;index" json:"key_prefix"`
	KeyHash         string     `gorm:"not null;uniqueIndex" json:"-"`
	OwnerUserID     uint       `gorm:"not null;index" json:"owner_user_id"`
	OrgID           *uint      `gorm:"index" json:"org_id,omitempty"`
	ProjectID       *uint      `gorm:"index" json:"project_id,omitempty"`
	AllowedModelIDs string     `gorm:"type:text;default:'[]'" json:"allowed_model_ids"`
	AllowedScopes   string     `gorm:"type:text;default:'[]'" json:"allowed_scopes"`
	IsEnabled       bool       `gorm:"default:true" json:"is_enabled"`
	LastUsedAt      *time.Time `json:"last_used_at,omitempty"`
	Owner           User       `gorm:"foreignKey:OwnerUserID" json:"owner,omitempty"`

	GatewayAPIKeyRuntimeFields `gorm:"embedded"`
}
