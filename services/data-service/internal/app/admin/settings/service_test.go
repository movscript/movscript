package settings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestSystemHealthThresholdsDefaultUpdateAndValidation(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-settings.db", &persistencemodel.AdminSetting{})
	service := NewService(db)

	defaults, err := service.SystemHealthThresholds(context.Background())
	if err != nil {
		t.Fatalf("SystemHealthThresholds default returned error: %v", err)
	}
	if defaults.ErrorRateWarn != 5 || defaults.FailedJobsWarn != 1 || defaults.SlowRequestsWarn != 5 {
		t.Fatalf("unexpected defaults: %#v", defaults)
	}

	updated, err := service.UpdateSystemHealthThresholds(context.Background(), SystemHealthThresholds{
		ErrorRateWarn:        3,
		ErrorRateCritical:    15,
		FailedJobsWarn:       2,
		FailedJobsCritical:   8,
		SlowRequestsWarn:     4,
		SlowRequestsCritical: 12,
	})
	if err != nil {
		t.Fatalf("UpdateSystemHealthThresholds returned error: %v", err)
	}
	if updated.ErrorRateWarn != 3 || updated.FailedJobsCritical != 8 {
		t.Fatalf("unexpected update response: %#v", updated)
	}
	loaded, err := service.SystemHealthThresholds(context.Background())
	if err != nil {
		t.Fatalf("SystemHealthThresholds loaded returned error: %v", err)
	}
	if loaded != updated {
		t.Fatalf("loaded thresholds = %#v, want %#v", loaded, updated)
	}

	_, err = service.UpdateSystemHealthThresholds(context.Background(), SystemHealthThresholds{
		ErrorRateWarn:     30,
		ErrorRateCritical: 10,
	})
	if !errors.Is(err, ErrInvalidSystemHealthThresholds) {
		t.Fatalf("invalid thresholds error = %v, want ErrInvalidSystemHealthThresholds", err)
	}
}

func TestGenerationToolsSettingsDefaultUpdateEncryptionAndMasking(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-generation-tools-settings.db", &persistencemodel.AdminSetting{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

	defaults, err := service.GenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("GenerationToolsSettings default returned error: %v", err)
	}
	if len(defaults.Servers) != 0 || !defaults.AllowLocal {
		t.Fatalf("unexpected generation tools defaults: %#v", defaults)
	}

	updated, err := service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal:       true,
		DefaultServerID:  "shared-comfy",
		DefaultServerIDs: map[string]string{"comfyui": "shared-comfy", "webui": "shared-webui"},
		Servers: []GenerationToolServer{
			{
				ID:        "shared-comfy",
				Type:      "comfyui",
				Name:      " Shared Comfy ",
				Enabled:   true,
				BaseURL:   " http://gpu.example.com:8188/ ",
				TimeoutMS: 90000,
				Priority:  10,
				AuthKind:  "bearer",
				Token:     "comfy-secret",
				Tags:      []string{" gpu ", "gpu", "sdxl"},
			},
			{
				ID:        "shared-webui",
				Type:      "webui",
				Name:      "Shared WebUI",
				Enabled:   true,
				BaseURL:   "https://webui.example.com/",
				TimeoutMS: 180000,
				Priority:  20,
				AuthKind:  "basic",
				Username:  " operator ",
				Password:  "webui-secret",
			},
		},
	})
	if err != nil {
		t.Fatalf("UpdateGenerationToolsSettings returned error: %v", err)
	}
	if updated.Servers[0].Token != "" || !updated.Servers[0].TokenSet ||
		updated.Servers[1].Password != "" || !updated.Servers[1].PasswordSet {
		t.Fatalf("update response did not mask secrets: %#v", updated.Servers)
	}
	if updated.Servers[0].Scope != "admin" || updated.Servers[0].BaseURL != "http://gpu.example.com:8188" ||
		updated.Servers[0].Name != "Shared Comfy" || len(updated.Servers[0].Tags) != 2 ||
		updated.Servers[1].Username != "operator" {
		t.Fatalf("update response did not normalize settings: %#v", updated.Servers)
	}
	if updated.DefaultServerIDs["comfyui"] != "shared-comfy" || updated.DefaultServerIDs["webui"] != "shared-webui" {
		t.Fatalf("update response did not preserve per-type defaults: %#v", updated.DefaultServerIDs)
	}

	var record persistencemodel.AdminSetting
	if err := db.Where("key = ?", GenerationToolsSettingsKey).First(&record).Error; err != nil {
		t.Fatalf("load stored generation tools settings: %v", err)
	}
	if record.ValueJSON == "" || !json.Valid([]byte(record.ValueJSON)) {
		t.Fatalf("stored generation tools settings are not valid json: %q", record.ValueJSON)
	}
	if strings.Contains(record.ValueJSON, "comfy-secret") || strings.Contains(record.ValueJSON, "webui-secret") {
		t.Fatalf("stored generation tools settings leaked plaintext secrets: %s", record.ValueJSON)
	}

	loaded, err := service.GenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("GenerationToolsSettings loaded returned error: %v", err)
	}
	if loaded.Servers[0].Token != "comfy-secret" || loaded.Servers[1].Password != "webui-secret" {
		t.Fatalf("loaded generation tools settings did not decrypt secrets: %#v", loaded.Servers)
	}
	if loaded.DefaultServerIDs["comfyui"] != "shared-comfy" || loaded.DefaultServerIDs["webui"] != "shared-webui" {
		t.Fatalf("loaded generation tools settings lost per-type defaults: %#v", loaded.DefaultServerIDs)
	}

	publicSettings, err := service.PublicGenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("PublicGenerationToolsSettings returned error: %v", err)
	}
	if publicSettings.Servers[0].Token != "" || !publicSettings.Servers[0].TokenSet ||
		publicSettings.Servers[1].Password != "" || !publicSettings.Servers[1].PasswordSet {
		t.Fatalf("public generation tools settings did not mask secrets: %#v", publicSettings.Servers)
	}
}

func TestGenerationToolsSettingsPreservesExistingSecrets(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-generation-tools-settings-preserve.db", &persistencemodel.AdminSetting{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	_, err := service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal: true,
		Servers: []GenerationToolServer{{
			ID:        "shared-webui",
			Type:      "webui",
			Name:      "Shared WebUI",
			Enabled:   true,
			BaseURL:   "https://webui.example.com",
			TimeoutMS: 120000,
			AuthKind:  "basic",
			Username:  "operator",
			Password:  "webui-secret",
		}},
	})
	if err != nil {
		t.Fatalf("seed generation tools settings: %v", err)
	}
	_, err = service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal: false,
		Servers: []GenerationToolServer{{
			ID:        "shared-webui",
			Type:      "webui",
			Name:      "Renamed WebUI",
			Enabled:   true,
			BaseURL:   "https://webui.example.com",
			TimeoutMS: 120000,
			AuthKind:  "basic",
			Username:  "operator",
		}},
	})
	if err != nil {
		t.Fatalf("update generation tools settings without secret: %v", err)
	}
	loaded, err := service.GenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("load generation tools settings: %v", err)
	}
	if loaded.AllowLocal || loaded.Servers[0].Name != "Renamed WebUI" || loaded.Servers[0].Password != "webui-secret" {
		t.Fatalf("secret was not preserved across update: %#v", loaded)
	}
}

func TestGenerationToolsSettingsClearsSecretsWhenAuthKindChanges(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-generation-tools-settings-clear-secrets.db", &persistencemodel.AdminSetting{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	_, err := service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal: true,
		Servers: []GenerationToolServer{{
			ID:        "shared-comfy",
			Type:      "comfyui",
			Name:      "Shared Comfy",
			Enabled:   true,
			BaseURL:   "https://comfy.example.com",
			TimeoutMS: 120000,
			AuthKind:  "bearer",
			Token:     "comfy-secret",
		}},
	})
	if err != nil {
		t.Fatalf("seed generation tools settings: %v", err)
	}
	updated, err := service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal: true,
		Servers: []GenerationToolServer{{
			ID:        "shared-comfy",
			Type:      "comfyui",
			Name:      "Shared Comfy",
			Enabled:   true,
			BaseURL:   "https://comfy.example.com",
			TimeoutMS: 120000,
			AuthKind:  "none",
		}},
	})
	if err != nil {
		t.Fatalf("update generation tools settings without auth: %v", err)
	}
	if updated.Servers[0].TokenSet || updated.Servers[0].PasswordSet {
		t.Fatalf("secret flags were not cleared after auth kind change: %#v", updated.Servers[0])
	}
	loaded, err := service.GenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("load generation tools settings: %v", err)
	}
	if loaded.Servers[0].Token != "" || loaded.Servers[0].Password != "" {
		t.Fatalf("secrets were not cleared after auth kind change: %#v", loaded.Servers[0])
	}
}

func TestOrgGenerationToolsSettingsUsesOrgScopeAndSeparateSecrets(t *testing.T) {
	db := testutil.OpenSQLite(t, "org-generation-tools-settings.db", &persistencemodel.AdminSetting{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

	_, err := service.UpdateGenerationToolsSettings(context.Background(), GenerationToolsSettings{
		AllowLocal: true,
		Servers: []GenerationToolServer{{
			ID:        "admin-comfy",
			Type:      "comfyui",
			Enabled:   true,
			BaseURL:   "https://admin-gpu.example.com",
			TimeoutMS: 120000,
			AuthKind:  "bearer",
			Token:     "admin-secret",
		}},
	})
	if err != nil {
		t.Fatalf("seed admin generation tools settings: %v", err)
	}
	updated, err := service.UpdateOrgGenerationToolsSettings(context.Background(), 42, GenerationToolsSettings{
		AllowLocal: false,
		Servers: []GenerationToolServer{{
			ID:        "org-webui",
			Scope:     "admin",
			Type:      "webui",
			Enabled:   true,
			BaseURL:   "https://org-webui.example.com",
			TimeoutMS: 120000,
			AuthKind:  "basic",
			Username:  "operator",
			Password:  "org-secret",
		}},
	})
	if err != nil {
		t.Fatalf("UpdateOrgGenerationToolsSettings returned error: %v", err)
	}
	if updated.Servers[0].Scope != "org" || updated.Servers[0].Password != "" || !updated.Servers[0].PasswordSet {
		t.Fatalf("org update did not scope or mask response: %#v", updated.Servers[0])
	}

	adminLoaded, err := service.GenerationToolsSettings(context.Background())
	if err != nil {
		t.Fatalf("load admin generation tools settings: %v", err)
	}
	orgLoaded, err := service.OrgGenerationToolsSettings(context.Background(), 42)
	if err != nil {
		t.Fatalf("load org generation tools settings: %v", err)
	}
	if adminLoaded.Servers[0].Token != "admin-secret" || orgLoaded.Servers[0].Password != "org-secret" {
		t.Fatalf("settings were not isolated or decrypted: admin=%#v org=%#v", adminLoaded.Servers, orgLoaded.Servers)
	}
	if orgLoaded.AllowLocal {
		t.Fatalf("org allow_local was not persisted: %#v", orgLoaded)
	}
	var orgRecord persistencemodel.AdminSetting
	if err := db.Where("key = ?", OrgGenerationToolsSettingsKey(42)).First(&orgRecord).Error; err != nil {
		t.Fatalf("load stored org generation tools settings: %v", err)
	}
	if strings.Contains(orgRecord.ValueJSON, "org-secret") || strings.Contains(orgRecord.ValueJSON, "admin-secret") {
		t.Fatalf("stored org settings leaked plaintext secret: %s", orgRecord.ValueJSON)
	}
}

func TestGenerationToolsSettingsValidation(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-generation-tools-settings-validation.db", &persistencemodel.AdminSetting{})
	service := NewService(db)

	tests := []struct {
		name     string
		settings GenerationToolsSettings
	}{
		{
			name: "invalid enabled url",
			settings: GenerationToolsSettings{Servers: []GenerationToolServer{{
				Type: "comfyui", Enabled: true, BaseURL: "ftp://localhost:8188", TimeoutMS: 120000,
			}}},
		},
		{
			name: "invalid timeout",
			settings: GenerationToolsSettings{Servers: []GenerationToolServer{{
				Type: "webui", Enabled: true, BaseURL: "http://localhost:7860", TimeoutMS: 999,
			}}},
		},
		{
			name: "basic password without username",
			settings: GenerationToolsSettings{Servers: []GenerationToolServer{{
				Type: "webui", Enabled: true, BaseURL: "http://localhost:7860", TimeoutMS: 120000, AuthKind: "basic", Password: "secret",
			}}},
		},
		{
			name: "invalid server type",
			settings: GenerationToolsSettings{Servers: []GenerationToolServer{{
				Type: "automatic1111", Enabled: true, BaseURL: "http://localhost:7860", TimeoutMS: 120000, AuthKind: "none",
			}}},
		},
		{
			name: "invalid auth kind",
			settings: GenerationToolsSettings{Servers: []GenerationToolServer{{
				Type: "webui", Enabled: true, BaseURL: "http://localhost:7860", TimeoutMS: 120000, AuthKind: "api-key",
			}}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.UpdateGenerationToolsSettings(context.Background(), tt.settings)
			if !errors.Is(err, ErrInvalidGenerationToolsSettings) {
				t.Fatalf("UpdateGenerationToolsSettings error = %v, want ErrInvalidGenerationToolsSettings", err)
			}
		})
	}
}
