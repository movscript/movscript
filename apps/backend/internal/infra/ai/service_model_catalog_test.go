package ai

import (
	"context"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAIServiceModelCatalogContractMergesLogicalModels(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-catalog-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createTextProviderVariant(t, db, 1, "Busy provider")
	createTextProviderVariant(t, db, 2, "Healthy provider")
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("ListModels() count = %d, want 1: %#v", len(models), models)
	}
	if models[0].ModelID != "gpt-5.2" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("logical model descriptor = %#v, want merged gpt-5.2 without provider name", models[0])
	}

	variants, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{Capability: CapabilityText, ProviderVariants: true})
	if err != nil {
		t.Fatalf("ListModels(provider variants) error = %v", err)
	}
	if len(variants) != 2 || variants[0].ProviderName == "" || variants[0].ModelConfigID == 0 {
		t.Fatalf("provider variant descriptors = %#v, want per-provider entries", variants)
	}
}

func TestAIServiceModelCatalogDefaultFilterIncludesSubtitleAlign(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-catalog-align-default.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariant(t, db, 1, "Align provider", "align-model", 10, CapabilitySubAlign)
	service := NewAIService(db, NewRegistry(db, nil))

	models, err := service.ListModels(context.Background(), providercontract.AIModelListFilter{})
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	for _, model := range models {
		if model.ModelID == "align-model" {
			return
		}
	}
	t.Fatalf("ListModels(default) = %#v, want subtitle_align model", models)
}

func TestAIServiceModelCatalogContractResolvesProviderBinding(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-model-binding-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariant(t, db, 1, "Primary provider", "gpt-5.2", 10, CapabilityText)
	createProviderVariant(t, db, 2, "Image provider", "gpt-image-1", 10, CapabilityImage)
	if err := db.Model(&persistencemodel.AIModelConfig{}).Where("id = ?", 1).Update("model_id_override", "provider-gpt-5.2").Error; err != nil {
		t.Fatalf("set model override: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "provider-gpt-5.2",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if binding.ModelConfigID != 1 || binding.ProviderModelID != "provider-gpt-5.2" || binding.AdapterType != AdapterOpenAICompat || binding.ProviderName != "Primary provider" {
		t.Fatalf("binding = %#v, want provider-backed text route", binding)
	}

	if _, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelID:    "provider-gpt-5.2",
		Capability: CapabilityImage,
	}); err == nil {
		t.Fatal("ResolveModel() for unsupported capability succeeded, want error")
	}
}

func TestAIServiceModelCatalogContractCanResolveLegacyModelConfigID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-model-binding-legacy-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 7},
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Legacy provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:        gorm.Model{ID: 9},
		CredentialID: cred.ID,
		ModelDefID:   "gpt-5.2",
		IsEnabled:    true,
		Priority:     10,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	binding, err := service.ResolveModel(context.Background(), providercontract.AIModelResolveRequest{
		ModelConfigID: cfg.ID,
		Capability:    CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveModel(legacy id) error = %v", err)
	}
	if binding.ModelID != "gpt-5.2" || binding.ModelConfigID != cfg.ID || binding.SelectionReason != "legacy_model_config_id" {
		t.Fatalf("legacy binding = %#v, want logical gpt-5.2", binding)
	}
}
