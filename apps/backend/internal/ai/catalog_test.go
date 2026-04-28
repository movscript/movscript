package ai

import "testing"

func TestResolveModelDefUsesAdapterDefaultParams(t *testing.T) {
	def := ResolveModelDef(
		"custom-video", AdapterVolcen,
		"Custom Video", CapabilityVideo, string(BillingPerSecond),
		false, 0, 0,
		"", "",
	)
	if len(def.SupportedParams) == 0 {
		t.Fatal("expected adapter default params")
	}
	if !hasParam(def.SupportedParams, "frames") {
		t.Fatal("expected volcen video params to include frames")
	}
}

func TestResolveModelDefAllowsEmptyModelParamOverride(t *testing.T) {
	def := ResolveModelDef(
		"restricted-video", AdapterVolcen,
		"Restricted Video", CapabilityVideo, string(BillingPerSecond),
		false, 0, 0,
		"", "[]",
	)
	if len(def.SupportedParams) != 0 {
		t.Fatalf("expected empty model override, got %d params", len(def.SupportedParams))
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"5"}`, "", 0); err == nil {
		t.Fatal("expected explicit empty param override to reject generation params")
	}
}

func hasParam(params []ParamDef, key string) bool {
	for _, p := range params {
		if p.Key == key {
			return true
		}
	}
	return false
}
