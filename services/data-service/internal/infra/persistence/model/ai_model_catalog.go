package model

import "gorm.io/gorm"

const (
	ModelRouteSourceLocalProvider = "local_provider"
	ModelRouteSourceRelayGateway  = "relay_gateway"
)

// AIModelCatalogEntry is the semantic definition for a MovScript public model.
// Route bindings own provider-specific model ids.
type AIModelCatalogEntry struct {
	gorm.Model
	ModelTemplateKey      string                `gorm:"default:'';index" json:"model_template_key,omitempty"`
	TemplateVersion       string                `gorm:"default:''" json:"template_version,omitempty"`
	PublicModelID         string                `gorm:"not null;index" json:"public_model_id"`
	DisplayName           string                `gorm:"not null" json:"display_name"`
	ShortName             string                `gorm:"default:''" json:"short_name"`
	IsEnabled             bool                  `gorm:"default:true;index" json:"is_enabled"`
	Capabilities          string                `gorm:"default:''" json:"capabilities"`
	AcceptsImage          bool                  `gorm:"default:false" json:"accepts_image"`
	MaxInputImages        int                   `gorm:"default:0" json:"max_input_images"`
	MaxInputVideos        int                   `gorm:"default:0" json:"max_input_videos"`
	InputImageField       string                `gorm:"column:input_image_field;default:''" json:"input_image_field"`
	SupportedParams       string                `gorm:"type:text" json:"supported_params"`
	ParamLimitsJSON       string                `gorm:"type:text;default:''" json:"param_limits_json,omitempty"`
	ModelCapabilitiesJSON string                `gorm:"type:text;default:''" json:"model_capabilities_json,omitempty"`
	RouteBindings         []AIModelRouteBinding `gorm:"foreignKey:CatalogEntryID" json:"route_bindings,omitempty"`
}

// AIModelRouteBinding makes a provider model available through a source/route.
// In community it points at a credential; in self-hosted relay gateway mode it points
// at a relay gateway group.
type AIModelRouteBinding struct {
	gorm.Model
	CatalogEntryID     uint                 `gorm:"not null;index" json:"catalog_entry_id"`
	CatalogEntry       *AIModelCatalogEntry `gorm:"foreignKey:CatalogEntryID" json:"-"`
	ComboTemplateKey   string               `gorm:"default:'';index" json:"combo_template_key,omitempty"`
	TemplateVersion    string               `gorm:"default:''" json:"template_version,omitempty"`
	SourceType         string               `gorm:"not null;index" json:"source_type"`
	RouteGroup         string               `gorm:"default:'';index" json:"route_group"`
	ProviderID         string               `gorm:"default:'';index" json:"provider_id,omitempty"`
	AdapterType        string               `gorm:"default:'';index" json:"adapter_type,omitempty"`
	ProviderModelID    string               `gorm:"default:'';index" json:"provider_model_id"`
	ProtocolProfile    string               `gorm:"default:'';index" json:"protocol_profile,omitempty"`
	APIKinds           string               `gorm:"default:''" json:"api_kinds,omitempty"`
	EndpointBaseURL    string               `gorm:"default:''" json:"endpoint_base_url,omitempty"`
	EndpointPathPrefix string               `gorm:"default:''" json:"endpoint_path_prefix,omitempty"`
	EndpointMode       string               `gorm:"default:'inherit'" json:"endpoint_mode,omitempty"`
	CredentialID       *uint                `gorm:"index" json:"-"`
	IsEnabled          bool                 `gorm:"default:true;index" json:"is_enabled"`
	Priority           int                  `gorm:"default:0" json:"priority"`
	CapacityWeight     int                  `gorm:"default:1" json:"capacity_weight"`
	MaxConcurrency     int                  `gorm:"default:0" json:"max_concurrency"`
}
