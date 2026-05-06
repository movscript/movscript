package model

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username        string  `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash    string  `json:"-"`
	SystemRole      string  `gorm:"default:'user'" json:"system_role"` // super_admin | user
	PrimaryEmail    *string `gorm:"uniqueIndex;size:255" json:"primary_email,omitempty"`
	PrimaryPhone    *string `gorm:"uniqueIndex;size:32" json:"primary_phone,omitempty"`
	DisplayName     string  `gorm:"size:120" json:"display_name,omitempty"`
	AvatarURL       string  `gorm:"size:512" json:"avatar_url,omitempty"`
	Locale          string  `gorm:"size:32" json:"locale,omitempty"`
	Status          string  `gorm:"default:'active';size:32" json:"status"` // active | disabled
	EmailVerifiedAt *int64  `json:"email_verified_at,omitempty"`
}
