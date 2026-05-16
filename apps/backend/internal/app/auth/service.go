package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrConflict           = errors.New("auth conflict")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidChallenge   = errors.New("invalid auth challenge")
	ErrInvalidInput       = errors.New("invalid auth input")
	ErrNotFound           = errors.New("auth item not found")
)

type Service struct {
	repo         repository
	tokens       *tokenauth.Manager
	localAppMode bool
}

func NewService(db *gorm.DB, tokens ...*tokenauth.Manager) *Service {
	var manager *tokenauth.Manager
	if len(tokens) > 0 {
		manager = tokens[0]
	}
	return &Service{repo: newRepository(db), tokens: manager}
}

func NewLocalService(db *gorm.DB, tokens ...*tokenauth.Manager) *Service {
	service := NewService(db, tokens...)
	service.localAppMode = true
	return service
}

type RegisterInput struct {
	Username             string
	Password             string
	Email                string
	BootstrapSystemAdmin bool
}

type LocalBootstrapInput struct {
	DisplayName string
	Password    string
}

type ProfileInput struct {
	DisplayName *string
	AvatarURL   *string
	Locale      *string
}

type ChallengeStartInput struct {
	Channel string
	Target  string
}

type ChallengeStartResult struct {
	ChallengeID string `json:"challengeId"`
	ExpiresIn   int    `json:"expiresIn"`
	DevCode     string `json:"devCode,omitempty"`
}

type ChallengeVerifyInput struct {
	ChallengeID uint
	Code        string
}

type LoginInput struct {
	Username string
	Password string
}

type OrgMembershipSummary struct {
	OrgID      uint   `json:"org_id"`
	OrgName    string `json:"org_name"`
	OrgSlug    string `json:"org_slug"`
	IsPersonal bool   `json:"is_personal"`
	Plan       string `json:"plan"`
	Status     string `json:"status"`
	Role       string `json:"role"`
}

type CredentialInput struct {
	UserID    uint
	UserAgent string
	IPAddress string
}

type Credential struct {
	Token            string
	TokenType        string
	ExpiresAt        time.Time
	SessionToken     string
	SessionExpiresAt time.Time
	OrgMemberships   []OrgMembershipSummary
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (domainauth.UserProfile, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Email = normalizeEmail(input.Email)
	if input.Username == "" {
		return domainauth.UserProfile{}, ErrInvalidInput
	}
	if strings.TrimSpace(input.Password) == "" && input.Email == "" {
		return domainauth.UserProfile{}, ErrInvalidInput
	}

	usernameExists, err := s.repo.UsernameExists(ctx, input.Username)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	if usernameExists {
		return domainauth.UserProfile{}, ErrConflict
	}
	if input.Email != "" {
		emailExists, err := s.repo.EmailExists(ctx, input.Email)
		if err != nil {
			return domainauth.UserProfile{}, err
		}
		if emailExists {
			return domainauth.UserProfile{}, ErrConflict
		}
	}

	var hash string
	if strings.TrimSpace(input.Password) != "" {
		value, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
		if err != nil {
			return domainauth.UserProfile{}, err
		}
		hash = string(value)
	}

	var verifiedAt *int64
	if input.Email != "" {
		now := time.Now().UTC().Unix()
		verifiedAt = &now
	}
	bootstrapSystemAdmin, err := s.canBootstrapSystemAdmin(ctx, input.BootstrapSystemAdmin)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	u := domainauth.NewRegisteredUser(input.Username, hash, input.Email, bootstrapSystemAdmin, verifiedAt)
	return s.repo.CreateUser(ctx, &u)
}

func (s *Service) canBootstrapSystemAdmin(ctx context.Context, requested bool) (bool, error) {
	if !requested {
		return false, nil
	}
	if !s.localAppMode {
		return false, ErrInvalidInput
	}
	count, err := s.repo.SuperAdminCount(ctx)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Service) LocalBootstrap(ctx context.Context, input LocalBootstrapInput) (domainauth.UserProfile, error) {
	if !s.localAppMode {
		return domainauth.UserProfile{}, ErrInvalidInput
	}
	password := strings.TrimSpace(input.Password)
	if len(password) < 8 {
		return domainauth.UserProfile{}, ErrInvalidInput
	}
	if _, err := s.repo.FindSuperAdmin(ctx); err == nil {
		return domainauth.UserProfile{}, ErrConflict
	} else if !errors.Is(err, ErrNotFound) {
		return domainauth.UserProfile{}, err
	}

	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = "Local User"
	}
	username, err := s.repo.FindAvailableUsername(ctx, localUsername(displayName))
	if err != nil {
		return domainauth.UserProfile{}, err
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	u := domainauth.NewRegisteredUser(username, string(hashBytes), "", true, nil)
	u.DisplayName = displayName
	return s.repo.CreateUser(ctx, &u)
}

func localUsername(displayName string) string {
	base := strings.ToLower(strings.TrimSpace(displayName))
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "local"
	}
	return b.String()
}

func (s *Service) Login(ctx context.Context, input LoginInput) (domainauth.UserProfile, error) {
	input.Username = strings.TrimSpace(input.Username)
	email := normalizeEmail(input.Username)
	u, err := s.repo.FindUserForLogin(ctx, input.Username, email)
	if err != nil {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	if strings.TrimSpace(u.PasswordHash) == "" {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(input.Password)); err != nil {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	return domainauth.UserProfileFromRegisteredUser(u), nil
}

func (s *Service) CurrentUser(ctx context.Context, userID uint) (domainauth.UserProfile, error) {
	return s.repo.FindUserByID(ctx, userID)
}

func (s *Service) UpdateProfile(ctx context.Context, userID uint, input ProfileInput) (domainauth.UserProfile, error) {
	updates := domainauth.ProfileUpdateSpec(domainauth.ProfileInput(input))
	if !updates.Empty() {
		if err := s.repo.UpdateUser(ctx, userID, updates); err != nil {
			return domainauth.UserProfile{}, err
		}
	}
	return s.CurrentUser(ctx, userID)
}

func (s *Service) StartChallenge(ctx context.Context, input ChallengeStartInput) (ChallengeStartResult, error) {
	channel := strings.TrimSpace(input.Channel)
	if channel == "" {
		channel = domainauth.ChallengeChannelEmail
	}
	if channel != domainauth.ChallengeChannelEmail {
		return ChallengeStartResult{}, ErrInvalidInput
	}
	target := normalizeEmail(input.Target)
	if target == "" {
		return ChallengeStartResult{}, ErrInvalidInput
	}

	code, err := randomDigits(6)
	if err != nil {
		return ChallengeStartResult{}, err
	}
	challenge := domainauth.NewAuthChallenge(channel, target, sha256Hex(code), time.Now().UTC())
	if err := s.repo.CreateChallenge(ctx, &challenge); err != nil {
		return ChallengeStartResult{}, err
	}
	result := ChallengeStartResult{
		ChallengeID: fmt.Sprint(challenge.ID),
		ExpiresIn:   domainauth.ChallengeExpiresInSec,
	}
	if s.localAppMode {
		result.DevCode = code
	}
	return result, nil
}

func (s *Service) VerifyChallenge(ctx context.Context, input ChallengeVerifyInput) (domainauth.AuthChallenge, error) {
	challenge, err := s.repo.FindChallenge(ctx, input.ChallengeID)
	if err != nil {
		return domainauth.AuthChallenge{}, ErrInvalidChallenge
	}
	if !domainauth.ChallengeValidForVerification(challenge, time.Now().UTC()) {
		return domainauth.AuthChallenge{}, ErrInvalidChallenge
	}
	if challenge.CodeHash != sha256Hex(strings.TrimSpace(input.Code)) {
		_ = s.repo.IncrementChallengeAttempts(ctx, &challenge)
		return domainauth.AuthChallenge{}, ErrInvalidChallenge
	}
	now := time.Now().UTC()
	if err := s.repo.ConsumeChallenge(ctx, &challenge, now); err != nil {
		return domainauth.AuthChallenge{}, err
	}
	challenge.ConsumedAt = &now
	return challenge, nil
}

func (s *Service) LoginWithEmail(ctx context.Context, email string) (domainauth.UserProfile, error) {
	email = normalizeEmail(email)
	if email == "" {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	u, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	return u, nil
}

func (s *Service) CreateSession(ctx context.Context, userID uint, ttl time.Duration, userAgent, ipAddress string) (string, time.Time, error) {
	if ttl <= 0 {
		return "", time.Time{}, ErrInvalidInput
	}
	raw, err := randomToken(32)
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().UTC().Add(ttl)
	session := domainauth.NewAuthSession(userID, sha256Hex(raw), expiresAt, userAgent, ipAddress)
	if err := s.repo.CreateSession(ctx, &session); err != nil {
		return "", time.Time{}, err
	}
	return raw, expiresAt, nil
}

func (s *Service) UserForSession(ctx context.Context, raw string) (domainauth.UserProfile, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	session, err := s.repo.FindActiveSession(ctx, sha256Hex(raw), time.Now().UTC())
	if err != nil {
		return domainauth.UserProfile{}, ErrInvalidCredentials
	}
	now := time.Now().UTC()
	_ = s.repo.TouchSession(ctx, &session, now)
	return s.CurrentUser(ctx, session.UserID)
}

func (s *Service) RevokeSession(ctx context.Context, raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	now := time.Now().UTC()
	return s.repo.RevokeSession(ctx, sha256Hex(raw), now)
}

func (s *Service) IssueCredential(ctx context.Context, input CredentialInput) (Credential, error) {
	if s.tokens == nil {
		return Credential{}, errors.New("auth token manager is required")
	}
	user, err := s.repo.FindUserByID(ctx, input.UserID)
	if err != nil {
		return Credential{}, err
	}
	token, expiresAt, err := s.tokens.Issue(tokenauth.Subject{
		UserID:     user.ID,
		Username:   user.Username,
		SystemRole: user.SystemRole,
	})
	if err != nil {
		return Credential{}, err
	}
	memberships, err := s.OrgMemberships(ctx, input.UserID)
	if err != nil {
		return Credential{}, err
	}
	credential := Credential{
		Token:          token,
		TokenType:      "Bearer",
		ExpiresAt:      expiresAt,
		OrgMemberships: memberships,
	}
	if raw, cookieExpiresAt, err := s.CreateSession(ctx, input.UserID, time.Until(expiresAt), input.UserAgent, input.IPAddress); err == nil {
		credential.SessionToken = raw
		credential.SessionExpiresAt = cookieExpiresAt
	}
	return credential, nil
}

func normalizeEmail(value string) string {
	return domainauth.NormalizeEmail(value)
}

func randomDigits(length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i, b := range buf {
		out[i] = byte('0' + int(b)%10)
	}
	return string(out), nil
}

func randomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (s *Service) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembershipSummary, error) {
	return s.repo.OrgMemberships(ctx, userID)
}
