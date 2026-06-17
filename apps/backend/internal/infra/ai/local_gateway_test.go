package ai

import (
	"context"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestConfigureLocalGatewayDefaultsEnablesDeterministicLocalProvider(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-local-gateway.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("local gateway defaults test should not create legacy ai_model_configs")
	}
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, true); err != nil {
		t.Fatalf("ConfigureLocalGatewayDefaults enable returned error: %v", err)
	}

	var entry persistencemodel.AIModelCatalogEntry
	if err := db.Where("public_model_id = ? AND provider_model_id = ?", ManagedLocalGatewayModel, ManagedLocalGatewayModel).First(&entry).Error; err != nil {
		t.Fatalf("load managed local catalog entry: %v", err)
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := db.Where("catalog_entry_id = ? AND source_type = ?", entry.ID, persistencemodel.ModelRouteSourceLocalProvider).First(&binding).Error; err != nil {
		t.Fatalf("load managed local route binding: %v", err)
	}
	var cred persistencemodel.AICredential
	if binding.CredentialID == nil {
		t.Fatal("managed local route binding missing credential id")
	}
	if err := db.First(&cred, *binding.CredentialID).Error; err != nil {
		t.Fatalf("load managed local credential: %v", err)
	}
	def := catalogEntryDef(entry)

	registry := NewRegistryWithProviderMode(db, nil, "local")
	provider, err := registry.BuildForModelCredential(cred, def)
	if err != nil {
		t.Fatalf("BuildForModelCredential returned error: %v", err)
	}
	if cred.AdapterType != AdapterLocal || !modelHasCapability(def, CapabilityText) {
		t.Fatalf("unexpected local model def: %+v", def)
	}
	resp, err := provider.TextGenerate(context.Background(), TextRequest{
		Messages: []Message{{Role: "user", Content: "hello local mode"}},
	})
	if err != nil {
		t.Fatalf("TextGenerate returned error: %v", err)
	}
	if !strings.Contains(resp.Content, "MovScript local AI gateway response") {
		t.Fatalf("local response = %q", resp.Content)
	}
}

func TestConfigureLocalGatewayDefaultsRemovesManagedLocalProvider(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-local-gateway-disable.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, true); err != nil {
		t.Fatalf("enable local gateway defaults: %v", err)
	}
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, false); err != nil {
		t.Fatalf("remove local gateway defaults: %v", err)
	}

	var credentialCount int64
	if err := db.Model(&persistencemodel.AICredential{}).
		Where("adapter_type = ? AND display_name = ? AND base_url = ?", AdapterLocal, ManagedLocalGatewayName, "movscript://local").
		Count(&credentialCount).Error; err != nil {
		t.Fatalf("count managed local credential: %v", err)
	}
	if credentialCount != 0 {
		t.Fatalf("managed local credential count = %d, want 0", credentialCount)
	}

	var entryCount int64
	if err := db.Model(&persistencemodel.AIModelCatalogEntry{}).
		Where("public_model_id = ? AND provider_model_id = ?", ManagedLocalGatewayModel, ManagedLocalGatewayModel).
		Count(&entryCount).Error; err != nil {
		t.Fatalf("count managed local catalog entry: %v", err)
	}
	if entryCount != 0 {
		t.Fatalf("managed local catalog entry count = %d, want 0", entryCount)
	}

	var bindingCount int64
	if err := db.Model(&persistencemodel.AIModelRouteBinding{}).Count(&bindingCount).Error; err != nil {
		t.Fatalf("count managed local route bindings: %v", err)
	}
	if bindingCount != 0 {
		t.Fatalf("managed local route binding count = %d, want 0", bindingCount)
	}
}
