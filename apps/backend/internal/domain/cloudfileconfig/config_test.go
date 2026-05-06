package cloudfileconfig

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
