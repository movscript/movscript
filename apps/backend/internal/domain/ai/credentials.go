package ai

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
	ID                   uint      `json:"ID"`
	AdapterType          string    `json:"adapter_type"`
	DisplayName          string    `json:"display_name"`
	BaseURL              string    `json:"base_url"`
	EncryptedKey         string    `json:"-"`
	MaskedKey            string    `json:"masked_key"`
	IsEnabled            bool      `json:"is_enabled"`
	OrgID                *uint     `json:"org_id,omitempty"`
	FilesAPIEnabled      bool      `json:"files_api_enabled"`
	FilesAPIBaseURL      string    `json:"files_api_base_url"`
	FilesAPIEncryptedKey string    `json:"-"`
	FilesAPIMaskedKey    string    `json:"files_api_masked_key"`
	CreatedAt            time.Time `json:"CreatedAt"`
	UpdatedAt            time.Time `json:"UpdatedAt"`
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
