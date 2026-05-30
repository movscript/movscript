package model

import "gorm.io/gorm"

// ExternalResourceSource stores encrypted credentials for external media search providers.
type ExternalResourceSource struct {
	gorm.Model
	OwnerID     uint   `gorm:"not null;index" json:"owner_id"`
	OrgID       *uint  `gorm:"index" json:"org_id,omitempty"`
	Name        string `gorm:"not null" json:"name"`
	ProviderKey string `gorm:"not null;index" json:"provider_key"`
	ConfigJSON  string `gorm:"not null" json:"-"`
	Priority    int    `gorm:"default:0" json:"priority"`
	IsEnabled   bool   `gorm:"default:true" json:"is_enabled"`
}
