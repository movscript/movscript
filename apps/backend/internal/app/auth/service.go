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

	orgapp "github.com/movscript/movscript/internal/app/org"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/domain/model"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrConflict           = errors.New("auth conflict")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidChallenge   = errors.New("invalid auth challenge")
	ErrInvalidInput       = errors.New("invalid auth input")
)

type Service struct {
	db           *gorm.DB
	tokens       *tokenauth.Manager
	localAppMode bool
}

func NewService(db *gorm.DB, tokens ...*tokenauth.Manager) *Service {
	var manager *tokenauth.Manager
	if len(tokens) > 0 {
		manager = tokens[0]
	}
	return &Service{db: db, tokens: manager}
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
	User      model.User
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

func (s *Service) Register(ctx context.Context, input RegisterInput) (model.User, error) {
	input.Username = strings.TrimSpace(input.Username)
	input.Email = normalizeEmail(input.Email)
	if input.Username == "" {
		return model.User{}, ErrInvalidInput
	}
	if strings.TrimSpace(input.Password) == "" && input.Email == "" {
		return model.User{}, ErrInvalidInput
	}

	var existing model.User
	if s.db.WithContext(ctx).Where("username = ?", input.Username).First(&existing).Error == nil {
		return model.User{}, ErrConflict
	}
	if input.Email != "" && s.db.WithContext(ctx).Where("primary_email = ?", input.Email).First(&existing).Error == nil {
		return model.User{}, ErrConflict
	}

	var hash string
	if strings.TrimSpace(input.Password) != "" {
		value, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
		if err != nil {
			return model.User{}, err
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
		return model.User{}, err
	}
	u := domainauth.NewRegisteredUser(input.Username, hash, input.Email, bootstrapSystemAdmin, verifiedAt)
	if err := s.db.WithContext(ctx).Create(&u).Error; err != nil {
		return model.User{}, err
	}
	_ = orgapp.CreatePersonalOrg(s.db.WithContext(ctx), &u)
	return u, nil
}

func (s *Service) canBootstrapSystemAdmin(ctx context.Context, requested bool) (bool, error) {
	if !requested {
		return false, nil
	}
	if !s.localAppMode {
		return false, ErrInvalidInput
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where("system_role = ?", "super_admin").Count(&count).Error; err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Service) LocalBootstrap(ctx context.Context, input LocalBootstrapInput) (model.User, error) {
	if !s.localAppMode {
		return model.User{}, ErrInvalidInput
	}
	password := strings.TrimSpace(input.Password)
	if len(password) < 8 {
		return model.User{}, ErrInvalidInput
	}
	var existing model.User
	if err := s.db.WithContext(ctx).Where("system_role = ?", "super_admin").First(&existing).Error; err == nil {
		hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
		if err != nil {
			return model.User{}, err
		}
		updates := map[string]any{"password_hash": string(hashBytes)}
		displayName := strings.TrimSpace(input.DisplayName)
		if displayName != "" && strings.TrimSpace(existing.DisplayName) == "" {
			updates["display_name"] = displayName
		}
		if err := s.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return model.User{}, err
		}
		if err := s.db.WithContext(ctx).First(&existing, existing.ID).Error; err != nil {
			return model.User{}, err
		}
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, err
	}

	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = "Local User"
	}
	username := localUsername(displayName)
	for i := 0; ; i++ {
		candidate := username
		if i > 0 {
			candidate = fmt.Sprintf("%s%d", username, i+1)
		}
		var count int64
		if err := s.db.WithContext(ctx).Model(&model.User{}).Where("username = ?", candidate).Count(&count).Error; err != nil {
			return model.User{}, err
		}
		if count == 0 {
			username = candidate
			break
		}
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return model.User{}, err
	}
	u := domainauth.NewRegisteredUser(username, string(hashBytes), "", true, nil)
	u.DisplayName = displayName
	if err := s.db.WithContext(ctx).Create(&u).Error; err != nil {
		return model.User{}, err
	}
	_ = orgapp.CreatePersonalOrg(s.db.WithContext(ctx), &u)
	return u, nil
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

func (s *Service) Login(ctx context.Context, input LoginInput) (model.User, error) {
	input.Username = strings.TrimSpace(input.Username)
	var u model.User
	query := s.db.WithContext(ctx)
	email := normalizeEmail(input.Username)
	if email != "" {
		query = query.Where("username = ? OR primary_email = ?", input.Username, email)
	} else {
		query = query.Where("username = ?", input.Username)
	}
	if err := query.First(&u).Error; err != nil {
		return model.User{}, ErrInvalidCredentials
	}
	if strings.TrimSpace(u.PasswordHash) == "" {
		return model.User{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(input.Password)); err != nil {
		return model.User{}, ErrInvalidCredentials
	}
	return u, nil
}

func (s *Service) CurrentUser(ctx context.Context, userID uint) (model.User, error) {
	var u model.User
	if err := s.db.WithContext(ctx).First(&u, userID).Error; err != nil {
		return model.User{}, err
	}
	return u, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID uint, input ProfileInput) (model.User, error) {
	updates := domainauth.ProfileUpdates(domainauth.ProfileInput(input))
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			return model.User{}, err
		}
	}
	return s.CurrentUser(ctx, userID)
}

func (s *Service) StartChallenge(ctx context.Context, input ChallengeStartInput) (ChallengeStartResult, error) {
	channel := strings.TrimSpace(input.Channel)
	if channel == "" {
		channel = "email"
	}
	if channel != "email" {
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
	expiresIn := 10 * 60
	challenge := model.AuthChallenge{
		Channel:   channel,
		Target:    target,
		CodeHash:  sha256Hex(code),
		ExpiresAt: time.Now().UTC().Add(time.Duration(expiresIn) * time.Second),
	}
	if err := s.db.WithContext(ctx).Create(&challenge).Error; err != nil {
		return ChallengeStartResult{}, err
	}
	return ChallengeStartResult{
		ChallengeID: fmt.Sprint(challenge.ID),
		ExpiresIn:   expiresIn,
		DevCode:     code,
	}, nil
}

func (s *Service) VerifyChallenge(ctx context.Context, input ChallengeVerifyInput) (model.AuthChallenge, error) {
	var challenge model.AuthChallenge
	err := s.db.WithContext(ctx).Where("id = ?", input.ChallengeID).First(&challenge).Error
	if err != nil {
		return model.AuthChallenge{}, ErrInvalidChallenge
	}
	if challenge.ConsumedAt != nil || !challenge.ExpiresAt.After(time.Now().UTC()) || challenge.Attempts >= 5 {
		return model.AuthChallenge{}, ErrInvalidChallenge
	}
	if challenge.CodeHash != sha256Hex(strings.TrimSpace(input.Code)) {
		_ = s.db.WithContext(ctx).Model(&challenge).UpdateColumn("attempts", gorm.Expr("attempts + 1")).Error
		return model.AuthChallenge{}, ErrInvalidChallenge
	}
	now := time.Now().UTC()
	if err := s.db.WithContext(ctx).Model(&challenge).Updates(map[string]any{"consumed_at": &now}).Error; err != nil {
		return model.AuthChallenge{}, err
	}
	challenge.ConsumedAt = &now
	return challenge, nil
}

func (s *Service) LoginWithEmail(ctx context.Context, email string) (model.User, error) {
	email = normalizeEmail(email)
	if email == "" {
		return model.User{}, ErrInvalidCredentials
	}
	var u model.User
	if err := s.db.WithContext(ctx).Where("primary_email = ?", email).First(&u).Error; err != nil {
		return model.User{}, ErrInvalidCredentials
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
	session := model.AuthSession{
		UserID:    userID,
		TokenHash: sha256Hex(raw),
		ExpiresAt: expiresAt,
		UserAgent: domainauth.Truncate(userAgent, 512),
		IPAddress: domainauth.Truncate(ipAddress, 64),
	}
	if err := s.db.WithContext(ctx).Create(&session).Error; err != nil {
		return "", time.Time{}, err
	}
	return raw, expiresAt, nil
}

func (s *Service) UserForSession(ctx context.Context, raw string) (model.User, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return model.User{}, ErrInvalidCredentials
	}
	var session model.AuthSession
	err := s.db.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", sha256Hex(raw), time.Now().UTC()).
		First(&session).Error
	if err != nil {
		return model.User{}, ErrInvalidCredentials
	}
	now := time.Now().UTC()
	_ = s.db.WithContext(ctx).Model(&session).Updates(map[string]any{"last_seen_at": &now}).Error
	return s.CurrentUser(ctx, session.UserID)
}

func (s *Service) RevokeSession(ctx context.Context, raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	now := time.Now().UTC()
	return s.db.WithContext(ctx).
		Model(&model.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", sha256Hex(raw)).
		Update("revoked_at", &now).Error
}

func (s *Service) IssueCredential(ctx context.Context, input CredentialInput) (Credential, error) {
	if s.tokens == nil {
		return Credential{}, errors.New("auth token manager is required")
	}
	token, expiresAt, err := s.tokens.Issue(input.User)
	if err != nil {
		return Credential{}, err
	}
	memberships, err := s.OrgMemberships(ctx, input.User.ID)
	if err != nil {
		return Credential{}, err
	}
	credential := Credential{
		Token:          token,
		TokenType:      "Bearer",
		ExpiresAt:      expiresAt,
		OrgMemberships: memberships,
	}
	if raw, cookieExpiresAt, err := s.CreateSession(ctx, input.User.ID, time.Until(expiresAt), input.UserAgent, input.IPAddress); err == nil {
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
	members := make([]model.OrganizationMember, 0)
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	if len(members) == 0 {
		var user model.User
		if err := s.db.WithContext(ctx).First(&user, userID).Error; err == nil {
			_ = orgapp.CreatePersonalOrg(s.db.WithContext(ctx), &user)
			_ = s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error
		}
	}

	memberships := make([]OrgMembershipSummary, 0, len(members))
	for _, m := range members {
		var org model.Organization
		if s.db.WithContext(ctx).First(&org, m.OrgID).Error != nil {
			continue
		}
		memberships = append(memberships, OrgMembershipSummary{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Plan:       org.Plan,
			Status:     org.Status,
			Role:       m.Role,
		})
	}
	return memberships, nil
}
