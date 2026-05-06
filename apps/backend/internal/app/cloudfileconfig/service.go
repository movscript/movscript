package cloudfileconfig

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

var (
	ErrNotFound      = errors.New("cloud file config not found")
	ErrInvalidConfig = errors.New("invalid cloud file config")
	ErrEncryptConfig = errors.New("encrypt config")
)

type Service struct {
	db            *gorm.DB
	encryptionKey []byte
}

func NewService(db *gorm.DB, encryptionKeyHex string) *Service {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &Service{db: db, encryptionKey: key}
}

type CreateInput struct {
	Name       string
	ConfigType string
	Config     map[string]any
	Priority   int
	IsEnabled  bool
}

type UpdateInput struct {
	ID        uint
	Name      *string
	Config    map[string]any
	Priority  *int
	IsEnabled *bool
}

func (s *Service) List(ctx context.Context) ([]model.CloudFileConfig, error) {
	cfgs := make([]model.CloudFileConfig, 0)
	if err := s.db.WithContext(ctx).Order("priority asc, id asc").Find(&cfgs).Error; err != nil {
		return nil, err
	}
	for i := range cfgs {
		cfgs[i].MaskedConfig = s.maskConfig(cfgs[i].ConfigJSON)
	}
	return cfgs, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (model.CloudFileConfig, error) {
	if !ValidConfigType(input.ConfigType) {
		return model.CloudFileConfig{}, ErrInvalidConfig
	}
	encJSON, err := s.encryptConfig(input.Config)
	if err != nil {
		return model.CloudFileConfig{}, fmt.Errorf("%w: %v", ErrEncryptConfig, err)
	}
	cfg := model.CloudFileConfig{
		Name:       input.Name,
		ConfigType: input.ConfigType,
		ConfigJSON: encJSON,
		Priority:   input.Priority,
		IsEnabled:  input.IsEnabled,
	}
	if err := s.db.WithContext(ctx).Create(&cfg).Error; err != nil {
		return model.CloudFileConfig{}, err
	}
	cfg.MaskedConfig = s.maskConfig(cfg.ConfigJSON)
	return cfg, nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (model.CloudFileConfig, error) {
	var cfg model.CloudFileConfig
	if err := s.db.WithContext(ctx).First(&cfg, input.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cfg, ErrNotFound
		}
		return cfg, err
	}
	if input.Name != nil {
		cfg.Name = *input.Name
	}
	if input.Config != nil {
		merged := s.mergeConfigUpdate(cfg.ConfigJSON, input.Config)
		encJSON, err := s.encryptConfig(merged)
		if err != nil {
			return cfg, fmt.Errorf("%w: %v", ErrEncryptConfig, err)
		}
		cfg.ConfigJSON = encJSON
	}
	if input.Priority != nil {
		cfg.Priority = *input.Priority
	}
	if input.IsEnabled != nil {
		cfg.IsEnabled = *input.IsEnabled
	}
	if err := s.db.WithContext(ctx).Save(&cfg).Error; err != nil {
		return cfg, err
	}
	cfg.MaskedConfig = s.maskConfig(cfg.ConfigJSON)
	return cfg, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&model.CloudFileConfig{}, id).Error
}

func (s *Service) encryptConfig(cfg map[string]any) (string, error) {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}
	if len(s.encryptionKey) == 0 {
		return string(raw), nil
	}
	return crypto.Encrypt(string(raw), s.encryptionKey)
}

func (s *Service) mergeConfigUpdate(existingEncJSON string, incoming map[string]any) map[string]any {
	existing := s.decryptConfig(existingEncJSON)
	for k, v := range incoming {
		if isSensitiveConfigKey(k) {
			if text, ok := v.(string); ok && (text == "" || isMaskedSecret(text)) {
				if old, exists := existing[k]; exists {
					incoming[k] = old
				}
			}
		}
	}
	return incoming
}

func (s *Service) decryptConfig(encJSON string) map[string]any {
	if encJSON == "" {
		return map[string]any{}
	}
	raw := encJSON
	if len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(encJSON, s.encryptionKey); err == nil {
			raw = plain
		}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return map[string]any{}
	}
	return m
}

func (s *Service) maskConfig(encJSON string) string {
	if encJSON == "" {
		return "{}"
	}
	raw := encJSON
	if len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(encJSON, s.encryptionKey); err == nil {
			raw = plain
		}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return "{}"
	}
	for k, v := range m {
		if isSensitiveConfigKey(k) {
			if text, ok := v.(string); ok && len(text) > 4 {
				m[k] = text[:4] + "****"
			} else {
				m[k] = "****"
			}
		}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func isSensitiveConfigKey(k string) bool {
	switch k {
	case "api_key", "secret_key", "access_key", "access_key_id", "access_key_secret":
		return true
	}
	return false
}

func isMaskedSecret(s string) bool {
	return s == "****" || (len(s) >= 4 && s[len(s)-4:] == "****")
}

func ValidConfigType(t string) bool {
	switch t {
	case "s3", "oss", "tos":
		return true
	}
	return false
}
