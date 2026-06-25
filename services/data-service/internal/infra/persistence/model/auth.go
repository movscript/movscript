package model

import (
	"gorm.io/gorm"
)

type UserGitCredential struct {
	gorm.Model
	UserID            uint   `gorm:"not null;uniqueIndex:uidx_user_git_provider" json:"user_id"`
	Provider          string `gorm:"not null;default:'gitea';size:32;uniqueIndex:uidx_user_git_provider" json:"provider"`
	Username          string `gorm:"not null;size:128;index" json:"username"`
	Email             string `gorm:"size:255" json:"email,omitempty"`
	TokenName         string `gorm:"size:128" json:"token_name,omitempty"`
	EncryptedPassword string `gorm:"type:text" json:"-"`
	EncryptedToken    string `gorm:"type:text" json:"-"`
	MaskedToken       string `gorm:"size:32" json:"masked_token,omitempty"`
	Status            string `gorm:"not null;default:'active';size:32;index" json:"status"`
	LastError         string `gorm:"type:text" json:"last_error,omitempty"`
}
