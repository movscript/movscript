package org

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

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
)

func IsAdminOrAbove(role string) bool {
	return role == "owner" || role == "admin"
}

func DefaultMemberRole(role string) string {
	if strings.TrimSpace(role) == "" {
		return "member"
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

func NewPersonalOrg(user model.User, slugExists bool) model.Organization {
	return model.Organization{
		Name:       user.Username,
		Slug:       PersonalOrgSlug(user.Username, user.ID, slugExists),
		JoinCode:   "",
		IsPersonal: true,
		Plan:       PlanPersonal,
		Status:     StatusActive,
		CreatedBy:  user.ID,
	}
}

func OwnerMember(orgID uint, userID uint) model.OrganizationMember {
	return model.OrganizationMember{OrgID: orgID, UserID: userID, Role: "owner"}
}
