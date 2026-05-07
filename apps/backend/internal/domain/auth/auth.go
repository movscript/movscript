package auth

import (
	"regexp"
	"strings"
	"time"
)

const (
	SystemRoleSuperAdmin = "super_admin"
	SystemRoleUser       = "user"

	UserStatusActive = "active"

	ChallengeChannelEmail = "email"
	ChallengeExpiresInSec = 10 * 60
	ChallengeMaxAttempts  = 5

	UserAgentMaxLength = 512
	IPAddressMaxLength = 64
)

type RegisteredUser struct {
	ID              uint
	Username        string
	PasswordHash    string
	SystemRole      string
	PrimaryEmail    *string
	PrimaryPhone    *string
	DisplayName     string
	AvatarURL       string
	Locale          string
	Status          string
	EmailVerifiedAt *int64
}

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

type AuthChallenge struct {
	ID         uint       `json:"ID"`
	Channel    string     `json:"channel"`
	Target     string     `json:"target"`
	CodeHash   string     `json:"-"`
	ExpiresAt  time.Time  `json:"expires_at"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
	Attempts   int        `json:"attempts"`
	CreatedAt  time.Time  `json:"CreatedAt"`
	UpdatedAt  time.Time  `json:"UpdatedAt"`
}

type AuthSession struct {
	ID         uint
	UserID     uint
	TokenHash  string
	ExpiresAt  time.Time
	RevokedAt  *time.Time
	LastSeenAt *time.Time
	UserAgent  string
	IPAddress  string
}

func NormalizeEmail(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}
	if !regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`).MatchString(value) {
		return ""
	}
	return value
}

func SystemRoleForNewUser(bootstrapSystemAdmin bool) string {
	if bootstrapSystemAdmin {
		return SystemRoleSuperAdmin
	}
	return SystemRoleUser
}

func NewRegisteredUser(username string, passwordHash string, email string, bootstrapSystemAdmin bool, verifiedAt *int64) RegisteredUser {
	user := RegisteredUser{
		Username:     strings.TrimSpace(username),
		PasswordHash: passwordHash,
		SystemRole:   SystemRoleForNewUser(bootstrapSystemAdmin),
		Status:       UserStatusActive,
	}
	if email != "" {
		user.PrimaryEmail = &email
		user.EmailVerifiedAt = verifiedAt
	}
	return user
}

func NewAuthChallenge(channel string, target string, codeHash string, now time.Time) AuthChallenge {
	channel = strings.TrimSpace(channel)
	if channel == "" {
		channel = ChallengeChannelEmail
	}
	return AuthChallenge{
		Channel:   channel,
		Target:    NormalizeEmail(target),
		CodeHash:  codeHash,
		ExpiresAt: now.UTC().Add(time.Duration(ChallengeExpiresInSec) * time.Second),
	}
}

func ChallengeValidForVerification(challenge AuthChallenge, now time.Time) bool {
	return challenge.ConsumedAt == nil && challenge.ExpiresAt.After(now.UTC()) && challenge.Attempts < ChallengeMaxAttempts
}

func NewAuthSession(userID uint, tokenHash string, expiresAt time.Time, userAgent string, ipAddress string) AuthSession {
	return AuthSession{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt.UTC(),
		UserAgent: Truncate(userAgent, UserAgentMaxLength),
		IPAddress: Truncate(ipAddress, IPAddressMaxLength),
	}
}

type ProfileInput struct {
	DisplayName *string
	AvatarURL   *string
	Locale      *string
}

func ProfileUpdates(input ProfileInput) map[string]any {
	updates := map[string]any{}
	if input.DisplayName != nil {
		updates["display_name"] = strings.TrimSpace(*input.DisplayName)
	}
	if input.AvatarURL != nil {
		updates["avatar_url"] = strings.TrimSpace(*input.AvatarURL)
	}
	if input.Locale != nil {
		updates["locale"] = strings.TrimSpace(*input.Locale)
	}
	return updates
}

func Truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}
