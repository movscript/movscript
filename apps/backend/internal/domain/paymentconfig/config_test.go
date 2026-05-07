package paymentconfig

import (
	"encoding/json"
	"testing"
)

func TestValidConfigType(t *testing.T) {
	if !ValidConfigType(TypeAlipay) || !ValidConfigType(TypeWechat) || !ValidConfigType(TypeStripe) {
		t.Fatal("expected built-in payment config types to be valid")
	}
	if ValidConfigType("paypal") {
		t.Fatal("unexpected valid payment config type")
	}
}

func TestValidMode(t *testing.T) {
	if !ValidMode("") || !ValidMode(ModeSandbox) || !ValidMode(ModeLive) {
		t.Fatal("expected empty, sandbox, and live modes to be valid")
	}
	if ValidMode("production") {
		t.Fatal("unexpected valid payment mode")
	}
}

func TestNewConfigNormalizesDefaults(t *testing.T) {
	cfg := NewConfig(NewConfigSpec{
		Name:       " Stripe ",
		ConfigType: TypeStripe,
		ConfigJSON: "{}",
	})
	if cfg.Name != "Stripe" || cfg.ConfigType != TypeStripe || cfg.Mode != ModeSandbox || cfg.Currency != DefaultCurrency || cfg.ConfigJSON != "{}" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	modelCfg := cfg.ToModel()
	modelCfg.ID = 7
	roundTrip := ConfigFromModel(modelCfg)
	if roundTrip.ID != 7 || roundTrip.Name != "Stripe" || roundTrip.Currency != DefaultCurrency {
		t.Fatalf("unexpected config round-trip: %+v", roundTrip)
	}
}

func TestMergeConfigUpdatePreservesMaskedSensitiveValues(t *testing.T) {
	existing := map[string]any{
		"secret_key": "sk_live_old",
		"currency":   "usd",
	}
	incoming := map[string]any{
		"secret_key": "",
		"currency":   "cny",
	}
	merged := MergeConfigUpdate(existing, incoming)
	if merged["secret_key"] != "sk_live_old" {
		t.Fatalf("expected old secret to be preserved, got %#v", merged["secret_key"])
	}
	if merged["currency"] != "cny" {
		t.Fatalf("expected currency update, got %#v", merged["currency"])
	}
}

func TestMaskConfig(t *testing.T) {
	raw := MaskConfig(map[string]any{
		"webhook_secret": "whsec_1234",
		"currency":       "usd",
	})
	var got map[string]any
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	if got["webhook_secret"] != "whse****" || got["currency"] != "usd" {
		t.Fatalf("unexpected masked config: %#v", got)
	}
}
