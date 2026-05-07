package model

import (
	"time"

	"gorm.io/gorm"
)

// Organization is the top-level tenant unit.
// IsPersonal=true orgs are auto-created on user registration and are invisible to the user.
type Organization struct {
	gorm.Model
	Name       string               `gorm:"not null" json:"name"`
	Slug       string               `gorm:"uniqueIndex;not null;size:64" json:"slug"`
	JoinCode   string               `gorm:"uniqueIndex:uidx_org_join_code,where:join_code <> '';size:24" json:"join_code"`
	IsPersonal bool                 `gorm:"default:false" json:"is_personal"`
	Plan       string               `gorm:"not null;default:'team';size:32;index" json:"plan"`       // personal|team
	Status     string               `gorm:"not null;default:'trialing';size:32;index" json:"status"` // active|trialing|past_due|suspended
	CreatedBy  uint                 `gorm:"not null;index" json:"created_by"`
	Members    []OrganizationMember `gorm:"foreignKey:OrgID" json:"members,omitempty"`
}

// OrganizationMember links a user to an org with a role.
// role: owner | admin | member | viewer
type OrganizationMember struct {
	gorm.Model
	OrgID  uint   `gorm:"not null;uniqueIndex:uidx_org_member" json:"org_id"`
	UserID uint   `gorm:"not null;uniqueIndex:uidx_org_member" json:"user_id"`
	Role   string `gorm:"not null;default:'member'" json:"role"`
	User   User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// UserGroup is a named group within an organization.
type UserGroup struct {
	gorm.Model
	OrgID   uint              `gorm:"not null;index" json:"org_id"`
	Name    string            `gorm:"not null" json:"name"`
	Members []UserGroupMember `gorm:"foreignKey:GroupID" json:"members,omitempty"`
}

// UserGroupMember links a user to a group.
type UserGroupMember struct {
	gorm.Model
	GroupID uint `gorm:"not null;uniqueIndex:uidx_group_member" json:"group_id"`
	UserID  uint `gorm:"not null;uniqueIndex:uidx_group_member" json:"user_id"`
	User    User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// OrgInvitation is a single-use token that lets someone join an org.
type OrgInvitation struct {
	gorm.Model
	OrgID     uint       `gorm:"not null;index" json:"org_id"`
	Token     string     `gorm:"uniqueIndex;not null;size:64" json:"token"`
	Role      string     `gorm:"not null;default:'member'" json:"role"`
	Note      string     `gorm:"size:255" json:"note,omitempty"`
	CreatedBy uint       `gorm:"not null" json:"created_by"`
	UsedBy    *uint      `gorm:"index" json:"used_by,omitempty"`
	ExpiresAt time.Time  `gorm:"not null" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
}
