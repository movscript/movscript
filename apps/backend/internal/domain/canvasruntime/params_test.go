package canvasruntime

import (
	"encoding/json"
	"testing"
)

type stringer string

func (s stringer) String() string { return string(s) }

func TestParamAccessorsCoerceSupportedTypes(t *testing.T) {
	params := map[string]any{
		"name":        stringer("render"),
		"count":       json.Number("3"),
		"temperature": "0.75",
		"enabled":     "true",
	}

	if got := StringParam(params, "name", "fallback"); got != "render" {
		t.Fatalf("string param = %q, want render", got)
	}
	if got := IntParam(params, "count", 1); got != 3 {
		t.Fatalf("int param = %d, want 3", got)
	}
	if got := FloatParam(params, "temperature", 0); got != 0.75 {
		t.Fatalf("float param = %v, want 0.75", got)
	}
	if got := BoolParam(params, "enabled", false); !got {
		t.Fatal("bool param = false, want true")
	}
}

func TestParamAccessorsFallbackForMissingOrBlankValues(t *testing.T) {
	params := map[string]any{"blank": " "}
	if got := StringParam(params, "blank", "fallback"); got != "fallback" {
		t.Fatalf("string param = %q, want fallback", got)
	}
	if got := IntParam(params, "missing", 7); got != 7 {
		t.Fatalf("int param = %d, want 7", got)
	}
	if got := BoolPtrParam(params, "missing"); got != nil {
		t.Fatalf("bool ptr = %v, want nil", *got)
	}
}

func TestMarshalParamsForPreflight(t *testing.T) {
	if got := MarshalParamsForPreflight(nil); got != "" {
		t.Fatalf("empty params = %q, want empty", got)
	}
	if got := MarshalParamsForPreflight(map[string]any{"n": 1}); got != `{"n":1}` {
		t.Fatalf("params json = %q, want {\"n\":1}", got)
	}
}
