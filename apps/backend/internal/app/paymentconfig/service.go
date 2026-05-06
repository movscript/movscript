package paymentconfig

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	domainpaymentconfig "github.com/movscript/movscript/internal/domain/paymentconfig"
	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

var (
	ErrNotFound      = errors.New("payment config not found")
	ErrInvalidConfig = errors.New("invalid payment config")
	ErrEncryptConfig = errors.New("encrypt payment config")
)

type Service struct {
	repo          repository
	encryptionKey []byte
}

func NewService(db *gorm.DB, encryptionKeyHex string) *Service {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &Service{repo: &gormRepository{db: db}, encryptionKey: key}
}

type CreateInput struct {
	Name       string
	ConfigType string
	Mode       string
	Currency   string
	Config     map[string]any
	Priority   int
	IsEnabled  bool
}

type UpdateInput struct {
	ID        uint
	Name      *string
	Mode      *string
	Currency  *string
	Config    map[string]any
	Priority  *int
	IsEnabled *bool
}

func (s *Service) List(ctx context.Context) ([]model.PaymentConfig, error) {
	cfgs, err := s.repo.ListConfigs(ctx)
	if err != nil {
		return nil, err
	}
	for i := range cfgs {
		cfgs[i].MaskedConfig = s.maskConfig(cfgs[i].ConfigJSON)
	}
	return cfgs, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (model.PaymentConfig, error) {
	if !domainpaymentconfig.ValidConfigType(input.ConfigType) || !domainpaymentconfig.ValidMode(input.Mode) {
		return model.PaymentConfig{}, ErrInvalidConfig
	}
	mode := strings.TrimSpace(input.Mode)
	if mode == "" {
		mode = domainpaymentconfig.ModeSandbox
	}
	currency := strings.ToUpper(strings.TrimSpace(input.Currency))
	if currency == "" {
		currency = "CNY"
	}
	encJSON, err := s.encryptConfig(input.Config)
	if err != nil {
		return model.PaymentConfig{}, fmt.Errorf("%w: %v", ErrEncryptConfig, err)
	}
	cfg := model.PaymentConfig{
		Name:       input.Name,
		ConfigType: input.ConfigType,
		Mode:       mode,
		Currency:   currency,
		ConfigJSON: encJSON,
		Priority:   input.Priority,
		IsEnabled:  input.IsEnabled,
	}
	if err := s.repo.CreateConfig(ctx, &cfg); err != nil {
		return model.PaymentConfig{}, err
	}
	cfg.MaskedConfig = s.maskConfig(cfg.ConfigJSON)
	return cfg, nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (model.PaymentConfig, error) {
	cfg, err := s.repo.GetConfig(ctx, input.ID)
	if err != nil {
		return cfg, err
	}
	if input.Name != nil {
		cfg.Name = *input.Name
	}
	if input.Mode != nil {
		mode := strings.TrimSpace(*input.Mode)
		if !domainpaymentconfig.ValidMode(mode) {
			return cfg, ErrInvalidConfig
		}
		if mode == "" {
			mode = domainpaymentconfig.ModeSandbox
		}
		cfg.Mode = mode
	}
	if input.Currency != nil {
		currency := strings.ToUpper(strings.TrimSpace(*input.Currency))
		if currency == "" {
			currency = "CNY"
		}
		cfg.Currency = currency
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
	if err := s.repo.SaveConfig(ctx, &cfg); err != nil {
		return cfg, err
	}
	cfg.MaskedConfig = s.maskConfig(cfg.ConfigJSON)
	return cfg, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	return s.repo.DeleteConfig(ctx, id)
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
	return domainpaymentconfig.MergeConfigUpdate(existing, incoming)
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
	return domainpaymentconfig.MaskConfig(s.decryptConfig(encJSON))
}
