package ai

import (
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestRegistryProviderModeDoesNotOverrideCredentialAdapter(t *testing.T) {
	registry := NewRegistryWithProviderMode(nil, nil, AdapterLocal)
	provider, err := registry.BuildForModelCredential(persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		BaseURL:     "https://api.example.test/v1",
	}, &ModelDef{AdapterType: AdapterOpenAICompat})
	if err != nil {
		t.Fatalf("BuildForModelCredential returned error: %v", err)
	}
	if _, ok := provider.(*OpenAIAdapter); !ok {
		t.Fatalf("provider = %T, want *OpenAIAdapter", provider)
	}
}
