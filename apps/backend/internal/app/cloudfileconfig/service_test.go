package cloudfileconfig

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/movscript/movscript/internal/infra/cloudup"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestCreateListsMaskedConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	created, err := service.Create(context.Background(), CreateInput{
		Name:       " TOS Relay ",
		ConfigType: "tos",
		Config: map[string]any{
			"endpoint":   "tos-cn-beijing.volces.com",
			"region":     "cn-beijing",
			"bucket":     "assets",
			"access_key": "abcd1234",
			"secret_key": "secret-value",
		},
		Priority:  3,
		IsEnabled: true,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if created.Name != "TOS Relay" || created.ConfigType != "tos" || created.MaskedConfig == "" {
		t.Fatalf("unexpected created config: %+v", created)
	}

	items, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	var masked map[string]any
	if err := json.Unmarshal([]byte(items[0].MaskedConfig), &masked); err != nil {
		t.Fatalf("unmarshal masked config: %v", err)
	}
	if masked["access_key"] != "abcd****" || masked["secret_key"] != "secr****" {
		t.Fatalf("unexpected masked config: %#v", masked)
	}
}

func TestUpdatePreservesMaskedSensitiveValues(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	created, err := service.Create(context.Background(), CreateInput{
		Name:       "OSS",
		ConfigType: "oss",
		Config: map[string]any{
			"endpoint":          "old.endpoint",
			"bucket":            "assets",
			"access_key_id":     "old-access-key-id",
			"access_key_secret": "old-secret",
		},
		IsEnabled: true,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	updatedName := "OSS Relay"
	updatedPriority := 8
	updatedEnabled := false
	updated, err := service.Update(context.Background(), UpdateInput{
		ID:        created.ID,
		Name:      &updatedName,
		Config:    map[string]any{"endpoint": "new.endpoint", "bucket": "assets", "access_key_id": "****", "access_key_secret": "****"},
		Priority:  &updatedPriority,
		IsEnabled: &updatedEnabled,
	})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.Name != updatedName || updated.Priority != updatedPriority || updated.IsEnabled {
		t.Fatalf("unexpected updated config: %+v", updated)
	}

	stored, err := service.repo.GetConfig(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetConfig returned error: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(stored.ConfigJSON), &raw); err != nil {
		t.Fatalf("unmarshal stored config: %v", err)
	}
	if raw["endpoint"] != "new.endpoint" || raw["access_key_secret"] != "old-secret" {
		t.Fatalf("unexpected stored config: %#v", raw)
	}
}

func TestValidateNameAndConfigType(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	if _, err := service.Create(context.Background(), CreateInput{Name: " ", ConfigType: "s3", Config: map[string]any{}}); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("Create blank name error = %v, want ErrInvalidName", err)
	}
	if _, err := service.Create(context.Background(), CreateInput{Name: "S3", ConfigType: "ftp", Config: map[string]any{}}); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("Create invalid type error = %v, want ErrInvalidConfig", err)
	}
	if _, err := service.Create(context.Background(), CreateInput{Name: "S3", ConfigType: "s3", Config: map[string]any{
		"region": "us-east-1",
		"bucket": "assets",
	}}); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("Create missing secret error = %v, want ErrInvalidConfig", err)
	}
}

func TestUpdateRejectsIncompleteEnabledConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	created, err := service.Create(context.Background(), CreateInput{
		Name:       "TOS",
		ConfigType: "tos",
		Config: map[string]any{
			"endpoint":   "tos-cn-beijing.volces.com",
			"region":     "cn-beijing",
			"bucket":     "assets",
			"access_key": "ak",
			"secret_key": "sk",
		},
		IsEnabled: true,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	if _, err := service.Update(context.Background(), UpdateInput{
		ID:     created.ID,
		Config: map[string]any{"endpoint": "tos-cn-beijing.volces.com", "region": "cn-beijing", "bucket": "assets"},
	}); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("Update incomplete config error = %v, want ErrInvalidConfig", err)
	}
}

func TestTestUploadsSmallProbeWithPlainConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

	created, err := service.Create(context.Background(), CreateInput{
		Name:       "TOS",
		ConfigType: "tos",
		Config: map[string]any{
			"endpoint":   "tos-cn-beijing.volces.com",
			"region":     "cn-beijing",
			"bucket":     "assets",
			"access_key": "ak",
			"secret_key": "sk",
		},
		IsEnabled: false,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	var gotConfig Config
	service.testUpload = func(ctx context.Context, cfg Config, data []byte, filename, mimeType string) (uint, cloudup.UploadResult, error) {
		gotConfig = cfg
		if string(data) != "movscript cloud file config test\n" {
			t.Fatalf("unexpected probe payload: %q", data)
		}
		if filename == "" || mimeType != "text/plain; charset=utf-8" {
			t.Fatalf("unexpected probe upload args: filename=%q mimeType=%q", filename, mimeType)
		}
		return cfg.ID, cloudup.UploadResult{URL: "https://cdn.example.test/" + filename}, nil
	}

	result, err := service.Test(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Test returned error: %v", err)
	}
	if !result.Success || result.URL == "" || result.ConfigID != created.ID {
		t.Fatalf("unexpected test result: %+v", result)
	}
	if gotConfig.ConfigJSON == "" || gotConfig.ConfigJSON == created.ConfigJSON {
		t.Fatalf("expected decrypted plain config json, got %q", gotConfig.ConfigJSON)
	}
}

func TestTestReturnsFailureResultForUploadError(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	created, err := service.Create(context.Background(), CreateInput{
		Name:       "S3",
		ConfigType: "s3",
		Config: map[string]any{
			"region":     "us-east-1",
			"bucket":     "assets",
			"access_key": "ak",
			"secret_key": "sk",
		},
		IsEnabled: true,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	service.testUpload = func(context.Context, Config, []byte, string, string) (uint, cloudup.UploadResult, error) {
		return 0, cloudup.UploadResult{}, errors.New("upload failed")
	}

	result, err := service.Test(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Test returned error: %v", err)
	}
	if result.Success || result.Message != "upload failed" {
		t.Fatalf("unexpected failure result: %+v", result)
	}
}

func TestDeleteMissingConfigReturnsNotFound(t *testing.T) {
	db := testutil.OpenSQLite(t, "cloudfileconfig.db", &persistencemodel.CloudFileConfig{})
	service := NewService(db, "")

	if err := service.Delete(context.Background(), 99); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Delete missing error = %v, want ErrNotFound", err)
	}
}
