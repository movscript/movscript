package ai

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	infraai "github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCreateProviderCreatesCredentialBackedProvider(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()

	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderType:  persistencemodel.AIProviderTypeRelayGateway,
		Profile:       persistencemodel.AIProviderProfileGateway,
		DisplayName:   "Gateway",
		BaseURLPrefix: "https://gateway.example.com/v1",
		Credentials: map[string]string{
			"api_key": "sk-provider-test",
		},
		FilesAPIEnabled: true,
		FilesAPIBaseURL: "https://files.example.com/v1",
		FilesAPIKey:     "files-key",
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	if provider.ProviderType != persistencemodel.AIProviderTypeRelayGateway ||
		provider.Profile != persistencemodel.AIProviderProfileGateway ||
		provider.ProviderKind != persistencemodel.AIProviderKindRelayGateway ||
		provider.ProviderCategory != persistencemodel.AIProviderCategoryAggregatorGateway ||
		provider.DefaultAdapterType != infraai.AdapterOpenAICompat ||
		provider.AdapterKey != infraai.AdapterOpenAICompat ||
		provider.BaseURLPrefix != "https://gateway.example.com/v1" {
		t.Fatalf("unexpected provider: %+v", provider)
	}
	if strings.HasPrefix(provider.ProviderID, persistencemodel.ModelRouteSourceLocalProvider+":") {
		t.Fatalf("provider id = %q, want stable provider id decoupled from legacy credential", provider.ProviderID)
	}
	if len(provider.Credentials) != 1 {
		t.Fatalf("provider credential count = %d, want 1", len(provider.Credentials))
	}
	var plainConfig struct {
		LegacyCredentialID uint   `json:"legacy_credential_id"`
		FilesAPIEnabled    bool   `json:"files_api_enabled"`
		FilesAPIBaseURL    string `json:"files_api_base_url"`
	}
	if err := json.Unmarshal([]byte(provider.Credentials[0].PlainConfigJSON), &plainConfig); err != nil {
		t.Fatalf("decode provider credential plain config: %v", err)
	}
	if plainConfig.LegacyCredentialID == 0 || !plainConfig.FilesAPIEnabled || plainConfig.FilesAPIBaseURL != "https://files.example.com/v1" {
		t.Fatalf("unexpected plain config: %+v", plainConfig)
	}
	var legacyCredential persistencemodel.AICredential
	if err := service.db.First(&legacyCredential, plainConfig.LegacyCredentialID).Error; err != nil {
		t.Fatalf("load legacy credential: %v", err)
	}
	if legacyCredential.BaseURL != "https://gateway.example.com/v1" || strings.TrimSpace(legacyCredential.EncryptedKey) == "" {
		t.Fatalf("unexpected legacy credential: %+v", legacyCredential)
	}
	var providerCount int64
	if err := service.db.Model(&persistencemodel.AIProvider{}).Count(&providerCount).Error; err != nil {
		t.Fatalf("count providers: %v", err)
	}
	if providerCount != 1 {
		t.Fatalf("provider count = %d, want only the stable provider created through CreateProvider", providerCount)
	}
}

func TestCreateProviderPreservesTemplateProviderKind(t *testing.T) {
	service := newProviderTestService(t)

	provider, err := service.CreateProvider(context.Background(), CreateProviderInput{
		ProviderKind:  persistencemodel.AIProviderKindRelayGateway,
		DisplayName:   "中转站",
		BaseURLPrefix: "https://relay-gateway.example.com/v1",
		Credentials: map[string]string{
			"api_key": "proxy-key",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	if provider.ProviderKind != persistencemodel.AIProviderKindRelayGateway {
		t.Fatalf("provider kind = %q, want relay gateway", provider.ProviderKind)
	}
	if provider.ProviderType != persistencemodel.AIProviderTypeRelayGateway || provider.Profile != persistencemodel.AIProviderProfileGateway {
		t.Fatalf("provider type/profile = %q/%q, want relay_gateway/gateway", provider.ProviderType, provider.Profile)
	}
	if provider.ProviderCategory != persistencemodel.AIProviderCategoryAggregatorGateway {
		t.Fatalf("provider category = %q, want aggregator gateway", provider.ProviderCategory)
	}
}

func TestCreateProviderRejectsMissingRequiredCredential(t *testing.T) {
	service := newProviderTestService(t)

	_, err := service.CreateProvider(context.Background(), CreateProviderInput{
		ProviderKind: persistencemodel.AIProviderKindVolcengineArk,
		DisplayName:  "Ark",
		Credentials:  map[string]string{},
	})
	if err == nil || !strings.Contains(err.Error(), "missing required credential") {
		t.Fatalf("CreateProvider() error = %v, want missing required credential", err)
	}
}

func TestCreateProviderRejectsReservedProviderID(t *testing.T) {
	service := newProviderTestService(t)

	_, err := service.CreateProvider(context.Background(), CreateProviderInput{
		ProviderID:   "local_provider:12",
		ProviderKind: persistencemodel.AIProviderKindOpenAICompatGateway,
		DisplayName:  "Gateway",
		Credentials: map[string]string{
			"api_key": "sk-provider-test",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "reserved") {
		t.Fatalf("CreateProvider() error = %v, want reserved provider id", err)
	}
}

func TestCreateCredentialMirrorsStableProviderID(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()

	credential, err := service.CreateCredential(ctx, CreateCredentialInput{
		AdapterType: infraai.AdapterOpenAICompat,
		DisplayName: "Gateway credential",
		Credentials: map[string]string{"api_key": "sk-provider-test", "base_url": "https://gateway.example.com/v1"},
	})
	if err != nil {
		t.Fatalf("CreateCredential() error = %v", err)
	}
	providerID := providerIDForCreatedProvider(persistencemodel.AIProviderKindOpenAICompatGateway, credential.ID)
	if strings.HasPrefix(providerID, persistencemodel.ModelRouteSourceLocalProvider+":") {
		t.Fatalf("provider id = %q, want provider-kind scoped id", providerID)
	}
	providers, err := service.ListProviders(ctx)
	if err != nil {
		t.Fatalf("ListProviders() error = %v", err)
	}
	provider := providerByID(providers, providerID)
	if provider == nil {
		t.Fatalf("provider %q not listed: %+v", providerID, providers)
	}
	if provider.ProviderKind != persistencemodel.AIProviderKindOpenAICompatGateway {
		t.Fatalf("provider kind = %q, want openai compat gateway", provider.ProviderKind)
	}

	if _, err := service.DeleteCredential(ctx, strconv.FormatUint(uint64(credential.ID), 10)); err != nil {
		t.Fatalf("DeleteCredential() error = %v", err)
	}
	var disabledProvider persistencemodel.AIProvider
	if err := service.db.Where("provider_id = ?", providerID).First(&disabledProvider).Error; err != nil {
		t.Fatalf("load disabled provider: %v", err)
	}
	if disabledProvider.IsEnabled {
		t.Fatalf("provider %q is still enabled after deleting linked credential", providerID)
	}
	var providerCredential persistencemodel.AIProviderCredential
	if err := service.db.Where("provider_id = ?", providerID).First(&providerCredential).Error; err != nil {
		t.Fatalf("load provider credential: %v", err)
	}
	if providerCredential.Status != persistencemodel.AIProviderCredentialStatusDisabled || providerCredential.IsPrimary {
		t.Fatalf("provider credential = %+v, want disabled non-primary", providerCredential)
	}
}

func TestListProvidersIncludesOfficialArkAssetAndTrustRuntimeState(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()
	settingsService := adminsettings.NewService(service.db, hex.EncodeToString(service.encryptionKey))
	if _, err := settingsService.UpdateProviderAssetSettings(ctx, adminsettings.ProviderAssetSettings{
		PublicBaseURL: "https://public.example.com",
		SigningSecret: "signing-secret",
	}); err != nil {
		t.Fatalf("UpdateProviderAssetSettings() error = %v", err)
	}
	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderID:    "volc-ark-main",
		ProviderKind:  persistencemodel.AIProviderKindVolcengineArk,
		DisplayName:   "Ark Official",
		BaseURLPrefix: "https://ark.cn-beijing.volces.com/api/v3",
		Credentials: map[string]string{
			"api_key": "ark-runtime-key",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	if _, err := service.UpdateProviderAssetLibrarySettings(ctx, provider.ProviderID, ProviderAssetLibrarySettingsInput{
		ArkOpenAPIBaseURL:  "https://ark.cn-beijing.volcengineapi.com",
		ArkRegion:          "cn-beijing",
		ArkAccessKeyID:     "ak-test",
		ArkSecretAccessKey: "ark-secret",
	}); err != nil {
		t.Fatalf("UpdateProviderAssetLibrarySettings() error = %v", err)
	}
	if _, err := service.UpsertProviderAssetLibraryGroup(ctx, provider.ProviderID, "global", adminsettings.ProviderAssetGroupState{
		ID:   "group-test",
		Name: "MovScript global",
	}); err != nil {
		t.Fatalf("UpsertProviderAssetLibraryGroup() error = %v", err)
	}
	var storedProvider persistencemodel.AIProvider
	if err := service.db.Where("provider_id = ?", provider.ProviderID).First(&storedProvider).Error; err != nil {
		t.Fatalf("load stored provider: %v", err)
	}
	if strings.Contains(storedProvider.AssetLibraryStateJSON, "ark-secret") || strings.Contains(storedProvider.AssetLibraryStateJSON, "ak-test") {
		t.Fatalf("provider asset_library_state_json contains credential material: %s", storedProvider.AssetLibraryStateJSON)
	}
	var assetCredential persistencemodel.AIProviderCredential
	if err := service.db.Where("provider_id = ? AND credential_key = ?", provider.ProviderID, providerAssetLibraryCredentialKey).First(&assetCredential).Error; err != nil {
		t.Fatalf("load provider asset credential: %v", err)
	}
	if assetCredential.CredentialKind != providerAssetLibraryCredentialKind || !strings.Contains(assetCredential.PlainConfigJSON, "ak-test") {
		t.Fatalf("unexpected provider asset credential: %+v", assetCredential)
	}
	if strings.Contains(assetCredential.EncryptedSecretsJSON, "ark-secret") {
		t.Fatalf("provider asset credential secret was not encrypted: %s", assetCredential.EncryptedSecretsJSON)
	}
	providers, err := service.ListProviders(ctx)
	if err != nil {
		t.Fatalf("ListProviders() error = %v", err)
	}
	if err := service.db.Where("provider_id = ?", provider.ProviderID).First(&storedProvider).Error; err != nil {
		t.Fatalf("reload stored provider: %v", err)
	}
	if !strings.Contains(storedProvider.AssetLibraryStateJSON, "group-test") {
		t.Fatalf("provider sync wiped provider asset group state: %s", storedProvider.AssetLibraryStateJSON)
	}
	listed := providerByID(providers, provider.ProviderID)
	if listed == nil {
		t.Fatalf("provider %q not listed: %+v", provider.ProviderID, providers)
	}
	assetState := decodeProviderState(t, listed.AssetLibraryStateJSON)
	if assetState["supports_asset_library"] != true {
		t.Fatalf("asset supports = %#v, want true; state=%s", assetState["supports_asset_library"], listed.AssetLibraryStateJSON)
	}
	if !stringListContains(assetState["asset_types"], "image") {
		t.Fatalf("asset_types = %#v, want image", assetState["asset_types"])
	}
	settings, _ := assetState["settings"].(map[string]any)
	if settings["public_base_url_set"] != true || settings["ark_access_key_id_set"] != true || settings["ark_secret_key_set"] != true {
		t.Fatalf("settings summary = %#v, want configured provider asset settings", settings)
	}
	if settings["ark_credentials_source"] != "provider" {
		t.Fatalf("settings summary = %#v, want provider credential source", settings)
	}
	globalGroup, _ := assetState["global_group"].(map[string]any)
	if globalGroup["id"] != "group-test" {
		t.Fatalf("global group = %#v, want stored provider asset group", globalGroup)
	}
	if hasDiagnostic(assetState["diagnostics"], "missing_ark_access_key_id") || hasDiagnostic(assetState["diagnostics"], "missing_ark_secret_access_key") {
		t.Fatalf("asset diagnostics unexpectedly report missing Ark keys: %#v", assetState["diagnostics"])
	}
	trustState := decodeProviderState(t, listed.TrustedResourceStateJSON)
	if trustState["supports_generated_artifact_trust"] != true {
		t.Fatalf("trust supports = %#v, want true; state=%s", trustState["supports_generated_artifact_trust"], listed.TrustedResourceStateJSON)
	}
	if trustState["scope"] != "same_provider_account" || trustState["requires_original_artifact"] != true {
		t.Fatalf("trust state = %#v, want same-account original artifact trust", trustState)
	}
	if !stringListContains(trustState["trusted_model_families"], "seedance-2.0") {
		t.Fatalf("trusted_model_families = %#v, want seedance-2.0", trustState["trusted_model_families"])
	}
}

func TestListProvidersUsesYunwuProviderCredentialForAssetLibraryState(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()
	settingsService := adminsettings.NewService(service.db, hex.EncodeToString(service.encryptionKey))
	if _, err := settingsService.UpdateProviderAssetSettings(ctx, adminsettings.ProviderAssetSettings{
		PublicBaseURL: "https://public.example.com",
		SigningSecret: "signing-secret",
	}); err != nil {
		t.Fatalf("UpdateProviderAssetSettings() error = %v", err)
	}
	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderID:    "yunwu-main",
		ProviderKind:  persistencemodel.AIProviderKindYunwuGateway,
		DisplayName:   "Yunwu Gateway",
		BaseURLPrefix: "https://yunwu.ai/v1",
		Credentials: map[string]string{
			"api_key": "runtime-key",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	providers, err := service.ListProviders(ctx)
	if err != nil {
		t.Fatalf("ListProviders() error = %v", err)
	}
	var listed Provider
	for _, item := range providers {
		if item.ProviderID == provider.ProviderID {
			listed = item
			break
		}
	}
	if listed.ProviderID == "" {
		t.Fatalf("provider %q not listed", provider.ProviderID)
	}
	var state struct {
		Settings    map[string]any   `json:"settings"`
		Diagnostics []map[string]any `json:"diagnostics"`
	}
	if err := json.Unmarshal([]byte(listed.AssetLibraryStateJSON), &state); err != nil {
		t.Fatalf("decode asset library state: %v", err)
	}
	if state.Settings["gateway_base_url"] != "https://yunwu.ai/v1" || state.Settings["gateway_token_set"] != true || state.Settings["gateway_credentials_source"] != "provider_runtime" {
		t.Fatalf("asset library settings = %#v", state.Settings)
	}
	for _, diagnostic := range state.Diagnostics {
		if diagnostic["severity"] == "error" {
			t.Fatalf("unexpected error diagnostic: %#v", diagnostic)
		}
	}
}

func TestListProvidersMarksGatewayProviderAssetLibraryUnsupported(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()
	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderID:    "gateway-main",
		ProviderKind:  persistencemodel.AIProviderKindOpenAICompatGateway,
		DisplayName:   "Gateway",
		BaseURLPrefix: "https://gateway.example.com/v1",
		Credentials: map[string]string{
			"api_key": "gateway-key",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	providers, err := service.ListProviders(ctx)
	if err != nil {
		t.Fatalf("ListProviders() error = %v", err)
	}
	listed := providerByID(providers, provider.ProviderID)
	if listed == nil {
		t.Fatalf("provider %q not listed: %+v", provider.ProviderID, providers)
	}
	assetState := decodeProviderState(t, listed.AssetLibraryStateJSON)
	if assetState["supports_asset_library"] != false {
		t.Fatalf("asset supports = %#v, want false; state=%s", assetState["supports_asset_library"], listed.AssetLibraryStateJSON)
	}
	if !hasDiagnostic(assetState["diagnostics"], "provider_asset_library_unsupported") {
		t.Fatalf("asset diagnostics = %#v, want unsupported diagnostic", assetState["diagnostics"])
	}
	trustState := decodeProviderState(t, listed.TrustedResourceStateJSON)
	if trustState["supports_generated_artifact_trust"] != false {
		t.Fatalf("trust supports = %#v, want false; state=%s", trustState["supports_generated_artifact_trust"], listed.TrustedResourceStateJSON)
	}
	if !hasDiagnostic(trustState["diagnostics"], "generated_artifact_trust_unsupported") {
		t.Fatalf("trust diagnostics = %#v, want unsupported diagnostic", trustState["diagnostics"])
	}
}

func TestProviderCredentialRotationSetsPrimaryAndDisablesLegacyKey(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()
	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderKind: persistencemodel.AIProviderKindOpenAICompatGateway,
		DisplayName:  "Gateway",
		Credentials: map[string]string{
			"api_key": "sk-primary",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	provider, err = service.CreateProviderCredential(ctx, provider.ProviderID, CreateProviderCredentialInput{
		CredentialKey: "backup",
		Credentials: map[string]string{
			"api_key": "sk-backup",
		},
	})
	if err != nil {
		t.Fatalf("CreateProviderCredential() error = %v", err)
	}
	if len(provider.Credentials) != 2 {
		t.Fatalf("provider credential count = %d, want 2", len(provider.Credentials))
	}
	provider, err = service.SetProviderCredentialPrimary(ctx, provider.ProviderID, "backup")
	if err != nil {
		t.Fatalf("SetProviderCredentialPrimary() error = %v", err)
	}
	primary := providerCredentialByKey(provider, "primary")
	backup := providerCredentialByKey(provider, "backup")
	if primary == nil || backup == nil {
		t.Fatalf("provider credentials after primary switch: %+v", provider.Credentials)
	}
	if primary.IsPrimary || !backup.IsPrimary {
		t.Fatalf("primary flags = primary:%v backup:%v, want backup primary", primary.IsPrimary, backup.IsPrimary)
	}
	backupLegacyID := legacyCredentialIDFromProviderCredential(t, *backup)
	provider, err = service.UpdateProviderCredential(ctx, provider.ProviderID, "backup", UpdateProviderCredentialInput{Status: persistencemodel.AIProviderCredentialStatusDisabled})
	if err != nil {
		t.Fatalf("UpdateProviderCredential() error = %v", err)
	}
	backup = providerCredentialByKey(provider, "backup")
	if backup == nil || backup.Status != persistencemodel.AIProviderCredentialStatusDisabled || backup.IsPrimary {
		t.Fatalf("backup credential after disable = %+v, want disabled non-primary", backup)
	}
	var legacyCredential persistencemodel.AICredential
	if err := service.db.First(&legacyCredential, backupLegacyID).Error; err != nil {
		t.Fatalf("load backup legacy credential: %v", err)
	}
	if legacyCredential.IsEnabled {
		t.Fatalf("backup legacy credential is enabled after provider credential disable")
	}
}

func TestUpdateProviderCredentialCanAddVolcenSpeechCredentials(t *testing.T) {
	service := newProviderTestService(t)
	ctx := context.Background()
	provider, err := service.CreateProvider(ctx, CreateProviderInput{
		ProviderKind:  persistencemodel.AIProviderKindVolcengineArk,
		DisplayName:   "Ark Official",
		BaseURLPrefix: "https://ark.cn-beijing.volces.com/api/v3",
		Credentials: map[string]string{
			"api_key": "ark-runtime-key",
		},
	})
	if err != nil {
		t.Fatalf("CreateProvider() error = %v", err)
	}
	provider, err = service.UpdateProviderCredential(ctx, provider.ProviderID, "primary", UpdateProviderCredentialInput{
		Credentials: map[string]string{
			"speech_app_id":  "speech-app",
			"speech_token":   "speech-token",
			"speech_cluster": "volcano_tts",
		},
	})
	if err != nil {
		t.Fatalf("UpdateProviderCredential() error = %v", err)
	}
	primary := providerCredentialByKey(provider, "primary")
	if primary == nil || primary.Status != persistencemodel.AIProviderCredentialStatusActive || !primary.IsPrimary {
		t.Fatalf("primary credential after update = %+v", primary)
	}
	legacyID := legacyCredentialIDFromProviderCredential(t, *primary)
	var legacyCredential persistencemodel.AICredential
	if err := service.db.First(&legacyCredential, legacyID).Error; err != nil {
		t.Fatalf("load legacy credential: %v", err)
	}
	raw, err := crypto.Decrypt(legacyCredential.EncryptedKey, service.encryptionKey)
	if err != nil {
		t.Fatalf("decrypt legacy credential: %v", err)
	}
	var parsed struct {
		APIKey        string `json:"api_key"`
		SpeechAppID   string `json:"speech_app_id"`
		SpeechToken   string `json:"speech_token"`
		SpeechCluster string `json:"speech_cluster"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		t.Fatalf("decode legacy credential: %v; raw=%s", err, raw)
	}
	if parsed.APIKey != "ark-runtime-key" || parsed.SpeechAppID != "speech-app" || parsed.SpeechToken != "speech-token" || parsed.SpeechCluster != "volcano_tts" {
		t.Fatalf("legacy credential = %+v, want ark key and speech credentials", parsed)
	}
}

func providerCredentialByKey(provider Provider, key string) *ProviderCredential {
	for i := range provider.Credentials {
		if provider.Credentials[i].CredentialKey == key {
			return &provider.Credentials[i]
		}
	}
	return nil
}

func legacyCredentialIDFromProviderCredential(t *testing.T, credential ProviderCredential) uint {
	t.Helper()
	var plainConfig struct {
		LegacyCredentialID uint `json:"legacy_credential_id"`
	}
	if err := json.Unmarshal([]byte(credential.PlainConfigJSON), &plainConfig); err != nil {
		t.Fatalf("decode provider credential plain config: %v", err)
	}
	return plainConfig.LegacyCredentialID
}

func providerByID(providers []Provider, providerID string) *Provider {
	for i := range providers {
		if providers[i].ProviderID == providerID {
			return &providers[i]
		}
	}
	return nil
}

func decodeProviderState(t *testing.T, raw string) map[string]any {
	t.Helper()
	var state map[string]any
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		t.Fatalf("decode provider state %q: %v", raw, err)
	}
	return state
}

func stringListContains(raw any, target string) bool {
	values, ok := raw.([]any)
	if !ok {
		return false
	}
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func hasDiagnostic(raw any, code string) bool {
	values, ok := raw.([]any)
	if !ok {
		return false
	}
	for _, value := range values {
		item, ok := value.(map[string]any)
		if ok && item["code"] == code {
			return true
		}
	}
	return false
}

func newProviderTestService(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenSQLite(t, "admin-ai-providers.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
		&persistencemodel.AdminSetting{},
	)
	db = db.Session(&gorm.Session{SkipHooks: true})
	key := []byte("test-encryption-key-32-bytes----")
	registry := infraai.NewRegistry(db, key)
	return NewService(db, key, registry)
}
