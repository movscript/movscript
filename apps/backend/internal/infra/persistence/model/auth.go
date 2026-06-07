package model

import (
	"time"

	"gorm.io/gorm"
)

type AuthSession struct {
	gorm.Model
	UserID     uint       `gorm:"not null;index" json:"user_id"`
	TokenHash  string     `gorm:"uniqueIndex;not null;size:64" json:"-"`
	ExpiresAt  time.Time  `gorm:"not null;index" json:"expires_at"`
	RevokedAt  *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
	UserAgent  string     `gorm:"size:512" json:"user_agent,omitempty"`
	IPAddress  string     `gorm:"size:64" json:"ip_address,omitempty"`
	User       User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

type AuthChallenge struct {
	gorm.Model
	Channel    string     `gorm:"not null;size:32;index" json:"channel"`
	Target     string     `gorm:"not null;size:255;index" json:"target"`
	CodeHash   string     `gorm:"not null;size:64" json:"-"`
	ExpiresAt  time.Time  `gorm:"not null;index" json:"expires_at"`
	ConsumedAt *time.Time `gorm:"index" json:"consumed_at,omitempty"`
	Attempts   int        `gorm:"not null;default:0" json:"attempts"`
}

type UserGitCredential struct {
	gorm.Model
	UserID            uint   `gorm:"not null;uniqueIndex:uidx_user_git_provider" json:"user_id"`
	User              User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
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
