package cloud

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	domaincloud "github.com/movscript/movscript/internal/domain/cloud"
	"github.com/movscript/movscript/internal/infra/crypto"
	"github.com/movscript/movscript/internal/infra/upload"
	"gorm.io/gorm"
)

var (
	ErrNotFound      = errors.New("cloud file config not found")
	ErrInvalidName   = errors.New("invalid cloud file config name")
	ErrInvalidConfig = errors.New("invalid cloud file config")
	ErrEncryptConfig = errors.New("encrypt config")
)

type Service struct {
	repo          repository
	encryptionKey []byte
	testUpload    func(context.Context, domaincloud.Config, []byte, string, string) (uint, upload.UploadResult, error)
}

func NewService(db *gorm.DB, encryptionKeyHex string) *Service {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &Service{repo: &gormRepository{db: db}, encryptionKey: key, testUpload: testCloudFileConfigUpload}
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

type Config = domaincloud.Config

type TestResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMS int64  `json:"latency_ms"`
	URL       string `json:"url,omitempty"`
	ConfigID  uint   `json:"config_id,omitempty"`
}

func (s *Service) List(ctx context.Context) ([]Config, error) {
	cfgs, err := s.repo.ListConfigs(ctx)
	if err != nil {
		return nil, err
	}
	for i := range cfgs {
		cfgs[i].MaskedConfig = s.maskConfig(cfgs[i].ConfigJSON)
	}
	return cfgs, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (Config, error) {
	if strings.TrimSpace(input.Name) == "" {
		return Config{}, ErrInvalidName
	}
	configType := strings.TrimSpace(input.ConfigType)
	if !ValidConfigType(configType) {
		return Config{}, ErrInvalidConfig
	}
	if !s.validConfig(configType, input.Config) {
		return Config{}, ErrInvalidConfig
	}
	encJSON, err := s.encryptConfig(input.Config)
	if err != nil {
		return Config{}, fmt.Errorf("%w: %v", ErrEncryptConfig, err)
	}
	cfg := domaincloud.NewConfig(domaincloud.NewConfigSpec{
		Name:       input.Name,
		ConfigType: configType,
		ConfigJSON: encJSON,
		Priority:   input.Priority,
		IsEnabled:  input.IsEnabled,
	})
	if err := s.repo.CreateConfig(ctx, &cfg); err != nil {
		return Config{}, err
	}
	cfg.MaskedConfig = s.maskConfig(cfg.ConfigJSON)
	return cfg, nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (Config, error) {
	cfg, err := s.repo.GetConfig(ctx, input.ID)
	if err != nil {
		return cfg, err
	}
	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return cfg, ErrInvalidName
		}
		cfg.Name = *input.Name
	}
	if input.Config != nil {
		merged := s.mergeConfigUpdate(cfg.ConfigJSON, input.Config)
		if !s.validConfig(cfg.ConfigType, merged) {
			return cfg, ErrInvalidConfig
		}
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
		if *input.IsEnabled && !s.validConfig(cfg.ConfigType, s.decryptConfig(cfg.ConfigJSON)) {
			return cfg, ErrInvalidConfig
		}
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

func (s *Service) Test(ctx context.Context, id uint) (TestResult, error) {
	cfg, err := s.repo.GetConfig(ctx, id)
	if err != nil {
		return TestResult{}, err
	}
	plainConfig := s.decryptConfig(cfg.ConfigJSON)
	if !s.validConfig(cfg.ConfigType, plainConfig) {
		return TestResult{}, ErrInvalidConfig
	}
	plainConfigJSON, err := json.Marshal(plainConfig)
	if err != nil {
		return TestResult{}, ErrInvalidConfig
	}
	cfg.ConfigJSON = string(plainConfigJSON)

	start := time.Now()
	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	filename := fmt.Sprintf("admin-cloud-test-%d-%d.txt", cfg.ID, time.Now().UTC().UnixNano())
	configID, result, err := s.testUpload(
		timeoutCtx,
		cfg,
		[]byte("movscript cloud file config test\n"),
		filename,
		"text/plain; charset=utf-8",
	)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return TestResult{
			Success:   false,
			Message:   err.Error(),
			LatencyMS: latency,
		}, nil
	}
	return TestResult{
		Success:   true,
		Message:   "ok",
		LatencyMS: latency,
		URL:       result.URL,
		ConfigID:  configID,
	}, nil
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

func (s *Service) validConfig(configType string, cfg map[string]any) bool {
	return len(domaincloud.MissingRequiredConfigFields(configType, cfg)) == 0
}

func (s *Service) mergeConfigUpdate(existingEncJSON string, incoming map[string]any) map[string]any {
	existing := s.decryptConfig(existingEncJSON)
	return domaincloud.MergeConfigUpdate(existing, incoming)
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
	return domaincloud.MaskConfig(m)
}

func ValidConfigType(t string) bool {
	return domaincloud.ValidConfigType(t)
}

func testCloudFileConfigUpload(ctx context.Context, cfg domaincloud.Config, data []byte, filename, mimeType string) (uint, upload.UploadResult, error) {
	service, err := upload.NewFromConfigs([]upload.CloudFileConfig{{
		ID:         cfg.ID,
		Name:       cfg.Name,
		ConfigType: cfg.ConfigType,
		ConfigJSON: cfg.ConfigJSON,
		Priority:   cfg.Priority,
		IsEnabled:  true,
	}})
	if err != nil {
		return 0, upload.UploadResult{}, err
	}
	return service.UploadWithFallback(ctx, data, filename, mimeType)
}
