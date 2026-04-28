package model

import "gorm.io/gorm"

// UserAgent is a per-user agent configuration.
// It can be linked to a platform AgentTemplate (source_template_id != nil)
// and optionally follow platform updates (accept_platform_updates = true).
// When accept_platform_updates is false, the local soul/skills/model override the template.
type UserAgent struct {
	gorm.Model
	UserID               uint   `gorm:"not null;index" json:"user_id"`
	Name                 string `gorm:"not null" json:"name"`
	SourceTemplateID     *uint  `json:"source_template_id"` // references AgentTemplate.ID, nullable
	AcceptPlatformUpdates bool  `gorm:"default:true" json:"accept_platform_updates"`
	PlatformModelID      *uint  `json:"platform_model_id"`
	CustomModelJSON      string `gorm:"type:text" json:"-"`
	Soul                 string `gorm:"type:text" json:"soul"`
	SkillsJSON           string `gorm:"type:text" json:"-"`
}
