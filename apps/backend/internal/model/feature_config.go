package model

import "gorm.io/gorm"

// FeatureConfig stores per-feature AI model assignment and admin overrides.
// AllowedModelIDs is a JSON array of AIModelConfig IDs; empty means "all enabled models".
// SystemPromptOverride and MaxTokensOverride let admins customise per-feature defaults
// without redeploying; empty/0 means "use the hardcoded FeatureDef default".
// DefaultModelID pins the model pre-selected in the UI; nil means "first available".
// AllowedRoles is a JSON array of project roles that can access this feature; empty means "all roles".
// OrgID scopes this config to an org; nil means global default (instance-level).
type FeatureConfig struct {
	gorm.Model
	FeatureKey           string `gorm:"uniqueIndex;not null;size:64" json:"feature_key"`
	DisplayName          string `gorm:"not null;size:128" json:"display_name"`
	Description          string `gorm:"size:255" json:"description"`
	Capability           string `gorm:"not null;size:32" json:"capability"` // text | reasoning | image | video
	IsEnabled            bool   `gorm:"default:true" json:"is_enabled"`
	OrgID                *uint  `gorm:"index" json:"org_id,omitempty"` // nil = global default
	AllowedModelIDs      string `gorm:"type:text;default:'[]'" json:"-"`  // JSON [1,3,7]
	DefaultModelID       *uint  `gorm:"default:null" json:"-"`            // nil = first available
	AllowedRoles         string `gorm:"type:text;default:'[]'" json:"-"`  // JSON ["owner","editor"]
	SystemPromptOverride string `gorm:"type:text" json:"-"`               // empty = use FeatureDef default
	MaxTokensOverride    int    `gorm:"default:0" json:"-"`               // 0 = use FeatureDef default
}
