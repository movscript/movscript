package aiadmin

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

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

func (s *Service) ListRemoteModels(ctx context.Context, credentialID string) ([]string, error) {
	cred, err := s.GetCredential(ctx, credentialID)
	if err != nil {
		return nil, err
	}
	provider, err := s.registry.BuildForCredential(cred)
	if err != nil {
		return nil, err
	}
	type modelFetcher interface {
		FetchModels(ctx context.Context) ([]string, error)
	}
	fetcher, ok := provider.(modelFetcher)
	if !ok {
		return nil, errors.New("this provider does not support model listing")
	}
	return fetcher.FetchModels(ctx)
}

func (s *Service) TestCredential(ctx context.Context, credentialID string) (TestResult, error) {
	cred, err := s.GetCredential(ctx, credentialID)
	if err != nil {
		return TestResult{}, err
	}
	provider, err := s.registry.BuildForCredential(cred)
	if err != nil {
		return TestResult{Success: false, Message: err.Error()}, nil
	}
	start := time.Now()
	if err := provider.Ping(ctx); err != nil {
		return TestResult{Success: false, Message: err.Error(), LatencyMs: time.Since(start).Milliseconds()}, nil
	}
	return TestResult{Success: true, Message: "连接正常", LatencyMs: time.Since(start).Milliseconds()}, nil
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
