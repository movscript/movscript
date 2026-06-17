package model

import "gorm.io/gorm"

const (
	ModelRouteSourceLocalProvider = "local_provider"
	ModelRouteSourceNewAPI        = "new_api"
)

// AIModelCatalogEntry is the semantic definition for a concrete provider model.
// ProviderModelID is the model id sent to provider/new-api. PublicModelID is
// the stable id shown to MovScript clients.
type AIModelCatalogEntry struct {
	gorm.Model
	PublicModelID      string                `gorm:"not null;index" json:"public_model_id"`
	ProviderModelID    string                `gorm:"not null;index" json:"provider_model_id"`
	DisplayName        string                `gorm:"not null" json:"display_name"`
	ShortName          string                `gorm:"default:''" json:"short_name"`
	IsEnabled          bool                  `gorm:"default:true;index" json:"is_enabled"`
	Capabilities       string                `gorm:"default:''" json:"capabilities"`
	PricingMode        string                `gorm:"default:''" json:"pricing_mode"`
	AcceptsImage       bool                  `gorm:"default:false" json:"accepts_image"`
	MaxInputImages     int                   `gorm:"default:0" json:"max_input_images"`
	MaxInputVideos     int                   `gorm:"default:0" json:"max_input_videos"`
	ImageEditField     string                `gorm:"default:''" json:"image_edit_field"`
	SupportedParams    string                `gorm:"type:text" json:"supported_params"`
	CreditsInputPer1M  float64               `gorm:"default:0" json:"credits_input_per_1m"`
	CreditsOutputPer1M float64               `gorm:"default:0" json:"credits_output_per_1m"`
	CreditsPerImage    float64               `gorm:"default:0" json:"credits_per_image"`
	CreditsPerSecond   float64               `gorm:"default:0" json:"credits_per_second"`
	CreditsPerCall     float64               `gorm:"default:0" json:"credits_per_call"`
	RouteBindings      []AIModelRouteBinding `gorm:"foreignKey:CatalogEntryID" json:"route_bindings,omitempty"`
}

// AIModelRouteBinding makes a provider model available through a source/route.
// In community it points at a credential; in enterprise new-api mode it points
// at a new-api group.
type AIModelRouteBinding struct {
	gorm.Model
	CatalogEntryID     uint   `gorm:"not null;index" json:"catalog_entry_id"`
	SourceType         string `gorm:"not null;index" json:"source_type"`
	RouteGroup         string `gorm:"default:'';index" json:"route_group"`
	CredentialID       *uint  `gorm:"index" json:"credential_id,omitempty"`
	IsEnabled          bool   `gorm:"default:true;index" json:"is_enabled"`
	Priority           int    `gorm:"default:0" json:"priority"`
	CapacityWeight     int    `gorm:"default:1" json:"capacity_weight"`
	MaxConcurrency     int    `gorm:"default:0" json:"max_concurrency"`
	LocalModelConfigID *uint  `gorm:"uniqueIndex" json:"-"`
}
