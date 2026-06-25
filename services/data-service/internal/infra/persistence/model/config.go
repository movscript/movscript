package model

import "gorm.io/gorm"

// CloudFileConfig stores credentials and settings for a cloud file storage backend.
// ConfigJSON holds encrypted JSON credentials for the backend.
type CloudFileConfig struct {
	gorm.Model
	Name         string `gorm:"not null" json:"name"`
	ConfigType   string `gorm:"not null" json:"config_type"`
	ConfigJSON   string `gorm:"not null" json:"-"`
	Priority     int    `gorm:"default:0" json:"priority"`
	IsEnabled    bool   `gorm:"default:true" json:"is_enabled"`
	MaskedConfig string `gorm:"-" json:"masked_config,omitempty"`
}
