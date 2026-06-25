package ai

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	infraai "github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type CreateProviderInput struct {
	ProviderID         string            `json:"provider_id"`
	ProviderType       string            `json:"provider_type"`
	Profile            string            `json:"profile"`
	ProviderKind       string            `json:"provider_kind"`
	DisplayName        string            `json:"display_name"`
	BaseURLPrefix      string            `json:"base_url_prefix"`
	Credentials        map[string]string `json:"credentials"`
	FilesAPIEnabled    bool              `json:"files_api_enabled"`
	FilesAPIBaseURL    string            `json:"files_api_base_url"`
	FilesAPIKey        string            `json:"files_api_key"`
	RequireTestSuccess bool              `json:"require_test_success"`
}

type CreateProviderCredentialInput struct {
	CredentialKey      string            `json:"credential_key"`
	Credentials        map[string]string `json:"credentials"`
	FilesAPIEnabled    bool              `json:"files_api_enabled"`
	FilesAPIBaseURL    string            `json:"files_api_base_url"`
	FilesAPIKey        string            `json:"files_api_key"`
	RequireTestSuccess bool              `json:"require_test_success"`
}

type UpdateProviderCredentialInput struct {
	Status string `json:"status"`
}

type ProviderAssetLibrarySettingsInput struct {
	ArkOpenAPIBaseURL  string                                           `json:"ark_openapi_base_url,omitempty"`
	ArkRegion          string                                           `json:"ark_region,omitempty"`
	ArkAccessKeyID     string                                           `json:"ark_access_key_id,omitempty"`
	ArkSecretAccessKey string                                           `json:"ark_secret_access_key,omitempty"`
	ArkAssetGroups     map[string]adminsettings.ProviderAssetGroupState `json:"ark_asset_groups,omitempty"`
}

type ProviderAssetLibrarySettings struct {
	ArkOpenAPIBaseURL  string                                           `json:"ark_openapi_base_url,omitempty"`
	ArkRegion          string                                           `json:"ark_region,omitempty"`
	ArkAccessKeyID     string                                           `json:"ark_access_key_id,omitempty"`
	ArkSecretAccessKey string                                           `json:"ark_secret_access_key,omitempty"`
	ArkSecretKeySet    bool                                             `json:"ark_secret_key_set"`
	ArkAssetGroups     map[string]adminsettings.ProviderAssetGroupState `json:"ark_asset_groups,omitempty"`
}

type providerAssetLibraryConfig struct {
	Schema             string                                           `json:"schema,omitempty"`
	ArkOpenAPIBaseURL  string                                           `json:"ark_openapi_base_url,omitempty"`
	ArkRegion          string                                           `json:"ark_region,omitempty"`
	ArkAccessKeyID     string                                           `json:"ark_access_key_id,omitempty"`
	ArkSecretAccessKey string                                           `json:"ark_secret_access_key,omitempty"`
	ArkAssetGroups     map[string]adminsettings.ProviderAssetGroupState `json:"ark_asset_groups,omitempty"`
}

type providerAssetLibraryCredentialPlainConfig struct {
	ArkOpenAPIBaseURL string `json:"ark_openapi_base_url,omitempty"`
	ArkRegion         string `json:"ark_region,omitempty"`
	ArkAccessKeyID    string `json:"ark_access_key_id,omitempty"`
}

type providerAssetLibraryCredentialSecrets struct {
	ArkSecretAccessKey string `json:"ark_secret_access_key,omitempty"`
}

const (
	providerAssetLibraryConfigSchema     = "movscript.provider_asset_library_config.v1"
	providerAssetLibraryCredentialKey    = "asset-library-openapi"
	providerAssetLibraryCredentialKind   = "ark_openapi"
	providerAssetLibraryCredentialSchema = "movscript.provider_asset_library_credential.v1"
)

func (s *Service) ListProviderTemplates(ctx context.Context) []infraai.ProviderTemplate {
	_ = ctx
	return infraai.ProviderTemplates()
}

func (s *Service) ListComboTemplates(ctx context.Context) []infraai.ComboTemplate {
	_ = ctx
	return infraai.ComboTemplates()
}

func (s *Service) ListProviders(ctx context.Context) ([]persistencemodel.AIProvider, error) {
	if !s.providerMirrorTablesReady() {
		return []persistencemodel.AIProvider{}, nil
	}
	if err := s.syncProvidersFromLegacyCredentials(ctx); err != nil {
		return nil, err
	}
	var providers []persistencemodel.AIProvider
	if err := s.db.WithContext(ctx).
		Preload("Credentials", "deleted_at IS NULL").
		Order("provider_kind ASC, display_name ASC, provider_id ASC").
		Find(&providers).Error; err != nil {
		return nil, err
	}
	s.enrichProviderRuntimeStates(ctx, providers)
	return providers, nil
}

func (s *Service) enrichProviderRuntimeStates(ctx context.Context, providers []persistencemodel.AIProvider) {
	deploymentSettings, deploymentSettingsErr := s.providerAssetSettingsForDiagnostics(ctx)
	for i := range providers {
		template, ok := providerTemplateByKind(providers[i].ProviderKind)
		assetSettings, assetSettingsErr := s.providerAssetLibrarySettingsFromProvider(ctx, providers[i], false)
		assetSettingsSource := "provider"
		if assetSettingsErr == nil && !providerAssetLibraryCredentialsConfigured(assetSettings) && deploymentSettingsErr == nil && deploymentProviderAssetCredentialsConfigured(deploymentSettings) {
			assetSettings = providerAssetLibrarySettingsFromDeployment(deploymentSettings)
			assetSettingsSource = "admin_settings"
		} else if assetSettingsErr == nil && !providerAssetLibraryCredentialsConfigured(assetSettings) {
			assetSettingsSource = "missing"
		}
		if assetSettingsErr == nil && deploymentSettingsErr != nil {
			assetSettingsErr = deploymentSettingsErr
		}
		providers[i].AssetLibraryStateJSON = marshalProviderStateJSON(providerAssetLibraryState(providers[i], template, ok, assetSettings, assetSettingsSource, deploymentSettings, firstErr(assetSettingsErr, deploymentSettingsErr)))
		providers[i].TrustedResourceStateJSON = marshalProviderStateJSON(providerTrustedResourceState(providers[i], template, ok))
	}
}

func (s *Service) providerAssetSettingsForDiagnostics(ctx context.Context) (adminsettings.ProviderAssetSettings, error) {
	if !s.db.Migrator().HasTable(&persistencemodel.AdminSetting{}) {
		return adminsettings.DefaultProviderAssetSettings(), fmt.Errorf("admin settings table is not migrated")
	}
	encryptionKeyHex := ""
	if len(s.encryptionKey) > 0 {
		encryptionKeyHex = hex.EncodeToString(s.encryptionKey)
	}
	return adminsettings.NewService(s.db, encryptionKeyHex).PublicProviderAssetSettings(ctx)
}

func firstErr(values ...error) error {
	for _, err := range values {
		if err != nil {
			return err
		}
	}
	return nil
}

func providerAssetLibrarySettingsFromDeployment(settings adminsettings.ProviderAssetSettings) ProviderAssetLibrarySettings {
	return ProviderAssetLibrarySettings{
		ArkOpenAPIBaseURL: normalizeProviderAssetOpenAPIBaseURL(settings.ArkOpenAPIBaseURL),
		ArkRegion:         normalizeProviderAssetArkRegion(settings.ArkRegion),
		ArkAccessKeyID:    strings.TrimSpace(settings.ArkAccessKeyID),
		ArkSecretKeySet:   settings.ArkSecretKeySet,
		ArkAssetGroups:    normalizeProviderAssetGroups(settings.ArkAssetGroups),
	}
}

func providerAssetLibraryCredentialsConfigured(settings ProviderAssetLibrarySettings) bool {
	return strings.TrimSpace(settings.ArkAccessKeyID) != "" && settings.ArkSecretKeySet
}

func deploymentProviderAssetCredentialsConfigured(settings adminsettings.ProviderAssetSettings) bool {
	return strings.TrimSpace(settings.ArkAccessKeyID) != "" && settings.ArkSecretKeySet
}

func (s *Service) providerAssetLibrarySettingsFromProvider(ctx context.Context, provider persistencemodel.AIProvider, includeSecret bool) (ProviderAssetLibrarySettings, error) {
	config := providerAssetLibraryConfig{}
	raw := strings.TrimSpace(provider.AssetLibraryStateJSON)
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &config); err != nil {
			return ProviderAssetLibrarySettings{}, fmt.Errorf("%w: provider asset library state is invalid", ErrInvalidProviderConfig)
		}
	}
	secret := strings.TrimSpace(config.ArkSecretAccessKey)
	if secret != "" && len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(secret, s.encryptionKey); err == nil {
			secret = plain
		}
	}
	settings := ProviderAssetLibrarySettings{
		ArkOpenAPIBaseURL:  normalizeProviderAssetOpenAPIBaseURL(config.ArkOpenAPIBaseURL),
		ArkRegion:          normalizeProviderAssetArkRegion(config.ArkRegion),
		ArkAccessKeyID:     strings.TrimSpace(config.ArkAccessKeyID),
		ArkSecretAccessKey: secret,
		ArkSecretKeySet:    secret != "",
		ArkAssetGroups:     normalizeProviderAssetGroups(config.ArkAssetGroups),
	}
	credential, ok, err := s.providerAssetLibraryCredential(ctx, provider.ProviderID)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	if ok && credential.Status == persistencemodel.AIProviderCredentialStatusActive {
		var plain providerAssetLibraryCredentialPlainConfig
		if err := json.Unmarshal([]byte(credential.PlainConfigJSON), &plain); err != nil {
			return ProviderAssetLibrarySettings{}, fmt.Errorf("%w: provider asset library credential config is invalid", ErrInvalidProviderConfig)
		}
		var secrets providerAssetLibraryCredentialSecrets
		if err := json.Unmarshal([]byte(credential.EncryptedSecretsJSON), &secrets); err != nil {
			return ProviderAssetLibrarySettings{}, fmt.Errorf("%w: provider asset library credential secrets are invalid", ErrInvalidProviderConfig)
		}
		credentialSecret := strings.TrimSpace(secrets.ArkSecretAccessKey)
		if credentialSecret != "" && len(s.encryptionKey) > 0 {
			if plainSecret, err := crypto.Decrypt(credentialSecret, s.encryptionKey); err == nil {
				credentialSecret = plainSecret
			}
		}
		settings.ArkOpenAPIBaseURL = normalizeProviderAssetOpenAPIBaseURL(plain.ArkOpenAPIBaseURL)
		settings.ArkRegion = normalizeProviderAssetArkRegion(plain.ArkRegion)
		settings.ArkAccessKeyID = strings.TrimSpace(plain.ArkAccessKeyID)
		settings.ArkSecretAccessKey = credentialSecret
		settings.ArkSecretKeySet = credentialSecret != ""
	}
	if !includeSecret {
		settings.ArkSecretAccessKey = ""
	}
	return settings, nil
}

func (s *Service) saveProviderAssetLibrarySettings(ctx context.Context, providerID string, settings ProviderAssetLibrarySettings) error {
	config := providerAssetLibraryConfig{
		Schema:         providerAssetLibraryConfigSchema,
		ArkAssetGroups: normalizeProviderAssetGroups(settings.ArkAssetGroups),
	}
	raw, err := json.Marshal(config)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&persistencemodel.AIProvider{}).
			Where("provider_id = ?", strings.TrimSpace(providerID)).
			Update("asset_library_state_json", string(raw)).Error; err != nil {
			return err
		}
		return s.saveProviderAssetLibraryCredential(ctx, tx, providerID, settings)
	})
}

func (s *Service) providerAssetLibraryCredential(ctx context.Context, providerID string) (persistencemodel.AIProviderCredential, bool, error) {
	var credential persistencemodel.AIProviderCredential
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIProviderCredential{}) {
		return credential, false, nil
	}
	if err := s.db.WithContext(ctx).
		Where("provider_id = ? AND credential_key = ?", strings.TrimSpace(providerID), providerAssetLibraryCredentialKey).
		First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return credential, false, nil
		}
		return credential, false, err
	}
	return credential, true, nil
}

func (s *Service) saveProviderAssetLibraryCredential(ctx context.Context, tx *gorm.DB, providerID string, settings ProviderAssetLibrarySettings) error {
	secret := strings.TrimSpace(settings.ArkSecretAccessKey)
	encryptedSecret := secret
	if encryptedSecret != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(encryptedSecret, s.encryptionKey)
		if err != nil {
			return err
		}
		encryptedSecret = encrypted
	}
	plainConfig := providerAssetLibraryCredentialPlainConfig{
		ArkOpenAPIBaseURL: normalizeProviderAssetOpenAPIBaseURL(settings.ArkOpenAPIBaseURL),
		ArkRegion:         normalizeProviderAssetArkRegion(settings.ArkRegion),
		ArkAccessKeyID:    strings.TrimSpace(settings.ArkAccessKeyID),
	}
	providerCredential := persistencemodel.AIProviderCredential{
		ProviderID:           strings.TrimSpace(providerID),
		CredentialKey:        providerAssetLibraryCredentialKey,
		CredentialKind:       providerAssetLibraryCredentialKind,
		SchemaVersion:        providerAssetLibraryCredentialSchema,
		EncryptedSecretsJSON: compactJSON(providerAssetLibraryCredentialSecrets{ArkSecretAccessKey: encryptedSecret}),
		MaskedSecretsJSON:    compactJSON(providerAssetLibraryCredentialSecrets{ArkSecretAccessKey: crypto.MaskKey(secret)}),
		PlainConfigJSON:      compactJSON(plainConfig),
		Status:               persistencemodel.AIProviderCredentialStatusActive,
		IsPrimary:            false,
		Priority:             100,
		HealthJSON:           "{}",
	}
	var existing persistencemodel.AIProviderCredential
	return tx.WithContext(ctx).
		Where("provider_id = ? AND credential_key = ?", providerCredential.ProviderID, providerCredential.CredentialKey).
		Assign(providerCredential).
		FirstOrCreate(&existing).Error
}

func normalizeProviderAssetOpenAPIBaseURL(value string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(value), "/")
	if baseURL == "" {
		return "https://ark.cn-beijing.volcengineapi.com"
	}
	return baseURL
}

func normalizeProviderAssetArkRegion(value string) string {
	region := strings.TrimSpace(value)
	if region == "" {
		return "cn-beijing"
	}
	return region
}

func normalizeProviderAssetGroups(value map[string]adminsettings.ProviderAssetGroupState) map[string]adminsettings.ProviderAssetGroupState {
	if len(value) == 0 {
		return nil
	}
	out := make(map[string]adminsettings.ProviderAssetGroupState, len(value))
	for scope, group := range value {
		scope = normalizeProviderAssetGroupScope(scope)
		group.ID = strings.TrimSpace(group.ID)
		if group.ID == "" {
			continue
		}
		group.Name = strings.TrimSpace(group.Name)
		group.Scope = scope
		group.ProjectName = strings.TrimSpace(group.ProjectName)
		group.SettingID = strings.TrimSpace(group.SettingID)
		group.CreatedAt = strings.TrimSpace(group.CreatedAt)
		group.UpdatedAt = strings.TrimSpace(group.UpdatedAt)
		out[scope] = group
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeProviderAssetGroupScope(scope string) string {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return "global"
	}
	return scope
}

func validateProviderAssetLibrarySettings(settings ProviderAssetLibrarySettings) error {
	if !isValidHTTPProviderURL(settings.ArkOpenAPIBaseURL) {
		return ErrInvalidProviderConfig
	}
	if strings.TrimSpace(settings.ArkAccessKeyID) == "" || strings.TrimSpace(settings.ArkSecretAccessKey) == "" {
		return ErrInvalidProviderConfig
	}
	return nil
}

func validateProviderSupportsAssetLibrary(provider persistencemodel.AIProvider) error {
	template, ok := providerTemplateByKind(provider.ProviderKind)
	if !ok || !boolProviderTemplateValue(template.Capabilities, "asset_library") {
		return fmt.Errorf("%w: provider %q does not support asset library", ErrInvalidProviderConfig, provider.ProviderID)
	}
	return nil
}

func isValidHTTPProviderURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}

func (s *Service) GetProviderAssetLibrarySettings(ctx context.Context, providerID string) (ProviderAssetLibrarySettings, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	return s.providerAssetLibrarySettingsFromProvider(ctx, provider, false)
}

func (s *Service) GetProviderAssetLibrarySettingsWithSecret(ctx context.Context, providerID string) (ProviderAssetLibrarySettings, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	return s.providerAssetLibrarySettingsFromProvider(ctx, provider, true)
}

func (s *Service) UpdateProviderAssetLibrarySettings(ctx context.Context, providerID string, input ProviderAssetLibrarySettingsInput) (ProviderAssetLibrarySettings, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	if err := validateProviderSupportsAssetLibrary(provider); err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	current, err := s.providerAssetLibrarySettingsFromProvider(ctx, provider, true)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	next := ProviderAssetLibrarySettings{
		ArkOpenAPIBaseURL:  normalizeProviderAssetOpenAPIBaseURL(input.ArkOpenAPIBaseURL),
		ArkRegion:          normalizeProviderAssetArkRegion(input.ArkRegion),
		ArkAccessKeyID:     strings.TrimSpace(input.ArkAccessKeyID),
		ArkSecretAccessKey: strings.TrimSpace(input.ArkSecretAccessKey),
		ArkAssetGroups:     normalizeProviderAssetGroups(current.ArkAssetGroups),
	}
	if next.ArkOpenAPIBaseURL == "" {
		next.ArkOpenAPIBaseURL = current.ArkOpenAPIBaseURL
	}
	if next.ArkRegion == "" {
		next.ArkRegion = current.ArkRegion
	}
	if next.ArkSecretAccessKey == "" {
		next.ArkSecretAccessKey = current.ArkSecretAccessKey
	}
	if input.ArkAssetGroups != nil {
		next.ArkAssetGroups = normalizeProviderAssetGroups(input.ArkAssetGroups)
	}
	if err := validateProviderAssetLibrarySettings(next); err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	if err := s.saveProviderAssetLibrarySettings(ctx, provider.ProviderID, next); err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	next.ArkSecretKeySet = strings.TrimSpace(next.ArkSecretAccessKey) != ""
	next.ArkSecretAccessKey = ""
	return next, nil
}

func (s *Service) UpsertProviderAssetLibraryGroup(ctx context.Context, providerID string, scope string, group adminsettings.ProviderAssetGroupState) (ProviderAssetLibrarySettings, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	settings, err := s.providerAssetLibrarySettingsFromProvider(ctx, provider, true)
	if err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	scope = normalizeProviderAssetGroupScope(scope)
	group.ID = strings.TrimSpace(group.ID)
	if group.ID == "" {
		return ProviderAssetLibrarySettings{}, ErrInvalidProviderConfig
	}
	group.Scope = scope
	group.Name = strings.TrimSpace(group.Name)
	group.ProjectName = strings.TrimSpace(group.ProjectName)
	group.SettingID = strings.TrimSpace(group.SettingID)
	now := time.Now().UTC().Format(time.RFC3339)
	if settings.ArkAssetGroups == nil {
		settings.ArkAssetGroups = map[string]adminsettings.ProviderAssetGroupState{}
	}
	if group.CreatedAt == "" {
		if existing, ok := settings.ArkAssetGroups[scope]; ok {
			group.CreatedAt = existing.CreatedAt
		}
	}
	if group.CreatedAt == "" {
		group.CreatedAt = now
	}
	group.UpdatedAt = now
	settings.ArkAssetGroups[scope] = group
	if err := s.saveProviderAssetLibrarySettings(ctx, provider.ProviderID, settings); err != nil {
		return ProviderAssetLibrarySettings{}, err
	}
	settings.ArkSecretKeySet = strings.TrimSpace(settings.ArkSecretAccessKey) != ""
	settings.ArkSecretAccessKey = ""
	return settings, nil
}

func (s *Service) CreateProvider(ctx context.Context, input CreateProviderInput) (persistencemodel.AIProvider, error) {
	if !s.providerMirrorTablesReady() {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: provider tables are not migrated", ErrInvalidProviderConfig)
	}
	if s.registry == nil {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: provider registry is not configured", ErrInvalidProviderConfig)
	}
	template, ok := providerTemplateForCreate(input)
	if !ok {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: unknown provider template %q", ErrInvalidProviderConfig, providerTemplateInputLabel(input))
	}
	defaultAdapterType := defaultAdapterTypeForProviderTemplate(template)
	adapterDef := infraai.GetAdapterDef(defaultAdapterType)
	if adapterDef == nil {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: provider kind %q references unknown adapter %q", ErrInvalidProviderConfig, template.ProviderKind, defaultAdapterType)
	}
	credentials := cloneStringMap(input.Credentials)
	baseURL := strings.TrimSpace(input.BaseURLPrefix)
	if baseURL == "" {
		baseURL = strings.TrimSpace(credentials["base_url"])
	}
	if baseURL == "" {
		baseURL = strings.TrimSpace(template.DefaultBaseURLPrefix)
	}
	if baseURL == "" && adapterHasBaseURLField(adapterDef) {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: base_url_prefix is required for provider kind %q", ErrInvalidProviderConfig, template.ProviderKind)
	}
	if baseURL != "" {
		credentials["base_url"] = baseURL
	}
	for _, field := range adapterDef.CredFields {
		if field.Required && strings.TrimSpace(credentials[field.Key]) == "" {
			return persistencemodel.AIProvider{}, fmt.Errorf("%w: missing required credential %q", ErrInvalidProviderConfig, field.Key)
		}
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = template.DisplayName
	}
	providerID := strings.TrimSpace(input.ProviderID)
	if providerID != "" {
		if err := s.validateProviderIDForCreate(ctx, providerID); err != nil {
			return persistencemodel.AIProvider{}, err
		}
	}
	credential, err := s.createCredential(ctx, CreateCredentialInput{
		AdapterType:        defaultAdapterType,
		DisplayName:        displayName,
		Credentials:        credentials,
		FilesAPIEnabled:    input.FilesAPIEnabled,
		FilesAPIBaseURL:    strings.TrimSpace(input.FilesAPIBaseURL),
		FilesAPIKey:        input.FilesAPIKey,
		RequireTestSuccess: input.RequireTestSuccess,
	}, false)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	if providerID == "" {
		providerID = providerIDForCreatedProvider(template.ProviderKind, credential.ID)
	}
	credentialModel := credential.ToModel()
	if err := s.syncProviderFromLegacyCredentialWithProviderID(ctx, providerID, credentialModel, &template); err != nil {
		return persistencemodel.AIProvider{}, err
	}
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return persistencemodel.AIProvider{}, fmt.Errorf("%w: created provider was not found", ErrInvalidProviderConfig)
		}
		return persistencemodel.AIProvider{}, err
	}
	return provider, nil
}

func (s *Service) CreateProviderCredential(ctx context.Context, providerID string, input CreateProviderCredentialInput) (persistencemodel.AIProvider, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	adapterType := strings.TrimSpace(provider.DefaultAdapterType)
	if adapterType == "" {
		adapterType = strings.TrimSpace(provider.AdapterKey)
	}
	adapterDef := infraai.GetAdapterDef(adapterType)
	if adapterDef == nil {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: provider %q references unknown adapter %q", ErrInvalidProviderConfig, provider.ProviderID, adapterType)
	}
	credentials := cloneStringMap(input.Credentials)
	if strings.TrimSpace(provider.BaseURLPrefix) != "" {
		credentials["base_url"] = strings.TrimSpace(provider.BaseURLPrefix)
	}
	for _, field := range adapterDef.CredFields {
		if field.Required && strings.TrimSpace(credentials[field.Key]) == "" {
			return persistencemodel.AIProvider{}, fmt.Errorf("%w: missing required credential %q", ErrInvalidProviderConfig, field.Key)
		}
	}
	credentialKey := strings.TrimSpace(input.CredentialKey)
	if credentialKey != "" {
		if err := s.ensureProviderCredentialKeyAvailable(ctx, provider.ProviderID, credentialKey); err != nil {
			return persistencemodel.AIProvider{}, err
		}
	}
	legacyCredential, err := s.createCredential(ctx, CreateCredentialInput{
		AdapterType:        adapterType,
		DisplayName:        provider.DisplayName + " / " + firstNonEmpty(credentialKey, "rotated key"),
		Credentials:        credentials,
		FilesAPIEnabled:    input.FilesAPIEnabled,
		FilesAPIBaseURL:    strings.TrimSpace(input.FilesAPIBaseURL),
		FilesAPIKey:        input.FilesAPIKey,
		RequireTestSuccess: input.RequireTestSuccess,
	}, false)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	if credentialKey == "" {
		credentialKey = fmt.Sprintf("key-%d", legacyCredential.ID)
	}
	if err := s.ensureProviderCredentialKeyAvailable(ctx, provider.ProviderID, credentialKey); err != nil {
		return persistencemodel.AIProvider{}, err
	}
	isPrimary, err := s.providerHasActivePrimaryCredential(ctx, provider.ProviderID)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	providerCredential := providerCredentialFromLegacyCredential(provider.ProviderID, credentialKey, legacyCredential.ToModel(), persistencemodel.AIProviderCredentialStatusActive, !isPrimary)
	if err := s.db.WithContext(ctx).Create(&providerCredential).Error; err != nil {
		return persistencemodel.AIProvider{}, err
	}
	return s.getProviderByProviderID(ctx, provider.ProviderID)
}

func (s *Service) SetProviderCredentialPrimary(ctx context.Context, providerID string, credentialKey string) (persistencemodel.AIProvider, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	credentialKey = strings.TrimSpace(credentialKey)
	if credentialKey == "" {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: credential_key is required", ErrInvalidProviderConfig)
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var credential persistencemodel.AIProviderCredential
		if err := tx.Where("provider_id = ? AND credential_key = ?", provider.ProviderID, credentialKey).First(&credential).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if credential.Status != persistencemodel.AIProviderCredentialStatusActive {
			return fmt.Errorf("%w: credential %q is not active", ErrInvalidProviderConfig, credentialKey)
		}
		if err := tx.Model(&persistencemodel.AIProviderCredential{}).
			Where("provider_id = ?", provider.ProviderID).
			Update("is_primary", false).Error; err != nil {
			return err
		}
		if err := tx.Model(&persistencemodel.AIProviderCredential{}).
			Where("provider_id = ? AND credential_key = ?", provider.ProviderID, credentialKey).
			Update("is_primary", true).Error; err != nil {
			return err
		}
		return setLegacyCredentialEnabledFromProviderCredential(tx, credential, true)
	})
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	return s.getProviderByProviderID(ctx, provider.ProviderID)
}

func (s *Service) UpdateProviderCredential(ctx context.Context, providerID string, credentialKey string, input UpdateProviderCredentialInput) (persistencemodel.AIProvider, error) {
	provider, err := s.getProviderByProviderID(ctx, providerID)
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	status := strings.TrimSpace(input.Status)
	if !validProviderCredentialStatus(status) {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: unsupported credential status %q", ErrInvalidProviderConfig, status)
	}
	credentialKey = strings.TrimSpace(credentialKey)
	if credentialKey == "" {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: credential_key is required", ErrInvalidProviderConfig)
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var credential persistencemodel.AIProviderCredential
		if err := tx.Where("provider_id = ? AND credential_key = ?", provider.ProviderID, credentialKey).First(&credential).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		updates := map[string]any{"status": status}
		if status != persistencemodel.AIProviderCredentialStatusActive {
			updates["is_primary"] = false
		}
		if err := tx.Model(&persistencemodel.AIProviderCredential{}).
			Where("provider_id = ? AND credential_key = ?", provider.ProviderID, credentialKey).
			Updates(updates).Error; err != nil {
			return err
		}
		return setLegacyCredentialEnabledFromProviderCredential(tx, credential, status == persistencemodel.AIProviderCredentialStatusActive)
	})
	if err != nil {
		return persistencemodel.AIProvider{}, err
	}
	return s.getProviderByProviderID(ctx, provider.ProviderID)
}

func (s *Service) syncProvidersFromLegacyCredentials(ctx context.Context) error {
	if !s.providerMirrorTablesReady() || !s.db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		return nil
	}
	var credentials []persistencemodel.AICredential
	if err := s.db.WithContext(ctx).Unscoped().Find(&credentials).Error; err != nil {
		return err
	}
	for _, credential := range credentials {
		if err := s.syncProviderFromLegacyCredential(ctx, credential); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) syncProviderFromLegacyCredential(ctx context.Context, credential persistencemodel.AICredential) error {
	return s.syncProviderFromLegacyCredentialWithProviderID(ctx, legacyMirrorProviderIDForCredential(credential), credential, nil)
}

func (s *Service) syncProviderFromLegacyCredentialWithProviderID(ctx context.Context, providerID string, credential persistencemodel.AICredential, template *infraai.ProviderTemplate) error {
	if !s.providerMirrorTablesReady() || credential.ID == 0 {
		return nil
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return fmt.Errorf("%w: provider_id is required", ErrInvalidProviderConfig)
	}
	displayName := strings.TrimSpace(credential.DisplayName)
	if displayName == "" {
		displayName = providerID
	}
	providerType := providerTypeForCredential(credential)
	profile := providerProfileForCredential(credential)
	providerKind := providerKindForCredential(credential)
	providerCategory := providerCategoryForCredential(credential)
	adapterKey := strings.TrimSpace(credential.AdapterType)
	templateVersion := "builtin.v1"
	if template != nil {
		providerType = template.ProviderType
		profile = template.Profile
		providerKind = template.ProviderKind
		providerCategory = template.ProviderCategory
		adapterKey = defaultAdapterTypeForProviderTemplate(*template)
		templateVersion = template.Version
	}
	defaultAdapterType := adapterKey
	provider := persistencemodel.AIProvider{
		ProviderID:               providerID,
		ProviderType:             providerType,
		Profile:                  profile,
		ProviderKind:             providerKind,
		ProviderCategory:         providerCategory,
		DefaultAdapterType:       defaultAdapterType,
		AdapterKey:               adapterKey,
		TemplateVersion:          templateVersion,
		DisplayName:              displayName,
		OrgID:                    credential.OrgID,
		BaseURLPrefix:            strings.TrimSpace(credential.BaseURL),
		AssetLibraryStateJSON:    "{}",
		TrustedResourceStateJSON: "{}",
		HealthJSON:               "{}",
		IsEnabled:                credential.IsEnabled && !credential.DeletedAt.Valid,
	}
	var existingProvider persistencemodel.AIProvider
	if err := s.db.WithContext(ctx).
		Where("provider_id = ?", provider.ProviderID).
		Attrs(provider).
		FirstOrCreate(&existingProvider).Error; err != nil {
		return fmt.Errorf("sync provider %q: %w", provider.ProviderID, err)
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIProvider{}).
		Where("provider_id = ?", provider.ProviderID).
		Updates(map[string]any{
			"provider_type":        provider.ProviderType,
			"profile":              provider.Profile,
			"provider_kind":        provider.ProviderKind,
			"provider_category":    provider.ProviderCategory,
			"default_adapter_type": provider.DefaultAdapterType,
			"adapter_key":          provider.AdapterKey,
			"template_version":     provider.TemplateVersion,
			"display_name":         provider.DisplayName,
			"org_id":               provider.OrgID,
			"base_url_prefix":      provider.BaseURLPrefix,
			"is_enabled":           provider.IsEnabled,
		}).Error; err != nil {
		return fmt.Errorf("sync provider %q: %w", provider.ProviderID, err)
	}
	status := persistencemodel.AIProviderCredentialStatusActive
	if !provider.IsEnabled {
		status = persistencemodel.AIProviderCredentialStatusDisabled
	}
	providerCredential := persistencemodel.AIProviderCredential{
		ProviderID:           providerID,
		CredentialKey:        "primary",
		CredentialKind:       credentialKindForAdapter(credential.AdapterType),
		SchemaVersion:        "legacy.ai_credentials.v1",
		EncryptedSecretsJSON: legacyEncryptedSecretsJSON(credential),
		MaskedSecretsJSON:    legacyMaskedSecretsJSON(credential),
		PlainConfigJSON:      legacyPlainConfigJSON(credential),
		Status:               status,
		IsPrimary:            status == persistencemodel.AIProviderCredentialStatusActive,
		Priority:             0,
		HealthJSON:           "{}",
	}
	var existingCredential persistencemodel.AIProviderCredential
	if err := s.db.WithContext(ctx).Where("provider_id = ? AND credential_key = ?", providerCredential.ProviderID, providerCredential.CredentialKey).
		Assign(providerCredential).
		FirstOrCreate(&existingCredential).Error; err != nil {
		return fmt.Errorf("sync provider credential %q/%q: %w", providerCredential.ProviderID, providerCredential.CredentialKey, err)
	}
	return nil
}

func (s *Service) getProviderByProviderID(ctx context.Context, providerID string) (persistencemodel.AIProvider, error) {
	var provider persistencemodel.AIProvider
	if err := s.db.WithContext(ctx).
		Preload("Credentials", "deleted_at IS NULL").
		Where("provider_id = ?", strings.TrimSpace(providerID)).
		First(&provider).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return provider, ErrNotFound
		}
		return provider, err
	}
	return provider, nil
}

func (s *Service) validateProviderIDForCreate(ctx context.Context, providerID string) error {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return fmt.Errorf("%w: provider_id is required", ErrInvalidProviderConfig)
	}
	if providerID == persistencemodel.ModelRouteSourceNewAPI || strings.HasPrefix(providerID, persistencemodel.ModelRouteSourceLocalProvider+":") {
		return fmt.Errorf("%w: provider_id %q is reserved", ErrInvalidProviderConfig, providerID)
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIProvider{}).Where("provider_id = ?", providerID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: provider_id %q already exists", ErrInvalidProviderConfig, providerID)
	}
	return nil
}

func (s *Service) disableLegacyProviderCredential(ctx context.Context, credentialID uint) error {
	if !s.providerMirrorTablesReady() || credentialID == 0 {
		return nil
	}
	providerIDs, err := s.providerIDsForLegacyCredential(ctx, credentialID)
	if err != nil {
		return err
	}
	if len(providerIDs) == 0 {
		return nil
	}
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.AIProvider{}).
		Where("provider_id IN ?", providerIDs).
		Update("is_enabled", false).Error; err != nil {
		return fmt.Errorf("disable provider for legacy credential %d: %w", credentialID, err)
	}
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.AIProviderCredential{}).
		Where("provider_id IN ?", providerIDs).
		Updates(map[string]any{
			"status":     persistencemodel.AIProviderCredentialStatusDisabled,
			"is_primary": false,
		}).Error; err != nil {
		return fmt.Errorf("disable provider credential for legacy credential %d: %w", credentialID, err)
	}
	return nil
}

func (s *Service) providerIDsForLegacyCredential(ctx context.Context, credentialID uint) ([]string, error) {
	providerIDs := map[string]bool{
		legacyProviderIDForCredential(credentialID): true,
	}
	if !s.providerMirrorTablesReady() || credentialID == 0 {
		return mapKeys(providerIDs), nil
	}
	var credentials []persistencemodel.AIProviderCredential
	if err := s.db.WithContext(ctx).Find(&credentials).Error; err != nil {
		return nil, err
	}
	for _, credential := range credentials {
		var plainConfig struct {
			LegacyCredentialID uint `json:"legacy_credential_id"`
		}
		if err := json.Unmarshal([]byte(credential.PlainConfigJSON), &plainConfig); err != nil || plainConfig.LegacyCredentialID != credentialID {
			continue
		}
		providerID := strings.TrimSpace(credential.ProviderID)
		if providerID != "" {
			providerIDs[providerID] = true
		}
	}
	return mapKeys(providerIDs), nil
}

func (s *Service) preferredProviderIDForLegacyCredential(ctx context.Context, credentialID uint) string {
	providerIDs, err := s.providerIDsForLegacyCredential(ctx, credentialID)
	if err != nil {
		return ""
	}
	legacyProviderID := legacyProviderIDForCredential(credentialID)
	for _, providerID := range providerIDs {
		if providerID != legacyProviderID && !strings.HasPrefix(providerID, persistencemodel.ModelRouteSourceLocalProvider+":") {
			return providerID
		}
	}
	for _, providerID := range providerIDs {
		if providerID == legacyProviderID {
			return providerID
		}
	}
	return ""
}

func (s *Service) providerMirrorTablesReady() bool {
	return s != nil && s.db != nil &&
		s.db.Migrator().HasTable(&persistencemodel.AIProvider{}) &&
		s.db.Migrator().HasTable(&persistencemodel.AIProviderCredential{})
}

func (s *Service) ensureProviderCredentialKeyAvailable(ctx context.Context, providerID string, credentialKey string) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIProviderCredential{}).
		Where("provider_id = ? AND credential_key = ?", strings.TrimSpace(providerID), strings.TrimSpace(credentialKey)).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: provider credential key %q already exists", ErrInvalidProviderConfig, credentialKey)
	}
	return nil
}

func (s *Service) providerHasActivePrimaryCredential(ctx context.Context, providerID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIProviderCredential{}).
		Where("provider_id = ? AND status = ? AND is_primary = ?", strings.TrimSpace(providerID), persistencemodel.AIProviderCredentialStatusActive, true).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func providerCredentialFromLegacyCredential(providerID string, credentialKey string, credential persistencemodel.AICredential, status string, isPrimary bool) persistencemodel.AIProviderCredential {
	if status == "" {
		status = persistencemodel.AIProviderCredentialStatusActive
	}
	return persistencemodel.AIProviderCredential{
		ProviderID:           strings.TrimSpace(providerID),
		CredentialKey:        strings.TrimSpace(credentialKey),
		CredentialKind:       credentialKindForAdapter(credential.AdapterType),
		SchemaVersion:        "legacy.ai_credentials.v1",
		EncryptedSecretsJSON: legacyEncryptedSecretsJSON(credential),
		MaskedSecretsJSON:    legacyMaskedSecretsJSON(credential),
		PlainConfigJSON:      legacyPlainConfigJSON(credential),
		Status:               status,
		IsPrimary:            isPrimary && status == persistencemodel.AIProviderCredentialStatusActive,
		Priority:             0,
		HealthJSON:           "{}",
	}
}

func validProviderCredentialStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case persistencemodel.AIProviderCredentialStatusActive,
		persistencemodel.AIProviderCredentialStatusDisabled,
		persistencemodel.AIProviderCredentialStatusRevoked:
		return true
	default:
		return false
	}
}

func setLegacyCredentialEnabledFromProviderCredential(tx *gorm.DB, credential persistencemodel.AIProviderCredential, enabled bool) error {
	var plainConfig struct {
		LegacyCredentialID uint `json:"legacy_credential_id"`
	}
	if err := json.Unmarshal([]byte(credential.PlainConfigJSON), &plainConfig); err != nil {
		return fmt.Errorf("%w: provider credential config is invalid", ErrInvalidProviderConfig)
	}
	if plainConfig.LegacyCredentialID == 0 {
		return nil
	}
	return tx.Model(&persistencemodel.AICredential{}).
		Where("id = ?", plainConfig.LegacyCredentialID).
		Update("is_enabled", enabled).Error
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func providerAssetLibraryState(provider persistencemodel.AIProvider, template infraai.ProviderTemplate, templateFound bool, settings ProviderAssetLibrarySettings, settingsSource string, deploymentSettings adminsettings.ProviderAssetSettings, settingsErr error) map[string]any {
	supported := templateFound && boolProviderTemplateValue(template.Capabilities, "asset_library")
	assetTypes := stringSliceProviderTemplateValue(template.AssetLibraryCapabilities, "asset_types")
	groupScopes := stringSliceProviderTemplateValue(template.AssetLibraryCapabilities, "group_scopes")
	autoCreateGroups := supported && boolProviderTemplateValue(template.AssetLibraryCapabilities, "auto_create_groups")
	diagnostics := []map[string]any{}
	if !templateFound {
		diagnostics = append(diagnostics, providerStateDiagnostic("provider_template_missing", "error", "Provider kind is not declared by the backend template registry."))
	} else if !supported {
		diagnostics = append(diagnostics, providerStateDiagnostic("provider_asset_library_unsupported", "info", "This provider does not declare asset library capability. RawResource will not be mapped to asset://."))
	}
	settingsSummary := map[string]any{
		"ark_openapi_base_url":    strings.TrimSpace(settings.ArkOpenAPIBaseURL),
		"ark_region":              strings.TrimSpace(settings.ArkRegion),
		"public_base_url_set":     strings.TrimSpace(deploymentSettings.PublicBaseURL) != "",
		"signing_secret_set":      deploymentSettings.SigningSecretSet,
		"ark_access_key_id":       strings.TrimSpace(settings.ArkAccessKeyID),
		"ark_access_key_id_set":   strings.TrimSpace(settings.ArkAccessKeyID) != "",
		"ark_secret_key_set":      settings.ArkSecretKeySet,
		"ark_credentials_source":  strings.TrimSpace(settingsSource),
		"ark_asset_group_count":   len(settings.ArkAssetGroups),
		"loaded_from_admin_state": settingsErr == nil,
		"loaded_from_provider":    settingsErr == nil && settingsSource == "provider",
	}
	if supported {
		if settingsErr != nil {
			diagnostics = append(diagnostics, providerStateDiagnostic("provider_asset_settings_unavailable", "warning", settingsErr.Error()))
		} else if settingsSource == "admin_settings" {
			diagnostics = append(diagnostics, providerStateDiagnostic("provider_asset_credentials_using_global_fallback", "warning", "Ark OpenAPI credentials are still loaded from deployment settings; move them into this Provider's asset library credential."))
		}
		if strings.TrimSpace(deploymentSettings.PublicBaseURL) == "" {
			diagnostics = append(diagnostics, providerStateDiagnostic("missing_public_base_url", "warning", "Local RawResource files need a public backend URL before they can be uploaded to the provider asset library."))
		}
		if !deploymentSettings.SigningSecretSet {
			diagnostics = append(diagnostics, providerStateDiagnostic("missing_signing_secret", "warning", "Temporary RawResource URLs cannot be signed until a signing secret is configured."))
		}
		if strings.TrimSpace(settings.ArkAccessKeyID) == "" {
			diagnostics = append(diagnostics, providerStateDiagnostic("missing_ark_access_key_id", "error", "Ark OpenAPI access key is required for asset group and asset registration."))
		}
		if !settings.ArkSecretKeySet {
			diagnostics = append(diagnostics, providerStateDiagnostic("missing_ark_secret_access_key", "error", "Ark OpenAPI secret key is required for asset group and asset registration."))
		}
	}
	globalGroup, globalGroupConfigured := providerAssetGroupSummary(settings.ArkAssetGroups["global"])
	return map[string]any{
		"schema":                  "movscript.provider_asset_library_state.v1",
		"provider_id":             provider.ProviderID,
		"provider_kind":           provider.ProviderKind,
		"provider_category":       provider.ProviderCategory,
		"supports_asset_library":  supported,
		"asset_types":             assetTypes,
		"auto_create_groups":      autoCreateGroups,
		"group_scopes":            groupScopes,
		"global_group":            globalGroup,
		"global_group_configured": globalGroupConfigured,
		"settings":                settingsSummary,
		"diagnostics":             diagnostics,
		"source":                  "backend_provider_runtime_state",
	}
}

func providerTrustedResourceState(provider persistencemodel.AIProvider, template infraai.ProviderTemplate, templateFound bool) map[string]any {
	policy := cloneAnyMap(template.GeneratedArtifactTrustPolicy)
	supported := templateFound && (boolProviderTemplateValue(template.Capabilities, "generated_artifact_trust") || len(policy) > 0)
	diagnostics := []map[string]any{}
	if !templateFound {
		diagnostics = append(diagnostics, providerStateDiagnostic("provider_template_missing", "error", "Provider kind is not declared by the backend template registry."))
	} else if !supported {
		diagnostics = append(diagnostics, providerStateDiagnostic("generated_artifact_trust_unsupported", "info", "This provider does not declare original generated artifact trust."))
	}
	return map[string]any{
		"schema":                            "movscript.provider_trusted_resource_state.v1",
		"provider_id":                       provider.ProviderID,
		"provider_kind":                     provider.ProviderKind,
		"provider_category":                 provider.ProviderCategory,
		"supports_generated_artifact_trust": supported,
		"policy":                            policy,
		"scope":                             stringProviderTemplateValue(policy, "scope"),
		"requires_original_artifact":        boolProviderTemplateValue(policy, "requires_original_artifact"),
		"trusted_model_families":            stringSliceProviderTemplateValue(policy, "trusted_model_families"),
		"diagnostics":                       diagnostics,
		"source":                            "backend_provider_runtime_state",
	}
}

func providerAssetGroupSummary(group adminsettings.ProviderAssetGroupState) (map[string]any, bool) {
	configured := strings.TrimSpace(group.ID) != ""
	return map[string]any{
		"configured":   configured,
		"id":           strings.TrimSpace(group.ID),
		"name":         strings.TrimSpace(group.Name),
		"scope":        strings.TrimSpace(group.Scope),
		"project_name": strings.TrimSpace(group.ProjectName),
		"setting_id":   strings.TrimSpace(group.SettingID),
		"created_at":   strings.TrimSpace(group.CreatedAt),
		"updated_at":   strings.TrimSpace(group.UpdatedAt),
	}, configured
}

func providerStateDiagnostic(code string, severity string, message string) map[string]any {
	return map[string]any{
		"code":     code,
		"severity": severity,
		"message":  message,
	}
}

func marshalProviderStateJSON(state map[string]any) string {
	raw, err := json.Marshal(state)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func boolProviderTemplateValue(values map[string]any, key string) bool {
	if values == nil {
		return false
	}
	switch value := values[key].(type) {
	case bool:
		return value
	case string:
		return strings.EqualFold(strings.TrimSpace(value), "true")
	default:
		return false
	}
}

func stringProviderTemplateValue(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, _ := values[key].(string)
	return strings.TrimSpace(value)
}

func stringSliceProviderTemplateValue(values map[string]any, key string) []string {
	if values == nil {
		return []string{}
	}
	switch raw := values[key].(type) {
	case []string:
		out := make([]string, 0, len(raw))
		for _, value := range raw {
			if value = strings.TrimSpace(value); value != "" {
				out = append(out, value)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(raw))
		for _, item := range raw {
			if value, ok := item.(string); ok {
				if value = strings.TrimSpace(value); value != "" {
					out = append(out, value)
				}
			}
		}
		return out
	default:
		return []string{}
	}
}

func cloneAnyMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func providerTemplateByKind(providerKind string) (infraai.ProviderTemplate, bool) {
	providerKind = strings.TrimSpace(providerKind)
	for _, template := range infraai.ProviderTemplates() {
		if template.ProviderKind == providerKind {
			return template, true
		}
	}
	return infraai.ProviderTemplate{}, false
}

func providerTemplateByTypeProfile(providerType, profile string) (infraai.ProviderTemplate, bool) {
	providerType = strings.TrimSpace(providerType)
	profile = strings.TrimSpace(profile)
	for _, template := range infraai.ProviderTemplates() {
		if strings.TrimSpace(template.ProviderType) == providerType && strings.TrimSpace(template.Profile) == profile {
			return template, true
		}
	}
	return infraai.ProviderTemplate{}, false
}

func providerTemplateForCreate(input CreateProviderInput) (infraai.ProviderTemplate, bool) {
	if strings.TrimSpace(input.ProviderType) != "" || strings.TrimSpace(input.Profile) != "" {
		return providerTemplateByTypeProfile(input.ProviderType, input.Profile)
	}
	return providerTemplateByKind(input.ProviderKind)
}

func providerTemplateInputLabel(input CreateProviderInput) string {
	if strings.TrimSpace(input.ProviderType) != "" || strings.TrimSpace(input.Profile) != "" {
		if strings.TrimSpace(input.Profile) == "" {
			return strings.TrimSpace(input.ProviderType)
		}
		return strings.TrimSpace(input.ProviderType) + "/" + strings.TrimSpace(input.Profile)
	}
	return strings.TrimSpace(input.ProviderKind)
}

func defaultAdapterTypeForProviderTemplate(template infraai.ProviderTemplate) string {
	if value := strings.TrimSpace(template.DefaultAdapterType); value != "" {
		return value
	}
	return strings.TrimSpace(template.DefaultAdapterKey)
}

func adapterHasBaseURLField(def *infraai.AdapterDef) bool {
	if def == nil {
		return false
	}
	for _, field := range def.CredFields {
		if field.Key == "base_url" {
			return true
		}
	}
	return false
}

func cloneStringMap(input map[string]string) map[string]string {
	out := make(map[string]string, len(input)+1)
	for key, value := range input {
		out[key] = value
	}
	return out
}

func legacyProviderIDForCredential(id uint) string {
	return fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, id)
}

func legacyMirrorProviderIDForCredential(credential persistencemodel.AICredential) string {
	return providerIDForCreatedProvider(providerKindForCredential(credential), credential.ID)
}

func providerIDForCreatedProvider(providerKind string, credentialID uint) string {
	return fmt.Sprintf("%s:%d", strings.TrimSpace(providerKind), credentialID)
}

func mapKeys(input map[string]bool) []string {
	out := make([]string, 0, len(input))
	for key := range input {
		key = strings.TrimSpace(key)
		if key != "" {
			out = append(out, key)
		}
	}
	return out
}

func providerKindForCredential(credential persistencemodel.AICredential) string {
	adapter := strings.TrimSpace(credential.AdapterType)
	baseURL := strings.ToLower(strings.TrimSpace(credential.BaseURL))
	switch adapter {
	case infraai.AdapterVolcen:
		return persistencemodel.AIProviderKindVolcengineArk
	case infraai.AdapterOpenAICompat:
		if strings.Contains(baseURL, "127.0.0.1") || strings.Contains(baseURL, "localhost") || strings.HasPrefix(baseURL, "http://0.0.0.0") {
			return persistencemodel.AIProviderKindLocalOpenAICompat
		}
		return persistencemodel.AIProviderKindOpenAICompatGateway
	default:
		if adapter == "" {
			return persistencemodel.AIProviderKindOpenAICompatGateway
		}
		return adapter
	}
}

func providerTypeForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderTypeVolcen
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderTypeOpenAI
	default:
		return persistencemodel.AIProviderTypeOpenAI
	}
}

func providerProfileForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderProfileArk
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderProfileLocal
	default:
		return persistencemodel.AIProviderProfileOfficial
	}
}

func providerCategoryForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderCategoryOfficialPlatform
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderCategoryLocalEndpoint
	default:
		return persistencemodel.AIProviderCategoryAggregatorGateway
	}
}

func credentialKindForAdapter(adapterType string) string {
	if strings.TrimSpace(adapterType) == infraai.AdapterKling {
		return "ak_sk"
	}
	return "api_key"
}

func legacyEncryptedSecretsJSON(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]string{
		"legacy_encrypted_key":           credential.EncryptedKey,
		"legacy_files_api_encrypted_key": credential.FilesAPIEncryptedKey,
	})
}

func legacyMaskedSecretsJSON(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]string{
		"legacy_masked_key":           credential.MaskedKey,
		"legacy_files_api_masked_key": credential.FilesAPIMaskedKey,
	})
}

func legacyPlainConfigJSON(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]any{
		"legacy_credential_id": credential.ID,
		"files_api_enabled":    credential.FilesAPIEnabled,
		"files_api_base_url":   strings.TrimSpace(credential.FilesAPIBaseURL),
	})
}

func compactJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}
