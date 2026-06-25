package auth

import "time"

const (
	SystemRoleSuperAdmin = "super_admin"
	SystemRoleUser       = "user"

	UserStatusActive    = "active"
	UserStatusDisabled  = "disabled"
	UserStatusSuspended = "suspended"

	OrgPlanPersonal = "personal"
	OrgPlanTeam     = "team"

	OrgStatusActive    = "active"
	OrgStatusSuspended = "suspended"

	OrgRoleOwner  = "owner"
	OrgRoleAdmin  = "admin"
	OrgRoleMember = "member"
	OrgRoleViewer = "viewer"
)

type UserProfile struct {
	ID              uint      `json:"id"`
	Username        string    `json:"username"`
	SystemRole      string    `json:"system_role"`
	PrimaryEmail    *string   `json:"primary_email,omitempty"`
	PrimaryPhone    *string   `json:"primary_phone,omitempty"`
	DisplayName     string    `json:"display_name,omitempty"`
	AvatarURL       string    `json:"avatar_url,omitempty"`
	Locale          string    `json:"locale,omitempty"`
	Status          string    `json:"status"`
	EmailVerifiedAt *int64    `json:"email_verified_at,omitempty"`
	CreatedAt       time.Time `json:"created_at,omitempty"`
	UpdatedAt       time.Time `json:"updated_at,omitempty"`
}

type OrgMembership struct {
	OrgID      uint   `json:"org_id"`
	OrgName    string `json:"org_name"`
	OrgSlug    string `json:"org_slug"`
	IsPersonal bool   `json:"is_personal"`
	Plan       string `json:"plan"`
	Status     string `json:"status"`
	Role       string `json:"role"`
}

type Organization struct {
	ID         uint      `json:"id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	IsPersonal bool      `json:"is_personal"`
	Plan       string    `json:"plan"`
	Status     string    `json:"status"`
	CreatedBy  uint      `json:"created_by"`
	CreatedAt  time.Time `json:"created_at,omitempty"`
	UpdatedAt  time.Time `json:"updated_at,omitempty"`
}

type OrganizationMember struct {
	ID        uint         `json:"id"`
	OrgID     uint         `json:"org_id"`
	UserID    uint         `json:"user_id"`
	Role      string       `json:"role"`
	User      *UserProfile `json:"user,omitempty"`
	CreatedAt time.Time    `json:"created_at,omitempty"`
	UpdatedAt time.Time    `json:"updated_at,omitempty"`
}
