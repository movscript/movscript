package model

import "gorm.io/gorm"

// CloudFileConfig stores credentials and settings for a cloud file storage backend.
// Supported types: "s3" | "oss" | "tos"
// ConfigJSON holds the encrypted JSON credentials for the backend.
type CloudFileConfig struct {
	gorm.Model
	Name         string `gorm:"not null" json:"name"`
	ConfigType   string `gorm:"not null" json:"config_type"` // openai_files | s3 | oss | tos
	ConfigJSON   string `gorm:"not null" json:"-"`           // encrypted JSON, never exposed
	Priority     int    `gorm:"default:0" json:"priority"`   // lower = higher priority
	IsEnabled    bool   `gorm:"default:true" json:"is_enabled"`
	MaskedConfig string `gorm:"-" json:"masked_config,omitempty"` // redacted view for UI
}
