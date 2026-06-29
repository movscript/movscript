package ai

import (
	"encoding/json"
	"testing"
)

func TestReferenceAssetDebugBindingsIncludeProviderField(t *testing.T) {
	bindings := referenceAssetDebugBindings([]ReferenceAsset{
		{Role: "first_frame", MediaType: "image", ResourceID: 11},
		{Role: "last_frame", MediaType: "image", ResourceID: 12},
	}, staticReferenceAssetProviderField("input_reference[]"))
	if len(bindings) != 2 {
		t.Fatalf("bindings = %#v", bindings)
	}
	if bindings[0]["role"] != "first_frame" ||
		bindings[0]["media_type"] != "image" ||
		bindings[0]["resource_id"] != uint(11) ||
		bindings[0]["provider_field"] != "input_reference[]" {
		t.Fatalf("first binding = %#v", bindings[0])
	}
}

func TestDryRunVideoRequestIncludesReferenceAssetBindings(t *testing.T) {
	provider := newDryRunProvider(AdapterYunwuUnifiedVideo, "test-key", "https://yunwu.test/v1")
	result := provider.buildVideoRequest(VideoRequest{
		Model:  "slot-video",
		Prompt: "animate",
		ReferenceAssets: []ReferenceAsset{
			{Role: "first_frame", MediaType: "image", ResourceID: 21},
		},
	})
	body := debugRequestBodyMap(t, &result)
	bindings := body["reference_asset_bindings"].([]any)
	if len(bindings) != 1 || bindings[0].(map[string]any)["provider_field"] != "images[]" {
		t.Fatalf("dry run reference_asset_bindings = %#v", bindings)
	}
}

func debugRequestBodyMap(t *testing.T, debug *DebugCallResult) map[string]any {
	t.Helper()
	if debug == nil {
		t.Fatal("debug result is nil")
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(debug.RequestBody), &body); err != nil {
		t.Fatalf("debug request body JSON error = %v\n%s", err, debug.RequestBody)
	}
	return body
}
