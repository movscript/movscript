package model

import "gorm.io/gorm"

// AICredential stores authentication credentials for one provider family.
type AICredential struct {
	gorm.Model
	AdapterType  string `gorm:"not null;index" json:"adapter_type"`
	DisplayName  string `gorm:"not null" json:"display_name"`
	BaseURL      string `json:"base_url"`
	EncryptedKey string `json:"-"`
	MaskedKey    string `gorm:"-" json:"masked_key"`
	IsEnabled    bool   `gorm:"default:true" json:"is_enabled"`
	OrgID        *uint  `gorm:"index" json:"org_id,omitempty"`

	FilesAPIEnabled      bool   `gorm:"default:false" json:"files_api_enabled"`
	FilesAPIBaseURL      string `json:"files_api_base_url"`
	FilesAPIEncryptedKey string `json:"-"`
	FilesAPIMaskedKey    string `gorm:"-" json:"files_api_masked_key"`
}
