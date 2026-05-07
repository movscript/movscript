package aiadmin

import (
	"strings"
	"time"
)

type NewCredentialSpec struct {
	AdapterType          string
	DisplayName          string
	BaseURL              string
	EncryptedKey         string
	MaskedKey            string
	FilesAPIEnabled      bool
	FilesAPIBaseURL      string
	FilesAPIEncryptedKey string
	FilesAPIMaskedKey    string
}

type Credential struct {
	ID                   uint          `json:"ID"`
	AdapterType          string        `json:"adapter_type"`
	DisplayName          string        `json:"display_name"`
	BaseURL              string        `json:"base_url"`
	EncryptedKey         string        `json:"-"`
	MaskedKey            string        `json:"masked_key"`
	IsEnabled            bool          `json:"is_enabled"`
	OrgID                *uint         `json:"org_id,omitempty"`
	Models               []ModelConfig `json:"models,omitempty"`
	FilesAPIEnabled      bool          `json:"files_api_enabled"`
	FilesAPIBaseURL      string        `json:"files_api_base_url"`
	FilesAPIEncryptedKey string        `json:"-"`
	FilesAPIMaskedKey    string        `json:"files_api_masked_key"`
	CreatedAt            time.Time     `json:"CreatedAt"`
	UpdatedAt            time.Time     `json:"UpdatedAt"`
}

type NewModelConfigSpec struct {
	CredentialID          uint
	ModelDefID            string
	ModelIDOverride       string
	IsEnabled             *bool
	Priority              int
	CreditsInputPer1M     float64
	CreditsOutputPer1M    float64
	CreditsPerImage       float64
	CreditsPerSecond      float64
	CreditsPerCall        float64
	CustomDisplayName     string
	ShortName             string
	CustomCapabilities    string
	CustomPricingMode     string
	CustomAcceptsImage    bool
	CustomMaxInputImages  int
	CustomMaxInputVideos  int
	CustomImageEditField  string
	CustomSupportedParams string
}

type ModelConfig struct {
	ID                    uint      `json:"ID"`
	CredentialID          uint      `json:"credential_id"`
	ModelDefID            string    `json:"model_def_id"`
	ModelIDOverride       string    `json:"model_id_override"`
	IsEnabled             bool      `json:"is_enabled"`
	Priority              int       `json:"priority"`
	CreditsInputPer1M     float64   `json:"credits_input_per_1m"`
	CreditsOutputPer1M    float64   `json:"credits_output_per_1m"`
	CreditsPerImage       float64   `json:"credits_per_image"`
	CreditsPerSecond      float64   `json:"credits_per_second"`
	CreditsPerCall        float64   `json:"credits_per_call"`
	CustomDisplayName     string    `json:"custom_display_name"`
	ShortName             string    `json:"short_name"`
	CustomCapabilities    string    `json:"custom_capabilities"`
	CustomPricingMode     string    `json:"custom_pricing_mode"`
	CustomAcceptsImage    bool      `json:"custom_accepts_image"`
	CustomMaxInputImages  int       `json:"custom_max_input_images"`
	CustomMaxInputVideos  int       `json:"custom_max_input_videos"`
	CustomImageEditField  string    `json:"custom_image_edit_field"`
	CustomSupportedParams string    `json:"custom_supported_params"`
	CreatedAt             time.Time `json:"CreatedAt"`
	UpdatedAt             time.Time `json:"UpdatedAt"`
}

func ResolveBaseURL(defaultBaseURL string, credentials map[string]string) string {
	if credentials != nil {
		if value := strings.TrimSpace(credentials["base_url"]); value != "" {
			return value
		}
	}
	return strings.TrimSpace(defaultBaseURL)
}

func NewCredential(spec NewCredentialSpec) Credential {
	return Credential{
		AdapterType:          strings.TrimSpace(spec.AdapterType),
		DisplayName:          strings.TrimSpace(spec.DisplayName),
		BaseURL:              strings.TrimSpace(spec.BaseURL),
		EncryptedKey:         spec.EncryptedKey,
		MaskedKey:            spec.MaskedKey,
		IsEnabled:            true,
		FilesAPIEnabled:      spec.FilesAPIEnabled,
		FilesAPIBaseURL:      strings.TrimSpace(spec.FilesAPIBaseURL),
		FilesAPIEncryptedKey: spec.FilesAPIEncryptedKey,
		FilesAPIMaskedKey:    spec.FilesAPIMaskedKey,
	}
}

func NewModelConfig(spec NewModelConfigSpec) ModelConfig {
	enabled := true
	if spec.IsEnabled != nil {
		enabled = *spec.IsEnabled
	}
	return ModelConfig{
		CredentialID:          spec.CredentialID,
		ModelDefID:            spec.ModelDefID,
		ModelIDOverride:       spec.ModelIDOverride,
		IsEnabled:             enabled,
		Priority:              spec.Priority,
		CreditsInputPer1M:     spec.CreditsInputPer1M,
		CreditsOutputPer1M:    spec.CreditsOutputPer1M,
		CreditsPerImage:       spec.CreditsPerImage,
		CreditsPerSecond:      spec.CreditsPerSecond,
		CreditsPerCall:        spec.CreditsPerCall,
		CustomDisplayName:     spec.CustomDisplayName,
		ShortName:             spec.ShortName,
		CustomCapabilities:    spec.CustomCapabilities,
		CustomPricingMode:     spec.CustomPricingMode,
		CustomAcceptsImage:    spec.CustomAcceptsImage,
		CustomMaxInputImages:  spec.CustomMaxInputImages,
		CustomMaxInputVideos:  spec.CustomMaxInputVideos,
		CustomImageEditField:  spec.CustomImageEditField,
		CustomSupportedParams: spec.CustomSupportedParams,
	}
}
