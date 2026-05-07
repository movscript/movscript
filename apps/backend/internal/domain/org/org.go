package org

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

const (
	PlanPersonal   = "personal"
	PlanTeam       = "team"
	PlanEnterprise = "enterprise"

	StatusActive    = "active"
	StatusTrialing  = "trialing"
	StatusPastDue   = "past_due"
	StatusSuspended = "suspended"

	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
)

func IsAdminOrAbove(role string) bool {
	return role == RoleOwner || role == RoleAdmin
}

func DefaultMemberRole(role string) string {
	if strings.TrimSpace(role) == "" {
		return RoleMember
	}
	return role
}

func GenerateInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func GenerateJoinCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, len(b))
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return string(out), nil
}

func NormalizeJoinCode(value string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(value), "-", ""))
}

func NormalizePlan(value string) string {
	switch strings.TrimSpace(value) {
	case PlanPersonal, PlanEnterprise:
		return strings.TrimSpace(value)
	case "":
		return PlanTeam
	default:
		return PlanTeam
	}
}

func NormalizeStatus(value string) string {
	switch strings.TrimSpace(value) {
	case StatusActive, StatusTrialing, StatusPastDue, StatusSuspended:
		return strings.TrimSpace(value)
	case "":
		return StatusActive
	default:
		return StatusActive
	}
}

func PersonalOrgSlug(username string, userID uint, slugExists bool) string {
	slug := username
	if slugExists {
		slug = slug + "-" + fmt.Sprintf("%d", userID)
	}
	return slug
}

type Organization struct {
	ID         uint       `json:"ID"`
	Name       string     `json:"name"`
	Slug       string     `json:"slug"`
	JoinCode   string     `json:"join_code"`
	IsPersonal bool       `json:"is_personal"`
	Plan       string     `json:"plan"`
	Status     string     `json:"status"`
	CreatedBy  uint       `json:"created_by"`
	CreatedAt  time.Time  `json:"CreatedAt"`
	UpdatedAt  time.Time  `json:"UpdatedAt"`
	DeletedAt  *time.Time `json:"DeletedAt"`
}

type UserIdentity struct {
	ID       uint
	Username string
}

type OrganizationMember struct {
	ID        uint       `json:"ID"`
	OrgID     uint       `json:"org_id"`
	UserID    uint       `json:"user_id"`
	Role      string     `json:"role"`
	User      *User      `json:"user,omitempty"`
	CreatedAt time.Time  `json:"CreatedAt"`
	UpdatedAt time.Time  `json:"UpdatedAt"`
	DeletedAt *time.Time `json:"DeletedAt"`
}

type Invitation struct {
	ID        uint       `json:"ID"`
	OrgID     uint       `json:"org_id"`
	Token     string     `json:"token"`
	Role      string     `json:"role"`
	Note      string     `json:"note,omitempty"`
	CreatedBy uint       `json:"created_by"`
	UsedBy    *uint      `json:"used_by,omitempty"`
	ExpiresAt time.Time  `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"CreatedAt"`
	UpdatedAt time.Time  `json:"UpdatedAt"`
	DeletedAt *time.Time `json:"DeletedAt"`
}

type UserGroup struct {
	ID        uint              `json:"ID"`
	OrgID     uint              `json:"org_id"`
	Name      string            `json:"name"`
	Members   []UserGroupMember `json:"members,omitempty"`
	CreatedAt time.Time         `json:"CreatedAt"`
	UpdatedAt time.Time         `json:"UpdatedAt"`
	DeletedAt *time.Time        `json:"DeletedAt"`
}

type UserGroupMember struct {
	ID        uint       `json:"ID"`
	GroupID   uint       `json:"group_id"`
	UserID    uint       `json:"user_id"`
	User      *User      `json:"user,omitempty"`
	CreatedAt time.Time  `json:"CreatedAt"`
	UpdatedAt time.Time  `json:"UpdatedAt"`
	DeletedAt *time.Time `json:"DeletedAt"`
}

type User struct {
	ID              uint       `json:"ID"`
	Username        string     `json:"username"`
	SystemRole      string     `json:"system_role"`
	PrimaryEmail    *string    `json:"primary_email,omitempty"`
	PrimaryPhone    *string    `json:"primary_phone,omitempty"`
	DisplayName     string     `json:"display_name,omitempty"`
	AvatarURL       string     `json:"avatar_url,omitempty"`
	Locale          string     `json:"locale,omitempty"`
	Status          string     `json:"status"`
	EmailVerifiedAt *int64     `json:"email_verified_at,omitempty"`
	CreatedAt       time.Time  `json:"CreatedAt"`
	UpdatedAt       time.Time  `json:"UpdatedAt"`
	DeletedAt       *time.Time `json:"DeletedAt"`
}

func NewPersonalOrg(user UserIdentity, slugExists bool) Organization {
	return Organization{
		Name:       user.Username,
		Slug:       PersonalOrgSlug(user.Username, user.ID, slugExists),
		JoinCode:   "",
		IsPersonal: true,
		Plan:       PlanPersonal,
		Status:     StatusActive,
		CreatedBy:  user.ID,
	}
}

func NewTeamOrg(name string, slug string, joinCode string, ownerID uint) Organization {
	return Organization{Name: name, Slug: slug, JoinCode: joinCode, IsPersonal: false, Plan: PlanTeam, Status: StatusTrialing, CreatedBy: ownerID}
}

func OwnerMember(orgID uint, userID uint) OrganizationMember {
	return OrganizationMember{OrgID: orgID, UserID: userID, Role: RoleOwner}
}

func Member(orgID uint, userID uint, role string) OrganizationMember {
	return OrganizationMember{OrgID: orgID, UserID: userID, Role: DefaultMemberRole(role)}
}

func NewInvitation(orgID uint, token string, role string, note string, createdBy uint, expiresAt time.Time) Invitation {
	return Invitation{
		OrgID:     orgID,
		Token:     token,
		Role:      DefaultMemberRole(role),
		Note:      note,
		CreatedBy: createdBy,
		ExpiresAt: expiresAt,
	}
}

func NewUserGroup(orgID uint, name string) UserGroup {
	return UserGroup{OrgID: orgID, Name: strings.TrimSpace(name)}
}

func GroupMember(groupID uint, userID uint) UserGroupMember {
	return UserGroupMember{GroupID: groupID, UserID: userID}
}
