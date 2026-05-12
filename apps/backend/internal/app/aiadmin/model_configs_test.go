package aiadmin

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/movscript/movscript/internal/app/dto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestModelConfigRejectsInvalidCustomSupportedParamsBeforeSave(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	_, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "bad-video",
		CustomCapabilities:    "video",
		CustomSupportedParams: `[{"key":"duration","type":"select"}]`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}

	cfgs, err := service.ListModelConfigs(ctx, "1")
	if err != nil {
		t.Fatalf("list model configs: %v", err)
	}
	if len(cfgs) != 0 {
		t.Fatalf("expected invalid config not to be saved, got %#v", cfgs)
	}
}

func TestPatchModelConfigRejectsInvalidCustomSupportedParamsAndKeepsExisting(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	validParams := `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`
	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "video-model",
		CustomCapabilities:    "video",
		CustomSupportedParams: validParams,
	})
	if err != nil {
		t.Fatalf("create valid config: %v", err)
	}

	_, err = service.PatchModelConfig(ctx, PatchModelConfigInput{
		ID:                    "1",
		CustomSupportedParams: ptrString(`[{"key":"duration","type":"number","min":10,"max":5}]`),
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}

	got, err := service.GetModelConfig(ctx, "1")
	if err != nil {
		t.Fatalf("get model config: %v", err)
	}
	if got.ID != cfg.ID || got.CustomSupportedParams != validParams {
		t.Fatalf("expected existing params to remain unchanged, got %#v", got)
	}
}

func TestModelConfigSaveUsesCredentialAdapterForProfileValidation(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	params := `{"allow":["duration"],"override":{"duration":{"options":["5"],"default":"5"}}}`
	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "video-model",
		CustomCapabilities:    "video",
		CustomSupportedParams: params,
	})
	if err != nil {
		t.Fatalf("create profile override that inherits adapter param type/label: %v", err)
	}
	if cfg.CustomSupportedParams != params {
		t.Fatalf("expected profile params to be saved, got %#v", cfg.CustomSupportedParams)
	}

	_, err = service.PatchModelConfig(ctx, PatchModelConfigInput{
		ID:                    "1",
		CustomSupportedParams: ptrString(`{"allow":["duration"],"override":{"duration":{"options":["6"],"default":"6"}}}`),
	})
	if err != nil {
		t.Fatalf("patch profile override that inherits adapter param type/label: %v", err)
	}
}

func TestPreviewModelConfigContractReturnsResolvedBackendContract(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video",
		CustomSupportedParams: `{"allow":["duration","resolution"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if len(preview.Capabilities) != 1 || preview.Capabilities[0] != "video" {
		t.Fatalf("unexpected capabilities: %#v", preview.Capabilities)
	}
	if len(preview.SupportedParams) != 2 {
		t.Fatalf("expected two supported params, got %#v", preview.SupportedParams)
	}
	if preview.ParamsSchema["additionalProperties"] != false {
		t.Fatalf("expected closed params schema, got %#v", preview.ParamsSchema)
	}
}

func TestPreviewModelConfigContractRejectsInvalidContract(t *testing.T) {
	service := newTestService(t)
	_, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video",
		CustomSupportedParams: `[{"key":"duration","type":"select"}]`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "aiadmin.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	if err := db.Create(&persistencemodel.AICredential{
		AdapterType: "volcen",
		DisplayName: "Volcen",
		IsEnabled:   true,
	}).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	return NewService(db.Session(&gorm.Session{SkipHooks: true}), []byte("test-encryption-key-32-bytes----"), nil)
}

func ptrString(value string) *string {
	return &value
}
