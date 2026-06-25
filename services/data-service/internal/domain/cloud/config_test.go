package cloud

import (
	"encoding/json"
	"testing"
)

func TestValidConfigType(t *testing.T) {
	if !ValidConfigType(TypeS3) || !ValidConfigType(TypeOSS) || !ValidConfigType(TypeTOS) {
		t.Fatal("expected built-in cloud config types to be valid")
	}
	if ValidConfigType("ftp") {
		t.Fatal("unexpected valid config type")
	}
}

func TestMissingRequiredConfigFields(t *testing.T) {
	missing := MissingRequiredConfigFields(TypeTOS, map[string]any{
		"endpoint":   "tos-cn-beijing.volces.com",
		"region":     "cn-beijing",
		"bucket":     "assets",
		"access_key": "****",
	})
	if len(missing) != 2 || missing[0] != "access_key" || missing[1] != "secret_key" {
		t.Fatalf("missing = %#v, want access_key and secret_key", missing)
	}

	missing = MissingRequiredConfigFields(TypeOSS, map[string]any{
		"endpoint":          "oss-cn-hangzhou.aliyuncs.com",
		"bucket":            "assets",
		"access_key_id":     "ak",
		"access_key_secret": "secret",
	})
	if len(missing) != 0 {
		t.Fatalf("missing = %#v, want empty", missing)
	}

	if got := RequiredConfigFields("ftp"); got != nil {
		t.Fatalf("required fields for unknown type = %#v, want nil", got)
	}
}

func TestNewConfigTrimsNameAndType(t *testing.T) {
	cfg := NewConfig(NewConfigSpec{Name: " S3 ", ConfigType: " s3 ", ConfigJSON: "{}"})
	if cfg.Name != "S3" || cfg.ConfigType != TypeS3 || cfg.ConfigJSON != "{}" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	modelCfg := cfg.ToModel()
	modelCfg.ID = 8
	roundTrip := ConfigFromModel(modelCfg)
	if roundTrip.ID != 8 || roundTrip.Name != "S3" || roundTrip.ConfigType != TypeS3 {
		t.Fatalf("unexpected config round-trip: %+v", roundTrip)
	}
}

func TestMergeConfigUpdatePreservesMaskedSensitiveValues(t *testing.T) {
	existing := map[string]any{
		"access_key_secret": "old-secret",
		"endpoint":          "old-endpoint",
	}
	incoming := map[string]any{
		"access_key_secret": "****",
		"endpoint":          "new-endpoint",
	}
	merged := MergeConfigUpdate(existing, incoming)
	if merged["access_key_secret"] != "old-secret" {
		t.Fatalf("expected old secret to be preserved, got %#v", merged["access_key_secret"])
	}
	if merged["endpoint"] != "new-endpoint" {
		t.Fatalf("expected endpoint update, got %#v", merged["endpoint"])
	}
	if incoming["access_key_secret"] != "****" {
		t.Fatalf("merge should not mutate incoming map: %#v", incoming)
	}
}

func TestMaskConfig(t *testing.T) {
	raw := MaskConfig(map[string]any{
		"api_key": "abcd1234",
		"region":  "cn",
	})
	var got map[string]any
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	if got["api_key"] != "abcd****" || got["region"] != "cn" {
		t.Fatalf("unexpected masked config: %#v", got)
	}
}
