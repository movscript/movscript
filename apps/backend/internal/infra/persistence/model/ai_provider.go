package model

import "gorm.io/gorm"

// AICredential stores authentication credentials for one provider family.
// One credential set can activate multiple admin-declared model configs.
type AICredential struct {
	gorm.Model
	AdapterType  string          `gorm:"not null;index" json:"adapter_type"`
	DisplayName  string          `gorm:"not null" json:"display_name"`
	BaseURL      string          `json:"base_url"`
	EncryptedKey string          `json:"-"`
	MaskedKey    string          `gorm:"-" json:"masked_key"`
	IsEnabled    bool            `gorm:"default:true" json:"is_enabled"`
	OrgID        *uint           `gorm:"index" json:"org_id,omitempty"`
	Models       []AIModelConfig `gorm:"foreignKey:CredentialID" json:"models,omitempty"`

	FilesAPIEnabled      bool   `gorm:"default:false" json:"files_api_enabled"`
	FilesAPIBaseURL      string `json:"files_api_base_url"`
	FilesAPIEncryptedKey string `json:"-"`
	FilesAPIMaskedKey    string `gorm:"-" json:"files_api_masked_key"`
}

// AIModelConfig registers a model and stores metadata needed to call it.
type AIModelConfig struct {
	gorm.Model
	CredentialID          uint    `gorm:"not null;index" json:"credential_id"`
	ModelDefID            string  `gorm:"not null" json:"model_def_id"`
	ModelIDOverride       string  `json:"model_id_override"`
	IsEnabled             bool    `gorm:"default:true" json:"is_enabled"`
	Priority              int     `gorm:"default:0" json:"priority"`
	CreditsInputPer1M     float64 `gorm:"default:0" json:"credits_input_per_1m"`
	CreditsOutputPer1M    float64 `gorm:"default:0" json:"credits_output_per_1m"`
	CreditsPerImage       float64 `gorm:"default:0" json:"credits_per_image"`
	CreditsPerSecond      float64 `gorm:"default:0" json:"credits_per_second"`
	CreditsPerCall        float64 `gorm:"default:0" json:"credits_per_call"`
	CustomDisplayName     string  `gorm:"default:''" json:"custom_display_name"`
	ShortName             string  `gorm:"default:''" json:"short_name"`
	CustomCapabilities    string  `gorm:"default:''" json:"custom_capabilities"`
	CustomPricingMode     string  `gorm:"default:''" json:"custom_pricing_mode"`
	CustomAcceptsImage    bool    `gorm:"default:false" json:"custom_accepts_image"`
	CustomMaxInputImages  int     `gorm:"default:0" json:"custom_max_input_images"`
	CustomMaxInputVideos  int     `gorm:"default:0" json:"custom_max_input_videos"`
	CustomImageEditField  string  `gorm:"default:''" json:"custom_image_edit_field"`
	CustomSupportedParams string  `gorm:"default:''" json:"custom_supported_params"`
}
