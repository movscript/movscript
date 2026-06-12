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
		&persistencemodel.AIModelConfig{},
	)
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, true); err != nil {
		t.Fatalf("ConfigureLocalGatewayDefaults enable returned error: %v", err)
	}

	var cfg persistencemodel.AIModelConfig
	if err := db.Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_credentials.adapter_type = ? AND ai_model_configs.model_def_id = ?", AdapterLocal, ManagedLocalGatewayModel).
		First(&cfg).Error; err != nil {
		t.Fatalf("load managed local model config: %v", err)
	}

	registry := NewRegistryWithProviderMode(db, nil, "local")
	provider, def, err := registry.BuildForConfig(cfg)
	if err != nil {
		t.Fatalf("BuildForConfig returned error: %v", err)
	}
	if def.AdapterType != AdapterLocal || !modelHasCapability(def, CapabilityText) {
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

func TestConfigureLocalGatewayDefaultsDisablesManagedLocalProvider(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-local-gateway-disable.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, true); err != nil {
		t.Fatalf("enable local gateway defaults: %v", err)
	}
	if err := ConfigureLocalGatewayDefaults(context.Background(), db, false); err != nil {
		t.Fatalf("disable local gateway defaults: %v", err)
	}

	var cred persistencemodel.AICredential
	if err := db.Where("adapter_type = ? AND display_name = ?", AdapterLocal, ManagedLocalGatewayName).First(&cred).Error; err != nil {
		t.Fatalf("load managed local credential: %v", err)
	}
	if cred.IsEnabled {
		t.Fatal("managed local credential should be disabled when local gateway provider is disabled")
	}
}
