package aiadmin

import (
	"context"
	"errors"
	"fmt"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/crypto"
	"github.com/movscript/movscript/internal/model"
	sharedservice "github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

var (
	ErrNotFound           = errors.New("ai admin item not found")
	ErrEncryptCredentials = errors.New("failed to encrypt credentials")
	ErrEncryptFilesAPIKey = errors.New("failed to encrypt files api key")
)

type Service struct {
	db            *gorm.DB
	encryptionKey []byte
	registry      *ai.Registry
}

func NewService(db *gorm.DB, encryptionKey []byte, registry *ai.Registry) *Service {
	return &Service{db: db, encryptionKey: encryptionKey, registry: registry}
}

type CreateCredentialInput struct {
	AdapterType     string
	DisplayName     string
	Credentials     map[string]string
	FilesAPIEnabled bool
	FilesAPIBaseURL string
	FilesAPIKey     string
}

type UpdateCredentialInput struct {
	ID              string
	DisplayName     string
	BaseURL         *string
	APIKey          string
	IsEnabled       *bool
	FilesAPIEnabled *bool
	FilesAPIBaseURL *string
	FilesAPIKey     string
	Credentials     map[string]string
}

type PatchModelConfigInput struct {
	ID                    string
	ModelIDOverride       *string
	IsEnabled             *bool
	Priority              *int
	CreditsInputPer1M     *float64
	CreditsOutputPer1M    *float64
	CreditsPerImage       *float64
	CreditsPerSecond      *float64
	CreditsPerCall        *float64
	CustomDisplayName     *string
	ShortName             *string
	CustomCapabilities    *string
	CustomBillingMode     *string
	CustomAcceptsImage    *bool
	CustomMaxInputImages  *int
	CustomMaxInputVideos  *int
	CustomImageEditField  *string
	CustomSupportedParams *string
}

type UserWithQuota struct {
	model.User
	Balance float64 `json:"balance"`
}

type UsageLogFilter struct {
	UserID        string
	ModelConfigID string
	ProviderID    string
	Start         string
	End           string
	Page          int
	PageSize      int
}

type UsageLogPage struct {
	Total    int64
	Items    []model.UsageLog
	Page     int
	PageSize int
}

type MyQuotaSummary struct {
	Balance              float64
	TotalCostThisMonth   float64
	TotalTokensThisMonth int64
}

type MyUsageLogPage struct {
	Total int64
	Items []model.UsageLog
}

func (s *Service) ListCredentials(ctx context.Context) ([]model.AICredential, error) {
	creds := make([]model.AICredential, 0)
	if err := s.db.WithContext(ctx).Preload("Models").Find(&creds).Error; err != nil {
		return nil, err
	}
	for i := range creds {
		s.applyMaskedKeys(&creds[i])
	}
	return creds, nil
}

func (s *Service) CreateCredential(ctx context.Context, input CreateCredentialInput) (model.AICredential, error) {
	def := ai.GetAdapterDef(input.AdapterType)
	baseURL := ""
	if def != nil {
		baseURL = def.DefaultBaseURL
	}
	if v := input.Credentials["base_url"]; v != "" {
		baseURL = v
	}

	cred := model.AICredential{
		AdapterType:     input.AdapterType,
		DisplayName:     input.DisplayName,
		BaseURL:         baseURL,
		IsEnabled:       true,
		FilesAPIEnabled: input.FilesAPIEnabled,
		FilesAPIBaseURL: input.FilesAPIBaseURL,
	}
	if input.FilesAPIKey != "" {
		encFilesKey, _, err := s.registry.EncryptRawKey(input.FilesAPIKey)
		if err != nil {
			return cred, fmt.Errorf("%w: %v", ErrEncryptFilesAPIKey, err)
		}
		cred.FilesAPIEncryptedKey = encFilesKey
		cred.FilesAPIMaskedKey = crypto.MaskKey(input.FilesAPIKey)
	}
	encKey, masked, err := s.registry.EncryptCredentials(input.AdapterType, input.Credentials)
	if err != nil {
		return cred, fmt.Errorf("%w: %v", ErrEncryptCredentials, err)
	}
	cred.EncryptedKey = encKey
	cred.MaskedKey = masked

	if err := s.db.WithContext(ctx).Create(&cred).Error; err != nil {
		return cred, err
	}
	return cred, nil
}

func (s *Service) UpdateCredential(ctx context.Context, input UpdateCredentialInput) (model.AICredential, error) {
	cred, err := s.GetCredential(ctx, input.ID)
	if err != nil {
		return cred, err
	}
	if input.DisplayName != "" {
		cred.DisplayName = input.DisplayName
	}
	if input.BaseURL != nil {
		cred.BaseURL = *input.BaseURL
	}
	if input.IsEnabled != nil {
		cred.IsEnabled = *input.IsEnabled
	}
	if input.FilesAPIEnabled != nil {
		cred.FilesAPIEnabled = *input.FilesAPIEnabled
	}
	if input.FilesAPIBaseURL != nil {
		cred.FilesAPIBaseURL = *input.FilesAPIBaseURL
	}
	if input.FilesAPIKey != "" {
		encFilesKey, _, err := s.registry.EncryptRawKey(input.FilesAPIKey)
		if err != nil {
			return cred, fmt.Errorf("%w: %v", ErrEncryptFilesAPIKey, err)
		}
		cred.FilesAPIEncryptedKey = encFilesKey
		cred.FilesAPIMaskedKey = crypto.MaskKey(input.FilesAPIKey)
	}
	if input.APIKey != "" {
		if input.Credentials == nil {
			input.Credentials = map[string]string{}
		}
		input.Credentials["api_key"] = input.APIKey
	}
	if len(input.Credentials) > 0 {
		if v, ok := input.Credentials["base_url"]; ok {
			cred.BaseURL = v
		}
		if cred.AdapterType == ai.AdapterKling && (input.Credentials["access_key"] != "" || input.Credentials["secret_key"] != "") {
			if plain, err := crypto.Decrypt(cred.EncryptedKey, s.encryptionKey); err == nil {
				parts := splitKlingCredential(plain)
				if input.Credentials["access_key"] == "" {
					input.Credentials["access_key"] = parts[0]
				}
				if input.Credentials["secret_key"] == "" {
					input.Credentials["secret_key"] = parts[1]
				}
			}
		}
		encKey, masked, err := s.registry.EncryptCredentials(cred.AdapterType, input.Credentials)
		if err != nil {
			return cred, fmt.Errorf("%w: %v", ErrEncryptCredentials, err)
		}
		if encKey != "" {
			cred.EncryptedKey = encKey
			cred.MaskedKey = masked
		}
	}
	if err := s.db.WithContext(ctx).Save(&cred).Error; err != nil {
		return cred, err
	}
	s.applyMaskedKeys(&cred)
	return cred, nil
}

func (s *Service) DeleteCredential(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Delete(&model.AICredential{}, id).Error
}

func (s *Service) GetCredential(ctx context.Context, id any) (model.AICredential, error) {
	var cred model.AICredential
	if err := s.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cred, ErrNotFound
		}
		return cred, err
	}
	return cred, nil
}

func (s *Service) ListModelConfigs(ctx context.Context, credentialID string) ([]model.AIModelConfig, error) {
	cfgs := make([]model.AIModelConfig, 0)
	err := s.db.WithContext(ctx).Where("credential_id = ?", credentialID).Find(&cfgs).Error
	return cfgs, err
}

func (s *Service) CreateModelConfig(ctx context.Context, credentialID uint, input sharedservice.AIModelConfigInput) (model.AIModelConfig, error) {
	cfg := sharedservice.NewAIModelConfig(input, credentialID)
	if err := s.db.WithContext(ctx).Create(&cfg).Error; err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) UpdateModelConfig(ctx context.Context, id string, input sharedservice.AIModelConfigInput) (model.AIModelConfig, error) {
	cfg, err := s.GetModelConfig(ctx, id)
	if err != nil {
		return cfg, err
	}
	sharedservice.ApplyAIModelConfigInput(&cfg, input)
	if err := s.db.WithContext(ctx).Save(&cfg).Error; err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) DeleteModelConfig(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Delete(&model.AIModelConfig{}, id).Error
}

func (s *Service) PatchModelConfig(ctx context.Context, input PatchModelConfigInput) (model.AIModelConfig, error) {
	cfg, err := s.GetModelConfig(ctx, input.ID)
	if err != nil {
		return cfg, err
	}
	if input.ModelIDOverride != nil {
		cfg.ModelIDOverride = *input.ModelIDOverride
	}
	if input.CustomDisplayName != nil {
		cfg.CustomDisplayName = *input.CustomDisplayName
	}
	if input.ShortName != nil {
		cfg.ShortName = *input.ShortName
	}
	if input.CustomCapabilities != nil {
		cfg.CustomCapabilities = *input.CustomCapabilities
	}
	if input.CustomBillingMode != nil {
		cfg.CustomBillingMode = *input.CustomBillingMode
	}
	if input.CustomAcceptsImage != nil {
		cfg.CustomAcceptsImage = *input.CustomAcceptsImage
	}
	if input.CustomMaxInputImages != nil {
		cfg.CustomMaxInputImages = *input.CustomMaxInputImages
	}
	if input.CustomMaxInputVideos != nil {
		cfg.CustomMaxInputVideos = *input.CustomMaxInputVideos
	}
	if input.CustomImageEditField != nil {
		cfg.CustomImageEditField = *input.CustomImageEditField
	}
	if input.CustomSupportedParams != nil {
		cfg.CustomSupportedParams = *input.CustomSupportedParams
	}
	if input.IsEnabled != nil {
		cfg.IsEnabled = *input.IsEnabled
	}
	if input.Priority != nil {
		cfg.Priority = *input.Priority
	}
	if input.CreditsInputPer1M != nil {
		cfg.CreditsInputPer1M = *input.CreditsInputPer1M
	}
	if input.CreditsOutputPer1M != nil {
		cfg.CreditsOutputPer1M = *input.CreditsOutputPer1M
	}
	if input.CreditsPerImage != nil {
		cfg.CreditsPerImage = *input.CreditsPerImage
	}
	if input.CreditsPerSecond != nil {
		cfg.CreditsPerSecond = *input.CreditsPerSecond
	}
	if input.CreditsPerCall != nil {
		cfg.CreditsPerCall = *input.CreditsPerCall
	}
	if err := s.db.WithContext(ctx).Save(&cfg).Error; err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) GetModelConfig(ctx context.Context, id string) (model.AIModelConfig, error) {
	var cfg model.AIModelConfig
	if err := s.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cfg, ErrNotFound
		}
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) ListUsersWithQuota(ctx context.Context) ([]UserWithQuota, error) {
	users := make([]model.User, 0)
	if err := s.db.WithContext(ctx).Find(&users).Error; err != nil {
		return nil, err
	}
	result := make([]UserWithQuota, len(users))
	for i, u := range users {
		var quota model.UserQuota
		if err := s.db.WithContext(ctx).Where("user_id = ?", u.ID).First(&quota).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		result[i] = UserWithQuota{User: u, Balance: quota.Balance}
	}
	return result, nil
}

func (s *Service) SetUserQuota(ctx context.Context, userID uint, balance float64) (model.UserQuota, error) {
	var quota model.UserQuota
	result := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&quota)
	if result.Error != nil {
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return quota, result.Error
		}
		quota = model.UserQuota{UserID: userID, Balance: balance}
		if err := s.db.WithContext(ctx).Create(&quota).Error; err != nil {
			return quota, err
		}
		return quota, nil
	}
	quota.Balance = balance
	if err := s.db.WithContext(ctx).Save(&quota).Error; err != nil {
		return quota, err
	}
	return quota, nil
}

func (s *Service) ListUsageLogs(ctx context.Context, filter UsageLogFilter) (UsageLogPage, error) {
	q := s.db.WithContext(ctx).Model(&model.UsageLog{}).Preload("User").Preload("AIModelConfig")
	if filter.UserID != "" {
		q = q.Where("user_id = ?", filter.UserID)
	}
	if filter.ModelConfigID != "" {
		q = q.Where("ai_model_config_id = ?", filter.ModelConfigID)
	}
	if filter.ProviderID != "" {
		q = q.Joins("JOIN ai_model_configs ON ai_model_configs.id = usage_logs.ai_model_config_id").
			Where("ai_model_configs.credential_id = ?", filter.ProviderID)
	}
	if filter.Start != "" {
		q = q.Where("usage_logs.created_at >= ?", filter.Start)
	}
	if filter.End != "" {
		q = q.Where("usage_logs.created_at <= ?", filter.End)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return UsageLogPage{}, err
	}

	logs := make([]model.UsageLog, 0)
	offset := (filter.Page - 1) * filter.PageSize
	if err := q.Order("usage_logs.created_at DESC").Limit(filter.PageSize).Offset(offset).Find(&logs).Error; err != nil {
		return UsageLogPage{}, err
	}
	return UsageLogPage{Total: total, Items: logs, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (s *Service) GetMyQuota(ctx context.Context, userID uint) (MyQuotaSummary, error) {
	var quota model.UserQuota
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&quota).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return MyQuotaSummary{}, err
	}

	var totalCost float64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= date_trunc('month', now())", userID).
		Select("COALESCE(SUM(cost), 0)").Scan(&totalCost).Error; err != nil {
		return MyQuotaSummary{}, err
	}

	var totalTokens int64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= date_trunc('month', now())", userID).
		Select("COALESCE(SUM(input_tokens + output_tokens), 0)").Scan(&totalTokens).Error; err != nil {
		return MyQuotaSummary{}, err
	}

	return MyQuotaSummary{
		Balance:              quota.Balance,
		TotalCostThisMonth:   totalCost,
		TotalTokensThisMonth: totalTokens,
	}, nil
}

func (s *Service) GetMyUsageLogs(ctx context.Context, userID uint, page, pageSize int) (MyUsageLogPage, error) {
	var total int64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return MyUsageLogPage{}, err
	}

	logs := make([]model.UsageLog, 0)
	offset := (page - 1) * pageSize
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).
		Preload("AIModelConfig").
		Order("created_at DESC").
		Limit(pageSize).Offset(offset).
		Find(&logs).Error; err != nil {
		return MyUsageLogPage{}, err
	}
	return MyUsageLogPage{Total: total, Items: logs}, nil
}

func (s *Service) applyMaskedKeys(cred *model.AICredential) {
	if cred.EncryptedKey != "" {
		if plain, err := crypto.Decrypt(cred.EncryptedKey, s.encryptionKey); err == nil {
			cred.MaskedKey = crypto.MaskKey(plain)
		}
	}
	if cred.FilesAPIEncryptedKey != "" {
		if plain, err := crypto.Decrypt(cred.FilesAPIEncryptedKey, s.encryptionKey); err == nil {
			cred.FilesAPIMaskedKey = crypto.MaskKey(plain)
		}
	}
}

func splitKlingCredential(key string) [2]string {
	for i, c := range key {
		if c == ':' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}
