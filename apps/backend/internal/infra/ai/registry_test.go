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

func TestRegistryBuildProviderUsesCredentialAdapterOverCatalogModelDef(t *testing.T) {
	registry := NewRegistry(nil, nil)
	provider, err := registry.buildProvider(persistencemodel.AICredential{
		AdapterType: AdapterVolcen,
		BaseURL:     "https://ark.cn-beijing.volces.com/api/v3",
	}, &ModelDef{AdapterType: AdapterOpenAICompat})
	if err != nil {
		t.Fatalf("buildProvider returned error: %v", err)
	}
	if _, ok := provider.(*VolcenAdapter); !ok {
		t.Fatalf("provider = %T, want *VolcenAdapter", provider)
	}
}
