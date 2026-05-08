package model

import "gorm.io/gorm"

// FeatureConfig stores per-feature AI model assignment and admin overrides.
// AllowedModelIDs and AllowedRoles are JSON arrays.
type FeatureConfig struct {
	gorm.Model
	FeatureKey           string `gorm:"uniqueIndex;not null;size:64" json:"feature_key"`
	DisplayName          string `gorm:"not null;size:128" json:"display_name"`
	Description          string `gorm:"size:255" json:"description"`
	Capability           string `gorm:"not null;size:32" json:"capability"`
	IsEnabled            bool   `gorm:"default:true" json:"is_enabled"`
	OrgID                *uint  `gorm:"index" json:"org_id,omitempty"`
	AllowedModelIDs      string `gorm:"type:text;default:'[]'" json:"-"`
	DefaultModelID       *uint  `gorm:"default:null" json:"-"`
	AllowedRoles         string `gorm:"type:text;default:'[]'" json:"-"`
	SystemPromptOverride string `gorm:"type:text" json:"-"`
	MaxTokensOverride    int    `gorm:"default:0" json:"-"`
}
