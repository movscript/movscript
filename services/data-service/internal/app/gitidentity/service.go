package gitidentity

import (
	"context"
	crand "crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const ProviderGitea = "gitea"

type Config struct {
	UserEmailDomain string
	UserTokenName   string
}

type Credential struct {
	UserID      uint
	Provider    string
	Username    string
	Email       string
	Token       string
	MaskedToken string
	Status      string
	LastError   string
}

type Service struct {
	db            *gorm.DB
	adapter       giteaAdapter
	config        Config
	encryptionKey []byte
}

type giteaAdapter interface {
	EnsureUser(ctx context.Context, input projectrepoapp.EnsureUserInput) (projectrepoapp.EnsureUserResult, error)
	EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error
	CheckRepoAccess(ctx context.Context, request projectrepoapp.RepositoryAccessRequest) (projectrepoapp.RepositoryAccessResult, error)
}

func NewService(db *gorm.DB, adapter giteaAdapter, cfg Config, encryptionKey []byte) *Service {
	return &Service{
		db:            db,
		adapter:       adapter,
		config:        normalizeConfig(cfg),
		encryptionKey: encryptionKey,
	}
}

func (s *Service) EnsureForUser(ctx context.Context, user domainidentity.UserProfile) (Credential, error) {
	if user.ID == 0 {
		return Credential{}, fmt.Errorf("user id is required")
	}
	if existing, err := s.findCredential(ctx, user.ID); err == nil && existing.EncryptedToken != "" {
		credential, decryptErr := s.credentialFromModel(existing, true)
		if decryptErr == nil && strings.TrimSpace(credential.Token) != "" {
			return credential, nil
		}
	} else if err != nil && !errorsIsNotFound(err) {
		return Credential{}, err
	}
	if s.adapter == nil {
		return Credential{}, fmt.Errorf("gitea adapter is not configured")
	}
	if len(s.encryptionKey) == 0 {
		return Credential{}, fmt.Errorf("git credential encryption key is not configured")
	}

	giteaUsername := s.giteaUsername(user)
	password, err := randomSecret()
	if err != nil {
		return Credential{}, err
	}
	tokenName := s.giteaTokenName(user.ID)
	result, err := s.adapter.EnsureUser(ctx, projectrepoapp.EnsureUserInput{
		Username:  giteaUsername,
		Email:     s.giteaEmail(giteaUsername),
		Password:  password,
		TokenName: tokenName,
	})
	if err != nil {
		_ = s.saveError(ctx, user.ID, giteaUsername, err)
		return Credential{}, err
	}

	encryptedPassword, err := crypto.Encrypt(password, s.encryptionKey)
	if err != nil {
		return Credential{}, err
	}
	encryptedToken, err := crypto.Encrypt(result.Token, s.encryptionKey)
	if err != nil {
		return Credential{}, err
	}
	row := persistencemodel.UserGitCredential{
		UserID:            user.ID,
		Provider:          ProviderGitea,
		Username:          result.Username,
		Email:             s.giteaEmail(result.Username),
		TokenName:         tokenName,
		EncryptedPassword: encryptedPassword,
		EncryptedToken:    encryptedToken,
		MaskedToken:       crypto.MaskKey(result.Token),
		Status:            "active",
		LastError:         "",
	}
	if err := s.upsertCredential(ctx, &row); err != nil {
		return Credential{}, err
	}
	return Credential{
		UserID:      user.ID,
		Provider:    row.Provider,
		Username:    row.Username,
		Email:       row.Email,
		Token:       result.Token,
		MaskedToken: row.MaskedToken,
		Status:      row.Status,
	}, nil
}

func (s *Service) CredentialForUser(ctx context.Context, userID uint) (Credential, error) {
	row, err := s.findCredential(ctx, userID)
	if err != nil {
		return Credential{}, err
	}
	return s.credentialFromModel(row, true)
}

func (s *Service) EnsureRepoAccess(ctx context.Context, userID uint, owner string, repo string) (Credential, error) {
	credential, err := s.CredentialForUser(ctx, userID)
	if err != nil {
		return Credential{}, err
	}
	if s.adapter != nil {
		if err := s.adapter.EnsureRepoCollaborator(ctx, owner, repo, credential.Username, "write"); err != nil {
			return Credential{}, err
		}
		access, err := s.adapter.CheckRepoAccess(ctx, projectrepoapp.RepositoryAccessRequest{
			Owner:      owner,
			Repo:       repo,
			Username:   credential.Username,
			Permission: "write",
		})
		if err != nil {
			return Credential{}, err
		}
		if !access.Allowed {
			return Credential{}, fmt.Errorf("gitea collaborator %q does not have write access to %s/%s", credential.Username, owner, repo)
		}
	}
	return credential, nil
}

func (s *Service) findCredential(ctx context.Context, userID uint) (persistencemodel.UserGitCredential, error) {
	var row persistencemodel.UserGitCredential
	err := s.db.WithContext(ctx).Where("user_id = ? AND provider = ?", userID, ProviderGitea).First(&row).Error
	return row, err
}

func (s *Service) upsertCredential(ctx context.Context, row *persistencemodel.UserGitCredential) error {
	var existing persistencemodel.UserGitCredential
	err := s.db.WithContext(ctx).Where("user_id = ? AND provider = ?", row.UserID, row.Provider).First(&existing).Error
	if err == nil {
		return s.db.WithContext(ctx).Model(&existing).Updates(map[string]any{
			"username":           row.Username,
			"email":              row.Email,
			"token_name":         row.TokenName,
			"encrypted_password": row.EncryptedPassword,
			"encrypted_token":    row.EncryptedToken,
			"masked_token":       row.MaskedToken,
			"status":             row.Status,
			"last_error":         row.LastError,
		}).Error
	}
	if !errorsIsNotFound(err) {
		return err
	}
	return s.db.WithContext(ctx).Create(row).Error
}

func (s *Service) saveError(ctx context.Context, userID uint, username string, cause error) error {
	row := persistencemodel.UserGitCredential{
		UserID:    userID,
		Provider:  ProviderGitea,
		Username:  username,
		Email:     s.giteaEmail(username),
		Status:    "error",
		LastError: cause.Error(),
	}
	return s.upsertCredential(ctx, &row)
}

func (s *Service) credentialFromModel(row persistencemodel.UserGitCredential, includeToken bool) (Credential, error) {
	credential := Credential{
		UserID:      row.UserID,
		Provider:    row.Provider,
		Username:    row.Username,
		Email:       row.Email,
		MaskedToken: row.MaskedToken,
		Status:      row.Status,
		LastError:   row.LastError,
	}
	if includeToken && row.EncryptedToken != "" {
		token, err := crypto.Decrypt(row.EncryptedToken, s.encryptionKey)
		if err != nil {
			return Credential{}, err
		}
		credential.Token = token
	}
	return credential, nil
}

func (s *Service) giteaUsername(user domainidentity.UserProfile) string {
	return strings.TrimSpace(user.Username)
}

func (s *Service) giteaEmail(username string) string {
	return username + "@" + s.config.UserEmailDomain
}

func (s *Service) giteaTokenName(userID uint) string {
	return fmt.Sprintf("%s-%d-%s", s.config.UserTokenName, userID, randomTokenSuffix())
}

func normalizeConfig(cfg Config) Config {
	cfg.UserEmailDomain = strings.TrimSpace(cfg.UserEmailDomain)
	if cfg.UserEmailDomain == "" {
		cfg.UserEmailDomain = "users.movscript.local"
	}
	cfg.UserTokenName = strings.TrimSpace(cfg.UserTokenName)
	if cfg.UserTokenName == "" {
		cfg.UserTokenName = "movscript-desktop"
	}
	return cfg
}

func randomSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := crand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func randomTokenSuffix() string {
	raw := make([]byte, 6)
	if _, err := crand.Read(raw); err != nil {
		return "token"
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func errorsIsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
