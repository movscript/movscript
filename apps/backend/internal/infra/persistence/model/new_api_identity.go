package model

import "gorm.io/gorm"

// NewAPIIdentity links a MovScript user to the external new-api user/token
// used for request relay attribution.
type NewAPIIdentity struct {
	gorm.Model
	UserID             uint   `gorm:"not null;uniqueIndex" json:"user_id"`
	NewAPIUserID       int    `gorm:"not null;index" json:"new_api_user_id"`
	NewAPIUsername     string `gorm:"not null;size:120;uniqueIndex" json:"new_api_username"`
	NewAPITokenID      int    `gorm:"not null;default:0" json:"new_api_token_id"`
	EncryptedRelayKey  string `gorm:"type:text" json:"-"`
	MaskedRelayKey     string `gorm:"-" json:"masked_relay_key,omitempty"`
	ProvisioningStatus string `gorm:"not null;default:'active';size:32;index" json:"provisioning_status"`
}
