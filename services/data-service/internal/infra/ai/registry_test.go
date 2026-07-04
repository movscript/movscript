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

func TestRegistryBuildsNewAPIAdapter(t *testing.T) {
	registry := NewRegistry(nil, nil)
	provider, err := registry.buildProvider(persistencemodel.AICredential{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
	}, &ModelDef{AdapterType: AdapterOpenAICompat})
	if err != nil {
		t.Fatalf("buildProvider returned error: %v", err)
	}
	adapter, ok := provider.(*NewAPIAdapter)
	if !ok {
		t.Fatalf("provider = %T, want *NewAPIAdapter", provider)
	}
	if adapter.BaseURL != "https://newapi.test/v1" {
		t.Fatalf("BaseURL = %q", adapter.BaseURL)
	}
}
