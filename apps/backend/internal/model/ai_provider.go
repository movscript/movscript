package model

import "gorm.io/gorm"

// AICredential stores authentication credentials for one provider family.
// One credential set can activate multiple admin-declared model configs.
type AICredential struct {
	gorm.Model
	AdapterType  string          `gorm:"not null;index" json:"adapter_type"` // adapter type constant
	DisplayName  string          `gorm:"not null" json:"display_name"`       // user-assigned label
	BaseURL      string          `json:"base_url"`                           // optional override (openai_compat families)
	EncryptedKey string          `json:"-"`
	MaskedKey    string          `gorm:"-" json:"masked_key"`
	IsEnabled    bool            `gorm:"default:true" json:"is_enabled"`
	OrgID        *uint           `gorm:"index" json:"org_id,omitempty"` // nil = instance-level
	Models       []AIModelConfig `gorm:"foreignKey:CredentialID" json:"models,omitempty"`

	// AI Files API — independent from the main inference credentials.
	// When enabled, media is uploaded to the Files API before AI tasks run.
	// FilesAPIBaseURL and FilesAPIKey are optional; if empty they fall back to BaseURL/EncryptedKey.
	FilesAPIEnabled      bool   `gorm:"default:false" json:"files_api_enabled"`
	FilesAPIBaseURL      string `json:"files_api_base_url"`
	FilesAPIEncryptedKey string `json:"-"`
	FilesAPIMaskedKey    string `gorm:"-" json:"files_api_masked_key"`
}

// AIModelConfig registers a model for use and stores all metadata needed to call it.
// Capability/billing data comes from the Custom* fields (admin-declared).
// Generation parameters inherit from the credential adapter by default; when
// CustomSupportedParams is non-empty, it becomes the model-level override.
type AIModelConfig struct {
	gorm.Model
	CredentialID uint `gorm:"not null;index" json:"credential_id"`
	// ModelDefID is the logical model identifier.
	// Usually this is the raw API model ID (e.g. "gpt-4o", "gemini-2.0-flash").
	ModelDefID string `gorm:"not null" json:"model_def_id"`
	// ModelIDOverride replaces the API-level model ID sent in requests.
	// Use this when display/routing identity differs from the provider model ID.
	ModelIDOverride string `json:"model_id_override"`
	IsEnabled       bool   `gorm:"default:true" json:"is_enabled"`
	// Priority controls provider selection when multiple configs serve the same capability.
	// Higher = preferred. Equal priority configs are round-robined.
	Priority int `gorm:"default:0" json:"priority"`

	// Admin-configured credit prices — semantics depend on BillingMode.
	CreditsInputPer1M  float64 `gorm:"default:0" json:"credits_input_per_1m"`  // per_token: per 1M input tokens
	CreditsOutputPer1M float64 `gorm:"default:0" json:"credits_output_per_1m"` // per_token: per 1M output tokens
	CreditsPerImage    float64 `gorm:"default:0" json:"credits_per_image"`     // per_image
	CreditsPerSecond   float64 `gorm:"default:0" json:"credits_per_second"`    // per_second (video)
	CreditsPerCall     float64 `gorm:"default:0" json:"credits_per_call"`      // per_call (catch-all)

	// Custom metadata — admin-declared capabilities and routing hints.
	CustomDisplayName     string `gorm:"default:''" json:"custom_display_name"`     // human-readable name shown in UI
	ShortName             string `gorm:"default:''" json:"short_name"`              // concise name shown in selectors when set
	CustomCapabilities    string `gorm:"default:''" json:"custom_capabilities"`     // comma-separated: "text", "image", "image_edit", "video", "video_i2v", "video_v2v"
	CustomBillingMode     string `gorm:"default:''" json:"custom_billing_mode"`     // "per_token"|"per_image"|"per_second"|"per_call"
	CustomAcceptsImage    bool   `gorm:"default:false" json:"custom_accepts_image"` // true for image_edit / i2v models
	CustomMaxInputImages  int    `gorm:"default:0" json:"custom_max_input_images"`  // 0=unset, 1=single, -1=unlimited
	CustomMaxInputVideos  int    `gorm:"default:0" json:"custom_max_input_videos"`  // 0=unset, 1=single, -1=unlimited
	CustomImageEditField  string `gorm:"default:''" json:"custom_image_edit_field"` // multipart field for image upload; empty = "image"
	CustomSupportedParams string `gorm:"default:''" json:"custom_supported_params"` // JSON: []ParamDef; ""=adapter default, "[]"=no params
}
