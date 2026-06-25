package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	AIProviderCategoryOfficialPlatform  = "official_platform"
	AIProviderCategoryAggregatorGateway = "aggregator_gateway"
	AIProviderCategoryLocalEndpoint     = "local_endpoint"

	AIProviderTypeOpenAI       = "openai"
	AIProviderTypeVolcen       = "volcen"
	AIProviderTypeRelayGateway = "relay_gateway"

	AIProviderProfileOfficial = "official"
	AIProviderProfileArk      = "ark"
	AIProviderProfileGateway  = "gateway"
	AIProviderProfileLocal    = "local"

	AIProviderKindOpenAICompatGateway = "openai_compat_gateway"
	AIProviderKindVolcengineArk       = "volcengine_ark_official"
	AIProviderKindVolcengineArkProxy  = "volcengine_ark_proxy"
	AIProviderKindRelayGateway        = "relay_gateway"
	AIProviderKindLocalOpenAICompat   = "local_openai_compat"

	AIProviderCredentialStatusActive   = "active"
	AIProviderCredentialStatusDisabled = "disabled"
	AIProviderCredentialStatusRevoked  = "revoked"
)

// AICredential stores authentication credentials for one provider family.
type AICredential struct {
	gorm.Model
	AdapterType  string `gorm:"not null;index" json:"adapter_type"`
	DisplayName  string `gorm:"not null" json:"display_name"`
	BaseURL      string `json:"base_url"`
	EncryptedKey string `json:"-"`
	MaskedKey    string `gorm:"-" json:"masked_key"`
	IsEnabled    bool   `gorm:"default:true" json:"is_enabled"`
	OrgID        *uint  `gorm:"index" json:"org_id,omitempty"`

	FilesAPIEnabled      bool   `gorm:"default:false" json:"files_api_enabled"`
	FilesAPIBaseURL      string `json:"files_api_base_url"`
	FilesAPIEncryptedKey string `json:"-"`
	FilesAPIMaskedKey    string `gorm:"-" json:"files_api_masked_key"`
}

// AIProvider is the stable provider account boundary used by routes and resources.
type AIProvider struct {
	gorm.Model
	ProviderID               string                 `gorm:"not null;uniqueIndex" json:"provider_id"`
	ProviderType             string                 `gorm:"default:'';index" json:"provider_type,omitempty"`
	Profile                  string                 `gorm:"default:'';index" json:"profile,omitempty"`
	ProviderKind             string                 `gorm:"not null;index" json:"provider_kind"`
	ProviderCategory         string                 `gorm:"not null;index" json:"provider_category"`
	DefaultAdapterType       string                 `gorm:"default:'';index" json:"default_adapter_type,omitempty"`
	AdapterKey               string                 `gorm:"not null;index" json:"adapter_key"`
	TemplateVersion          string                 `gorm:"default:''" json:"template_version"`
	DisplayName              string                 `gorm:"not null" json:"display_name"`
	OrgID                    *uint                  `gorm:"index" json:"org_id,omitempty"`
	BaseURLPrefix            string                 `gorm:"default:''" json:"base_url_prefix"`
	AccountRef               string                 `gorm:"default:''" json:"account_ref"`
	AssetLibraryStateJSON    string                 `gorm:"type:text;default:'{}'" json:"asset_library_state_json"`
	TrustedResourceStateJSON string                 `gorm:"type:text;default:'{}'" json:"trusted_resource_state_json"`
	HealthJSON               string                 `gorm:"type:text;default:'{}'" json:"health_json"`
	IsEnabled                bool                   `gorm:"default:true;index" json:"is_enabled"`
	Credentials              []AIProviderCredential `gorm:"foreignKey:ProviderID;references:ProviderID" json:"credentials,omitempty"`
}

// AIProviderCredential stores one rotatable key for an AIProvider.
type AIProviderCredential struct {
	gorm.Model
	ProviderID           string     `gorm:"not null;index;uniqueIndex:uidx_ai_provider_credentials_key" json:"provider_id"`
	CredentialKey        string     `gorm:"not null;uniqueIndex:uidx_ai_provider_credentials_key" json:"credential_key"`
	CredentialKind       string     `gorm:"not null;default:'api_key'" json:"credential_kind"`
	SchemaVersion        string     `gorm:"default:''" json:"schema_version"`
	EncryptedSecretsJSON string     `gorm:"type:text;default:'{}'" json:"-"`
	MaskedSecretsJSON    string     `gorm:"type:text;default:'{}'" json:"masked_secrets_json"`
	PlainConfigJSON      string     `gorm:"type:text;default:'{}'" json:"plain_config_json"`
	Status               string     `gorm:"not null;default:'active';index" json:"status"`
	IsPrimary            bool       `gorm:"default:false;index" json:"is_primary"`
	Priority             int        `gorm:"default:0" json:"priority"`
	ExpiresAt            *time.Time `gorm:"index" json:"expires_at,omitempty"`
	LastRotatedAt        *time.Time `json:"last_rotated_at,omitempty"`
	LastUsedAt           *time.Time `json:"last_used_at,omitempty"`
	HealthJSON           string     `gorm:"type:text;default:'{}'" json:"health_json"`
}
