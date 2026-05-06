package model

import "gorm.io/gorm"

type AuditLog struct {
	gorm.Model
	RequestID  string `gorm:"index" json:"request_id"`
	ActorID    *uint  `gorm:"index" json:"actor_id,omitempty"`
	Action     string `gorm:"index;not null" json:"action"`
	TargetType string `gorm:"index" json:"target_type"`
	TargetID   string `gorm:"index" json:"target_id"`
	OrgID      *uint  `gorm:"index" json:"org_id,omitempty"`
	ProjectID  *uint  `gorm:"index" json:"project_id,omitempty"`
	IPAddress  string `json:"ip_address,omitempty"`
	UserAgent  string `json:"user_agent,omitempty"`
	Metadata   string `gorm:"type:text" json:"metadata,omitempty"`
}
