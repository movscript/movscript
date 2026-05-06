package auth

import (
	"regexp"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
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

func NewRegisteredUser(username string, passwordHash string, email string, bootstrapSystemAdmin bool, verifiedAt *int64) model.User {
	user := model.User{
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

func NewAuthChallenge(channel string, target string, codeHash string, now time.Time) model.AuthChallenge {
	channel = strings.TrimSpace(channel)
	if channel == "" {
		channel = ChallengeChannelEmail
	}
	return model.AuthChallenge{
		Channel:   channel,
		Target:    NormalizeEmail(target),
		CodeHash:  codeHash,
		ExpiresAt: now.UTC().Add(time.Duration(ChallengeExpiresInSec) * time.Second),
	}
}

func ChallengeValidForVerification(challenge model.AuthChallenge, now time.Time) bool {
	return challenge.ConsumedAt == nil && challenge.ExpiresAt.After(now.UTC()) && challenge.Attempts < ChallengeMaxAttempts
}

func NewAuthSession(userID uint, tokenHash string, expiresAt time.Time, userAgent string, ipAddress string) model.AuthSession {
	return model.AuthSession{
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
