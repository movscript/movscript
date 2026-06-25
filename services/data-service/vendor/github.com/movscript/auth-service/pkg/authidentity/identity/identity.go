package identity

import (
	"time"
)

const (
	SystemRoleSuperAdmin = "super_admin"
	SystemRoleUser       = "user"

	UserStatusActive = "active"
)

type UserProfile struct {
	ID              uint      `json:"ID"`
	Username        string    `json:"username"`
	SystemRole      string    `json:"system_role"`
	PrimaryEmail    *string   `json:"primary_email,omitempty"`
	PrimaryPhone    *string   `json:"primary_phone,omitempty"`
	DisplayName     string    `json:"display_name,omitempty"`
	AvatarURL       string    `json:"avatar_url,omitempty"`
	Locale          string    `json:"locale,omitempty"`
	Status          string    `json:"status"`
	EmailVerifiedAt *int64    `json:"email_verified_at,omitempty"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}
