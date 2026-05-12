package ai

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestModelPresetJSONUsesPricingMode(t *testing.T) {
	body, err := json.Marshal(ModelPreset{ID: "test", PricingMode: PricingPerImage})
	if err != nil {
		t.Fatal(err)
	}
	got := string(body)
	if !strings.Contains(got, `"pricing_mode":"per_image"`) {
		t.Fatalf("missing pricing_mode in JSON: %s", got)
	}
	if strings.Contains(got, "billing_mode") {
		t.Fatalf("unexpected legacy billing_mode in JSON: %s", got)
	}
}

func TestResolveModelDefUsesAdapterDefaultParams(t *testing.T) {
	def := ResolveModelDef(
		"custom-video", AdapterVolcen,
		"Custom Video", CapabilityVideo, string(PricingPerSecond),
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

func TestResolveModelDefUsesAdapterDefaultTextParams(t *testing.T) {
	def := ResolveModelDef(
		"custom-text", AdapterOpenAICompat,
		"Custom Text", CapabilityText, string(PricingPerToken),
		false, 0, 0,
		"", "",
	)
	for _, key := range []string{"max_tokens", "temperature", "json_mode"} {
		if !hasParam(def.SupportedParams, key) {
			t.Fatalf("expected text params to include %s", key)
		}
	}
	if err := ValidateGenerationParams(def, CapabilityText, `{"max_tokens":256,"temperature":0.7,"json_mode":true}`, "", 0); err != nil {
		t.Fatalf("expected text params to validate: %v", err)
	}
}

func TestResolveModelDefDefaultsOpenAICompatImageEditField(t *testing.T) {
	def := ResolveModelDef(
		"custom-image-edit", AdapterOpenAICompat,
		"Custom Image Edit", CapabilityImageEdit, string(PricingPerImage),
		true, 1, 0,
		"", "",
	)
	if def.ImageEditField != "image[]" {
		t.Fatalf("ImageEditField = %q, want image[]", def.ImageEditField)
	}
}

func TestResolveModelDefAllowsEmptyModelParamOverride(t *testing.T) {
	def := ResolveModelDef(
		"restricted-video", AdapterVolcen,
		"Restricted Video", CapabilityVideo, string(PricingPerSecond),
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

func TestResolveModelDefCanRestrictTextParamsWithProfile(t *testing.T) {
	def := ResolveModelDef(
		"restricted-text", AdapterOpenAICompat,
		"Restricted Text", CapabilityText, string(PricingPerToken),
		false, 0, 0,
		"", `{"deny":["temperature"]}`,
	)
	if err := ValidateGenerationParams(def, CapabilityText, `{"max_tokens":256}`, "", 0); err != nil {
		t.Fatalf("expected max_tokens to remain valid: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityText, `{"temperature":0.7}`, "", 0); err == nil {
		t.Fatal("expected denied temperature to be rejected")
	}
}

func TestResolveModelDefAppliesModelParamProfile(t *testing.T) {
	def := ResolveModelDef(
		"profile-video", AdapterVolcen,
		"Profile Video", CapabilityVideo, string(PricingPerSecond),
		false, 0, 0,
		"", `{
			"allow": ["duration", "aspect_ratio", "resolution", "web_search"],
			"deny": ["frames"],
			"override": {
				"duration": {"type": "select", "options": ["5", "10"], "default": "5"}
			},
			"add": [
				{"key": "web_search", "label": "Web Search", "type": "boolean", "default": false}
			]
		}`,
	)
	if !hasParam(def.SupportedParams, "duration") {
		t.Fatal("expected duration param")
	}
	if hasParam(def.SupportedParams, "frames") {
		t.Fatal("expected frames to be denied")
	}
	if !hasParam(def.SupportedParams, "web_search") {
		t.Fatal("expected added web_search param")
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"10","web_search":true}`, "", 0); err != nil {
		t.Fatalf("expected valid profile params: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"6"}`, "", 0); err == nil {
		t.Fatal("expected overridden duration options to reject 6")
	}
}

func TestValidateGenerationParamsReturnsStructuredOptionError(t *testing.T) {
	def := ResolveModelDef(
		"profile-video", AdapterVolcen,
		"Profile Video", CapabilityVideo, string(PricingPerSecond),
		false, 0, 0,
		"", `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5","10"],"default":"5"}}}`,
	)
	err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"6"}`, "", 0)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "INVALID_PARAMETER_OPTION" || validationErr.Field != "duration" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
	if len(validationErr.AllowedValues) != 2 || validationErr.AllowedValues[0] != "5" || validationErr.AllowedValues[1] != "10" {
		t.Fatalf("unexpected allowed values: %#v", validationErr.AllowedValues)
	}
	if validationErr.SuggestedFix["duration"] != "5" {
		t.Fatalf("expected suggested duration fix, got %#v", validationErr.SuggestedFix)
	}
}

func TestValidateAndNormalizeGenerationParamsReturnsCanonicalKeys(t *testing.T) {
	def := ResolveModelDef(
		"custom-image", AdapterVolcen,
		"Custom Image", CapabilityImage, string(PricingPerImage),
		false, 0, 0,
		"", "",
	)
	params, err := ValidateAndNormalizeGenerationParams(def, CapabilityImage, `{"size":"1024x1024","guidance_scale":2.5}`, "", 0)
	if err != nil {
		t.Fatalf("expected params to validate: %v", err)
	}
	if params["image_size"] != "1024x1024" {
		t.Fatalf("expected image_size canonical key, got %#v", params)
	}
	if params["prompt_strength"] != float64(2.5) {
		t.Fatalf("expected prompt_strength canonical key, got %#v", params)
	}
}

func TestValidateAndNormalizeGenerationParamsIgnoresJobMetadata(t *testing.T) {
	def := ResolveModelDef(
		"grok-imagine-image-edit", AdapterOpenAICompat,
		"Grok Imagine Image Edit", CapabilityImageEdit, string(PricingPerImage),
		true, 1, 0,
		"image[]", `[
			{"key":"image_size","label":"尺寸","type":"select","options":["1024x1024"]},
			{"key":"quality","label":"质量","type":"select","options":["standard"]}
		]`,
	)
	params, err := ValidateAndNormalizeGenerationParams(def, CapabilityImageEdit, `{
		"source":"asset_slot_one_click",
		"asset_slot_id":123,
		"asset_kind":"image",
		"quality":"standard"
	}`, "", 0)
	if err != nil {
		t.Fatalf("expected metadata params to be ignored: %v", err)
	}
	if _, ok := params["source"]; ok {
		t.Fatalf("expected source to be removed, got %#v", params)
	}
	if params["quality"] != "standard" {
		t.Fatalf("expected quality to be preserved, got %#v", params)
	}
}

func TestParamsSchemaExposesResolvedParamDefs(t *testing.T) {
	schema := ParamsSchema([]ParamDef{
		{Key: "duration", Label: "时长", Type: "select", Options: []string{"5", "10"}, Default: "5", ConflictsWith: []string{"frames"}},
		{Key: "frames", Label: "帧数", Type: "number", Min: 29, Max: 289, Step: 4},
		{Key: "resolution", Label: "分辨率", Type: "select", Options: []string{"480p", "720p"}, Default: "720p",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "draft", WhenValue: true, Options: []string{"480p"}}}},
		{Key: "seed", Label: "种子", Type: "number", Min: -1, Max: 100, Step: 1},
		{Key: "audio", Label: "音频", Type: "boolean", Default: true},
		{Key: "draft", Label: "样片", Type: "boolean", Default: false},
	})
	if schema["type"] != "object" {
		t.Fatalf("expected object schema, got %#v", schema)
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected properties map, got %#v", schema["properties"])
	}
	duration, ok := props["duration"].(map[string]any)
	if !ok {
		t.Fatalf("expected duration property, got %#v", props["duration"])
	}
	if duration["type"] != "string" {
		t.Fatalf("expected select params to become string enum, got %#v", duration)
	}
	if schema["additionalProperties"] != false {
		t.Fatalf("expected additionalProperties=false, got %#v", schema)
	}
	allOf, ok := schema["allOf"].([]any)
	if !ok || len(allOf) != 2 {
		t.Fatalf("expected two cross-param schema rules, got %#v", schema["allOf"])
	}
	if !schemaRuleHasKey(allOf, "not") {
		t.Fatalf("expected conflict rule in allOf, got %#v", allOf)
	}
	if !schemaRuleHasKey(allOf, "if") {
		t.Fatalf("expected conditional enum rule in allOf, got %#v", allOf)
	}
}

func TestDeclaredParamRulesValidateCombinations(t *testing.T) {
	def := &ModelDef{
		ID:           "declared-rules",
		DisplayName:  "Declared Rules",
		Capabilities: []string{CapabilityVideo},
		SupportedParams: []ParamDef{
			{Key: "duration", Type: "select", Options: []string{"5", "10"}, ConflictsWith: []string{"frames"}},
			{Key: "frames", Type: "number", Min: 29, Max: 289, Step: 4},
			{Key: "draft", Type: "boolean"},
			{Key: "resolution", Type: "select", Options: []string{"480p", "720p"}, ConditionalEnum: []ParamConditionalEnum{{WhenParam: "draft", WhenValue: true, Options: []string{"480p"}}}},
		},
		SupportedParamsExplicit: true,
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"5","frames":29}`, "", 0); err == nil {
		t.Fatal("expected declared conflict rule to reject duration + frames")
	}
	err := ValidateGenerationParams(def, CapabilityVideo, `{"draft":true,"resolution":"720p"}`, "", 0)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.SuggestedFix["resolution"] != "480p" {
		t.Fatalf("expected resolution suggested fix, got %#v", validationErr.SuggestedFix)
	}
}

func TestModelInputsForDefReflectsTaskRequirements(t *testing.T) {
	def := ResolveModelDef(
		"custom-i2v", AdapterVolcen,
		"Custom I2V", CapabilityVideoI2V, string(PricingPerSecond),
		true, 2, 0,
		"", "",
	)
	inputs := modelInputsForDef(def)
	if inputs.Image.Min != 1 || inputs.Image.Max != 2 {
		t.Fatalf("expected i2v image input min=1 max=2, got %#v", inputs.Image)
	}
	if inputs.Video.Min != 0 || inputs.Video.Max != 0 {
		t.Fatalf("expected no video input requirement, got %#v", inputs.Video)
	}
}

func TestTextRequestParamsForValidation(t *testing.T) {
	req := TextRequest{
		MaxTokens:   512,
		Temperature: 0.5,
		JSONMode:    true,
		ExtraParams: map[string]any{"reasoning_effort": "low"},
	}
	params := textRequestParamsForValidation(req)
	if params["max_tokens"] != 512 {
		t.Fatalf("expected max_tokens, got %#v", params)
	}
	if params["temperature"] != float32(0.5) {
		t.Fatalf("expected temperature, got %#v", params)
	}
	if params["json_mode"] != true || params["reasoning_effort"] != "low" {
		t.Fatalf("expected json_mode and extra params, got %#v", params)
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

func schemaRuleHasKey(rules []any, key string) bool {
	for _, rule := range rules {
		if m, ok := rule.(map[string]any); ok {
			if _, exists := m[key]; exists {
				return true
			}
		}
	}
	return false
}
