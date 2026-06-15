package newapi

import (
	"context"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type IdentityService struct {
	db            *gorm.DB
	encryptionKey []byte
	client        *Client
	cfg           Config
}

func NewIdentityService(db *gorm.DB, encryptionKey []byte, cfg Config, client *Client) *IdentityService {
	if client == nil {
		client = NewClient(cfg, nil)
	}
	return &IdentityService{db: db, encryptionKey: encryptionKey, client: client, cfg: cfg}
}

func (s *IdentityService) RelayTokenForUser(ctx context.Context, userID uint) (string, error) {
	return s.RelayTokenForUserGroup(ctx, userID, "")
}

func (s *IdentityService) RelayTokenForUserGroup(ctx context.Context, userID uint, group string) (string, error) {
	if userID == 0 {
		return "", fmt.Errorf("movscript user id is required for new-api relay")
	}
	if fallback := normalizeRelayToken(s.cfg.RelayTokenFallback); fallback != "" {
		return fallback, nil
	}
	group = s.cfg.ResolveTokenGroup(group)
	if s.db == nil {
		return "", fmt.Errorf("database is required for new-api relay token provisioning")
	}
	if len(s.encryptionKey) == 0 {
		return "", fmt.Errorf("encryption key is required for new-api relay token storage")
	}
	var identity persistencemodel.NewAPIIdentity
	err := s.db.WithContext(ctx).Where("user_id = ? AND new_api_group = ?", userID, group).First(&identity).Error
	if err == nil && strings.TrimSpace(identity.EncryptedRelayKey) != "" {
		plain, decryptErr := crypto.Decrypt(identity.EncryptedRelayKey, s.encryptionKey)
		if decryptErr == nil && strings.TrimSpace(plain) != "" {
			return normalizeRelayToken(plain), nil
		}
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return "", err
	}
	if err := s.cfg.ValidateAdmin(); err != nil {
		return "", err
	}
	user, err := s.client.EnsureUser(ctx, userID)
	if err != nil {
		return "", err
	}
	tokenID, tokenKey, err := s.client.EnsureRelayToken(ctx, user, userID, group)
	if err != nil {
		return "", err
	}
	encrypted, err := crypto.Encrypt(tokenKey, s.encryptionKey)
	if err != nil {
		return "", err
	}
	next := persistencemodel.NewAPIIdentity{
		UserID:             userID,
		NewAPIUserID:       user.ID,
		NewAPIUsername:     user.Username,
		NewAPITokenID:      tokenID,
		NewAPIGroup:        group,
		EncryptedRelayKey:  encrypted,
		ProvisioningStatus: "active",
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "new_api_group"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"new_api_user_id",
			"new_api_username",
			"new_api_token_id",
			"new_api_group",
			"encrypted_relay_key",
			"provisioning_status",
			"updated_at",
		}),
	}).Create(&next).Error; err != nil {
		return "", err
	}
	return normalizeRelayToken(tokenKey), nil
}

func normalizeRelayToken(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	if strings.HasPrefix(token, "sk-") {
		return token
	}
	return "sk-" + token
}
