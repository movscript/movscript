package model

import "gorm.io/gorm"

// AgentTemplate is a platform-managed agent template that super_admin configures
// and users can adopt or override locally.
type AgentTemplate struct {
	gorm.Model
	Name            string `gorm:"not null" json:"name"`
	PlatformModelID *uint  `json:"platform_model_id"` // references AIModelConfig.ID, nullable
	CustomModelJSON string `gorm:"type:text" json:"-"`
	Soul            string `gorm:"type:text" json:"soul"` // system prompt / persona
	SkillsJSON      string `gorm:"type:text" json:"-"`   // JSON array of AgentSkill
}
