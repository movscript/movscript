package ai

import (
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	ProviderCategoryOfficialPlatform = persistencemodel.AIProviderCategoryOfficialPlatform
	ProviderKindVolcengineArk        = persistencemodel.AIProviderKindVolcengineArk
	ProviderKindYunwuGateway         = persistencemodel.AIProviderKindYunwuGateway
)

type Provider struct {
	gorm.Model
	ProviderID               string               `json:"provider_id"`
	ProviderType             string               `json:"provider_type,omitempty"`
	Profile                  string               `json:"profile,omitempty"`
	ProviderKind             string               `json:"provider_kind"`
	ProviderCategory         string               `json:"provider_category"`
	DefaultAdapterType       string               `json:"default_adapter_type,omitempty"`
	AdapterKey               string               `json:"adapter_key"`
	TemplateVersion          string               `json:"template_version"`
	DisplayName              string               `json:"display_name"`
	OrgID                    *uint                `json:"org_id,omitempty"`
	BaseURLPrefix            string               `json:"base_url_prefix"`
	AccountRef               string               `json:"account_ref"`
	AssetLibraryStateJSON    string               `json:"asset_library_state_json"`
	TrustedResourceStateJSON string               `json:"trusted_resource_state_json"`
	HealthJSON               string               `json:"health_json"`
	IsEnabled                bool                 `json:"is_enabled"`
	Credentials              []ProviderCredential `json:"credentials,omitempty"`
}

type ProviderCredential struct {
	gorm.Model
	ProviderID        string     `json:"provider_id"`
	CredentialKey     string     `json:"credential_key"`
	CredentialKind    string     `json:"credential_kind"`
	SchemaVersion     string     `json:"schema_version"`
	MaskedSecretsJSON string     `json:"masked_secrets_json"`
	PlainConfigJSON   string     `json:"plain_config_json"`
	Status            string     `json:"status"`
	IsPrimary         bool       `json:"is_primary"`
	Priority          int        `json:"priority"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	LastRotatedAt     *time.Time `json:"last_rotated_at,omitempty"`
	LastUsedAt        *time.Time `json:"last_used_at,omitempty"`
	HealthJSON        string     `json:"health_json"`
}

type ModelCatalogEntry struct {
	gorm.Model
	ModelTemplateKey      string              `json:"model_template_key,omitempty"`
	TemplateVersion       string              `json:"template_version,omitempty"`
	PublicModelID         string              `json:"public_model_id"`
	DisplayName           string              `json:"display_name"`
	ShortName             string              `json:"short_name"`
	IsEnabled             bool                `json:"is_enabled"`
	Capabilities          string              `json:"capabilities"`
	AcceptsImage          bool                `json:"accepts_image"`
	MaxInputImages        int                 `json:"max_input_images"`
	MaxInputVideos        int                 `json:"max_input_videos"`
	InputImageField       string              `json:"input_image_field"`
	SupportedParams       string              `json:"supported_params"`
	ParamLimitsJSON       string              `json:"param_limits_json,omitempty"`
	ModelCapabilitiesJSON string              `json:"model_capabilities_json,omitempty"`
	RouteBindings         []ModelRouteBinding `json:"route_bindings,omitempty"`
}

type ModelRouteBinding struct {
	gorm.Model
	CatalogEntryID     uint   `json:"catalog_entry_id"`
	ComboTemplateKey   string `json:"combo_template_key,omitempty"`
	TemplateVersion    string `json:"template_version,omitempty"`
	SourceType         string `json:"source_type"`
	RouteGroup         string `json:"route_group"`
	ProviderID         string `json:"provider_id,omitempty"`
	AdapterType        string `json:"adapter_type,omitempty"`
	ProviderModelID    string `json:"provider_model_id"`
	ProtocolProfile    string `json:"protocol_profile,omitempty"`
	APIKinds           string `json:"api_kinds,omitempty"`
	EndpointBaseURL    string `json:"endpoint_base_url,omitempty"`
	EndpointPathPrefix string `json:"endpoint_path_prefix,omitempty"`
	EndpointMode       string `json:"endpoint_mode,omitempty"`
	CredentialID       *uint  `json:"-"`
	IsEnabled          bool   `json:"is_enabled"`
	Priority           int    `json:"priority"`
	CapacityWeight     int    `json:"capacity_weight"`
	MaxConcurrency     int    `json:"max_concurrency"`
}

func providerFromModel(provider persistencemodel.AIProvider) Provider {
	return Provider{
		Model:                    provider.Model,
		ProviderID:               provider.ProviderID,
		ProviderType:             provider.ProviderType,
		Profile:                  provider.Profile,
		ProviderKind:             provider.ProviderKind,
		ProviderCategory:         provider.ProviderCategory,
		DefaultAdapterType:       provider.DefaultAdapterType,
		AdapterKey:               provider.AdapterKey,
		TemplateVersion:          provider.TemplateVersion,
		DisplayName:              provider.DisplayName,
		OrgID:                    provider.OrgID,
		BaseURLPrefix:            provider.BaseURLPrefix,
		AccountRef:               provider.AccountRef,
		AssetLibraryStateJSON:    provider.AssetLibraryStateJSON,
		TrustedResourceStateJSON: provider.TrustedResourceStateJSON,
		HealthJSON:               provider.HealthJSON,
		IsEnabled:                provider.IsEnabled,
		Credentials:              providerCredentialsFromModels(provider.Credentials),
	}
}

func providersFromModels(providers []persistencemodel.AIProvider) []Provider {
	out := make([]Provider, 0, len(providers))
	for _, provider := range providers {
		out = append(out, providerFromModel(provider))
	}
	return out
}

func providerCredentialFromModel(credential persistencemodel.AIProviderCredential) ProviderCredential {
	return ProviderCredential{
		Model:             credential.Model,
		ProviderID:        credential.ProviderID,
		CredentialKey:     credential.CredentialKey,
		CredentialKind:    credential.CredentialKind,
		SchemaVersion:     credential.SchemaVersion,
		MaskedSecretsJSON: credential.MaskedSecretsJSON,
		PlainConfigJSON:   credential.PlainConfigJSON,
		Status:            credential.Status,
		IsPrimary:         credential.IsPrimary,
		Priority:          credential.Priority,
		ExpiresAt:         credential.ExpiresAt,
		LastRotatedAt:     credential.LastRotatedAt,
		LastUsedAt:        credential.LastUsedAt,
		HealthJSON:        credential.HealthJSON,
	}
}

func providerCredentialsFromModels(credentials []persistencemodel.AIProviderCredential) []ProviderCredential {
	out := make([]ProviderCredential, 0, len(credentials))
	for _, credential := range credentials {
		out = append(out, providerCredentialFromModel(credential))
	}
	return out
}

func modelCatalogEntryFromModel(entry persistencemodel.AIModelCatalogEntry) ModelCatalogEntry {
	return ModelCatalogEntry{
		Model:                 entry.Model,
		ModelTemplateKey:      entry.ModelTemplateKey,
		TemplateVersion:       entry.TemplateVersion,
		PublicModelID:         entry.PublicModelID,
		DisplayName:           entry.DisplayName,
		ShortName:             entry.ShortName,
		IsEnabled:             entry.IsEnabled,
		Capabilities:          entry.Capabilities,
		AcceptsImage:          entry.AcceptsImage,
		MaxInputImages:        entry.MaxInputImages,
		MaxInputVideos:        entry.MaxInputVideos,
		InputImageField:       entry.InputImageField,
		SupportedParams:       entry.SupportedParams,
		ParamLimitsJSON:       entry.ParamLimitsJSON,
		ModelCapabilitiesJSON: entry.ModelCapabilitiesJSON,
		RouteBindings:         modelRouteBindingsFromModels(entry.RouteBindings),
	}
}

func modelCatalogEntriesFromModels(entries []persistencemodel.AIModelCatalogEntry) []ModelCatalogEntry {
	out := make([]ModelCatalogEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, modelCatalogEntryFromModel(entry))
	}
	return out
}

func modelRouteBindingFromModel(binding persistencemodel.AIModelRouteBinding) ModelRouteBinding {
	return ModelRouteBinding{
		Model:              binding.Model,
		CatalogEntryID:     binding.CatalogEntryID,
		ComboTemplateKey:   binding.ComboTemplateKey,
		TemplateVersion:    binding.TemplateVersion,
		SourceType:         binding.SourceType,
		RouteGroup:         binding.RouteGroup,
		ProviderID:         binding.ProviderID,
		AdapterType:        binding.AdapterType,
		ProviderModelID:    binding.ProviderModelID,
		ProtocolProfile:    binding.ProtocolProfile,
		APIKinds:           binding.APIKinds,
		EndpointBaseURL:    binding.EndpointBaseURL,
		EndpointPathPrefix: binding.EndpointPathPrefix,
		EndpointMode:       binding.EndpointMode,
		CredentialID:       binding.CredentialID,
		IsEnabled:          binding.IsEnabled,
		Priority:           binding.Priority,
		CapacityWeight:     binding.CapacityWeight,
		MaxConcurrency:     binding.MaxConcurrency,
	}
}

func modelRouteBindingsFromModels(bindings []persistencemodel.AIModelRouteBinding) []ModelRouteBinding {
	out := make([]ModelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		out = append(out, modelRouteBindingFromModel(binding))
	}
	return out
}
