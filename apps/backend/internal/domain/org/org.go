package org

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
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
	ID         uint
	Name       string
	Slug       string
	JoinCode   string
	IsPersonal bool
	Plan       string
	Status     string
	CreatedBy  uint
}

type OrganizationMember struct {
	ID     uint
	OrgID  uint
	UserID uint
	Role   string
}

type Invitation struct {
	ID        uint
	OrgID     uint
	Token     string
	Role      string
	Note      string
	CreatedBy uint
	UsedBy    *uint
	ExpiresAt time.Time
	UsedAt    *time.Time
}

type UserGroup struct {
	ID    uint
	OrgID uint
	Name  string
}

type UserGroupMember struct {
	ID      uint
	GroupID uint
	UserID  uint
}

func NewPersonalOrg(user model.User, slugExists bool) Organization {
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
