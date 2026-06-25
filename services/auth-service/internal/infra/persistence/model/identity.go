package model

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username        string  `gorm:"uniqueIndex;not null;size:120" json:"username"`
	PasswordHash    string  `json:"-"`
	SystemRole      string  `gorm:"not null;default:'user';size:32" json:"system_role"`
	PrimaryEmail    *string `gorm:"uniqueIndex;size:255" json:"primary_email,omitempty"`
	PrimaryPhone    *string `gorm:"uniqueIndex;size:32" json:"primary_phone,omitempty"`
	DisplayName     string  `gorm:"size:120" json:"display_name,omitempty"`
	AvatarURL       string  `gorm:"size:512" json:"avatar_url,omitempty"`
	Locale          string  `gorm:"size:32" json:"locale,omitempty"`
	Status          string  `gorm:"not null;default:'active';size:32;index" json:"status"`
	EmailVerifiedAt *int64  `json:"email_verified_at,omitempty"`
}

type Organization struct {
	gorm.Model
	Name       string               `gorm:"not null;size:160" json:"name"`
	Slug       string               `gorm:"uniqueIndex;not null;size:64" json:"slug"`
	IsPersonal bool                 `gorm:"not null;default:false" json:"is_personal"`
	Plan       string               `gorm:"not null;default:'team';size:32;index" json:"plan"`
	Status     string               `gorm:"not null;default:'active';size:32;index" json:"status"`
	CreatedBy  uint                 `gorm:"not null;index" json:"created_by"`
	Members    []OrganizationMember `gorm:"foreignKey:OrgID" json:"members,omitempty"`
}

type OrganizationMember struct {
	gorm.Model
	OrgID  uint         `gorm:"not null;uniqueIndex:uidx_org_member" json:"org_id"`
	UserID uint         `gorm:"not null;uniqueIndex:uidx_org_member" json:"user_id"`
	Role   string       `gorm:"not null;default:'member';size:32" json:"role"`
	User   User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Org    Organization `gorm:"foreignKey:OrgID" json:"org,omitempty"`
}
