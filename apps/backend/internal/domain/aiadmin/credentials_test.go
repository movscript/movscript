package aiadmin

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestResolveBaseURLPrefersCredentialOverride(t *testing.T) {
	got := ResolveBaseURL(" https://default.example ", map[string]string{"base_url": " https://custom.example "})
	if got != "https://custom.example" {
		t.Fatalf("base url = %q, want custom", got)
	}
}

func TestNewCredentialAppliesDefaults(t *testing.T) {
	cred := NewCredential(NewCredentialSpec{
		AdapterType:          " openai ",
		DisplayName:          " Main ",
		BaseURL:              " https://api.example ",
		EncryptedKey:         "encrypted",
		MaskedKey:            "sk****",
		FilesAPIEnabled:      true,
		FilesAPIBaseURL:      " https://files.example ",
		FilesAPIEncryptedKey: "files-encrypted",
		FilesAPIMaskedKey:    "fk****",
	})
	if cred.AdapterType != "openai" || cred.DisplayName != "Main" || cred.BaseURL != "https://api.example" || !cred.IsEnabled {
		t.Fatalf("unexpected credential identity: %+v", cred)
	}
	if !cred.FilesAPIEnabled || cred.FilesAPIBaseURL != "https://files.example" || cred.FilesAPIEncryptedKey != "files-encrypted" || cred.FilesAPIMaskedKey != "fk****" {
		t.Fatalf("unexpected files api fields: %+v", cred)
	}
	modelCred := cred.ToModel()
	modelCred.ID = 13
	roundTrip := CredentialFromModel(modelCred)
	if roundTrip.ID != 13 || roundTrip.AdapterType != "openai" || roundTrip.DisplayName != "Main" {
		t.Fatalf("unexpected credential round-trip: %+v", roundTrip)
	}
}

func TestModelConfigJSONUsesPricingMode(t *testing.T) {
	body, err := json.Marshal(ModelConfig{CustomPricingMode: "per_image"})
	if err != nil {
		t.Fatal(err)
	}
	got := string(body)
	if !strings.Contains(got, `"custom_pricing_mode":"per_image"`) {
		t.Fatalf("missing custom_pricing_mode in JSON: %s", got)
	}
	if strings.Contains(got, "custom_billing_mode") {
		t.Fatalf("unexpected legacy custom_billing_mode in JSON: %s", got)
	}
}
