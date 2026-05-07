package aiadmin

import (
	"strings"
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
	ID                   uint
	AdapterType          string
	DisplayName          string
	BaseURL              string
	EncryptedKey         string
	MaskedKey            string
	IsEnabled            bool
	OrgID                *uint
	FilesAPIEnabled      bool
	FilesAPIBaseURL      string
	FilesAPIEncryptedKey string
	FilesAPIMaskedKey    string
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
