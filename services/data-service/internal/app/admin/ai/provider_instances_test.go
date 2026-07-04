package ai

import (
	"testing"

	domainai "github.com/movscript/movscript/internal/domain/ai"
	infraai "github.com/movscript/movscript/internal/infra/ai"
)

func TestProviderInstanceCapabilitiesExposeNewAPIExtensions(t *testing.T) {
	def := infraai.GetAdapterDef(infraai.AdapterNewAPI)
	capabilities := providerInstanceAIGatewayCapabilities(def)

	for _, want := range []string{
		"model.list",
		"chat.completions",
		"responses",
		"image.generation",
		"video.task",
		"video.poll",
		"audio.generation",
		"embedding.create",
		"rerank.create",
		"moderation.create",
		"realtime.websocket",
	} {
		if !providerInstanceHasCapability(capabilities, want) {
			t.Fatalf("capabilities = %#v, missing %q", capabilities, want)
		}
	}
	if providerInstanceHasCapability(capabilities, "video.cancel") {
		t.Fatalf("capabilities = %#v, New API must not expose video.cancel before a stable cancel endpoint exists", capabilities)
	}
}

func TestProviderInstanceFromNewAPICredentialMarksRequiredFields(t *testing.T) {
	instance := providerInstanceFromCredential(domainai.Credential{
		ID:           7,
		AdapterType:  infraai.AdapterNewAPI,
		DisplayName:  "New API",
		BaseURL:      "https://newapi.example.com/v1",
		EncryptedKey: "encrypted-key",
		MaskedKey:    "sk-***",
		IsEnabled:    true,
	})

	if instance.ID != "ai_gateway:credential:7" || instance.Adapter != infraai.AdapterNewAPI || !instance.Configured {
		t.Fatalf("instance = %+v, want configured New API credential instance", instance)
	}
	if !providerInstanceHasField(instance.ConfigFields, "base_url", true, true) {
		t.Fatalf("config fields = %+v, want configured base_url field", instance.ConfigFields)
	}
	if !providerInstanceHasField(instance.SecretFields, "api_key", true, true) {
		t.Fatalf("secret fields = %+v, want configured api_key field", instance.SecretFields)
	}

	missingBaseURL := providerInstanceFromCredential(domainai.Credential{
		ID:           8,
		AdapterType:  infraai.AdapterNewAPI,
		DisplayName:  "New API missing base",
		EncryptedKey: "encrypted-key",
		MaskedKey:    "sk-***",
		IsEnabled:    true,
	})
	if missingBaseURL.Configured {
		t.Fatalf("instance = %+v, want missing base_url to be unconfigured", missingBaseURL)
	}
	if !providerInstanceHasField(missingBaseURL.ConfigFields, "base_url", true, false) {
		t.Fatalf("config fields = %+v, want required missing base_url field", missingBaseURL.ConfigFields)
	}
}

func providerInstanceHasField(fields []ProviderInstanceField, key string, required bool, configured bool) bool {
	for _, field := range fields {
		if field.Key == key && field.Required == required && field.Configured == configured {
			return true
		}
	}
	return false
}

func providerInstanceHasCapability(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
