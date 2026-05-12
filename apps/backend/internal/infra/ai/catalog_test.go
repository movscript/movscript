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

func TestValidateModelParamConfigRejectsBrokenContracts(t *testing.T) {
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["duration"]}`); err != nil {
		t.Fatalf("expected valid profile to pass: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["web_search"],"add":[{"key":"web_search","label":"Web Search","type":"boolean"}]}`); err != nil {
		t.Fatalf("expected allow to reference added param: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"","type":"boolean"}]}`); err == nil {
		t.Fatal("expected empty param key to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","label":"Negative Prompt"}]`); err == nil {
		t.Fatal("expected missing param type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","type":"string"}]`); err == nil {
		t.Fatal("expected missing param label to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"negative_prompt","type":"string"}]}`); err == nil {
		t.Fatal("expected missing profile add label to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"ratio","type":"select","options":["16:9"]}]`); err != nil {
		t.Fatalf("expected known alias to receive normalized label: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","type":"select"}]`); err == nil {
		t.Fatal("expected select without options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","type":"select","options":["720p","720p"]}]`); err == nil {
		t.Fatal("expected duplicate select options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","type":"select","options":[""]}]`); err == nil {
		t.Fatal("expected empty select option to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"conflicts_with":["frames"]}]`); err == nil {
		t.Fatal("expected unknown conflict target to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"default":"10"}]`); err == nil {
		t.Fatal("expected select default outside options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"default":5}]`); err == nil {
		t.Fatal("expected select default with number type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"default":null}]`); err == nil {
		t.Fatal("expected explicit null default in legacy array to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"web_search","type":"boolean","default":null}]}`); err == nil {
		t.Fatal("expected explicit null default in profile add to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"duration":{"type":"select","options":["5"],"default":null}}}`); err == nil {
		t.Fatal("expected explicit null default in profile override to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":null}`); err == nil {
		t.Fatal("expected explicit null allow in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":"duration"}`); err == nil {
		t.Fatal("expected non-array allow in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"deny":[1]}`); err == nil {
		t.Fatal("expected non-string deny item in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":null}`); err == nil {
		t.Fatal("expected explicit null override in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":[]}`); err == nil {
		t.Fatal("expected non-object override in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"duration":"5"}}`); err == nil {
		t.Fatal("expected non-object override param in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":null}`); err == nil {
		t.Fatal("expected explicit null add in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":{"key":"web_search"}}`); err == nil {
		t.Fatal("expected non-array add in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":["web_search"]}`); err == nil {
		t.Fatal("expected non-object add item in profile to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","min":null,"max":289}]`); err == nil {
		t.Fatal("expected explicit null min in legacy array to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"frames","type":"number","step":null}]}`); err == nil {
		t.Fatal("expected explicit null step in profile add to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"frames":{"type":"number","max":null}}}`); err == nil {
		t.Fatal("expected explicit null max in profile override to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":null}]`); err == nil {
		t.Fatal("expected explicit null json_schema to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"conflicts_with":null}]`); err == nil {
		t.Fatal("expected explicit null conflicts_with to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"web_search","type":null}]}`); err == nil {
		t.Fatal("expected explicit null type in profile add to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","step":-1}]`); err == nil {
		t.Fatal("expected negative step to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","min":29,"max":289,"default":10}]`); err == nil {
		t.Fatal("expected number default outside range to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","min":29,"max":289,"default":"33"}]`); err == nil {
		t.Fatal("expected number default with string type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"draft","type":"boolean","default":"false"}]`); err == nil {
		t.Fatal("expected boolean default with string type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","type":"string","default":123}]`); err == nil {
		t.Fatal("expected string default with number type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"enum":"29"}}]`); err == nil {
		t.Fatal("expected invalid json_schema enum to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"minimum":100,"maximum":50}}]`); err == nil {
		t.Fatal("expected invalid json_schema range to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","default":31,"json_schema":{"enum":[29,33]}}]`); err == nil {
		t.Fatal("expected default outside json_schema enum to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"draft","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"draft","when_value":"true","options":["480p"]}]}
	]`); err == nil {
		t.Fatal("expected conditional when_value with wrong type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"draft","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"draft","when_value":true,"options":["720p"]}]}
	]`); err == nil {
		t.Fatal("expected conditional enum option outside target options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"draft","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"draft","when_value":true,"options":["480p","480p"]}]}
	]`); err == nil {
		t.Fatal("expected duplicate conditional enum options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"image_count","type":"number","min":1,"max":15},
		{"key":"sequential_image_generation","type":"select","options":["disabled","auto"]},
		{"key":"seed","type":"number","requires_value":[{"param":"sequential_image_generation","value":"enabled"}]}
	]`); err == nil {
		t.Fatal("expected requires_value with invalid target value to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["missing_param"]}`); err == nil {
		t.Fatal("expected unknown allow param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"deny":["missing_param"]}`); err == nil {
		t.Fatal("expected unknown deny param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["duration","duration"]}`); err == nil {
		t.Fatal("expected duplicate allow param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["duration"],"deny":["duration"]}`); err == nil {
		t.Fatal("expected allow and deny conflict to be rejected")
	}
}

func TestModelParamProfilePrunesRulesForDeniedParams(t *testing.T) {
	params, explicit := ResolveEffectiveParams(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["duration"]}`)
	if !explicit {
		t.Fatal("expected profile to be explicit")
	}
	if len(params) != 1 || params[0].Key != "duration" {
		t.Fatalf("expected only duration after allow filter, got %#v", params)
	}
	if len(params[0].ConflictsWith) != 0 {
		t.Fatalf("expected duration conflicts to be pruned, got %#v", params[0].ConflictsWith)
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

func TestValidateGenerationParamsValidatesStringParamType(t *testing.T) {
	def := ResolveModelDef(
		"profile-image", AdapterOpenAICompat,
		"Profile Image", CapabilityImage, string(PricingPerImage),
		false, 0, 0,
		"", `{"allow":["negative_prompt"],"add":[{"key":"negative_prompt","label":"Negative Prompt","type":"string","default":""}]}`,
	)
	if err := ValidateGenerationParams(def, CapabilityImage, `{"negative_prompt":"low quality"}`, "", 0); err != nil {
		t.Fatalf("expected string param to validate: %v", err)
	}
	err := ValidateGenerationParams(def, CapabilityImage, `{"negative_prompt":123}`, "", 0)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "INVALID_PARAMETER_TYPE" || validationErr.Field != "negative_prompt" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
}

func TestValidateGenerationParamsAppliesParamJSONSchemaKeywords(t *testing.T) {
	def := &ModelDef{
		ID:          "schema-video",
		DisplayName: "Schema Video",
		Capabilities: []string{CapabilityVideo},
		SupportedParams: []ParamDef{
			{
				Key:  "frames",
				Type: "number",
				JSONSchema: map[string]any{
					"minimum": 29,
					"maximum": 289,
					"enum":    []int{29, 33, 37},
				},
			},
		},
		SupportedParamsExplicit: true,
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"frames":33}`, "", 0); err != nil {
		t.Fatalf("expected schema enum value to validate: %v", err)
	}
	err := ValidateGenerationParams(def, CapabilityVideo, `{"frames":31}`, "", 0)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "INVALID_PARAMETER_OPTION" || validationErr.Field != "frames" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
	if validationErr.SuggestedFix["frames"] != 29 {
		t.Fatalf("expected first schema enum value as suggested fix, got %#v", validationErr.SuggestedFix)
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
		{Key: "frames", Label: "帧数", Type: "number", Min: 29, Max: 289, Step: 4, JSONSchema: framesJSONSchema()},
		{Key: "resolution", Label: "分辨率", Type: "select", Options: []string{"480p", "720p"}, Default: "720p",
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "draft", WhenValue: true, Options: []string{"480p"}}}},
		{Key: "return_last_frame", Label: "返回尾帧", Type: "boolean", Default: false,
			ConditionalConst: []ParamConditionalConst{{WhenParam: "draft", WhenValue: true, Value: false}}},
		{Key: "image_count", Label: "生成张数", Type: "number", Min: 1, Max: 15, Step: 1,
			RequiresValue: []ParamRequiresValue{{Param: "sequential_image_generation", Value: "auto"}}},
		{Key: "sequential_image_generation", Label: "组图", Type: "select", Options: []string{"disabled", "auto"}, Default: "disabled"},
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
	frames, ok := props["frames"].(map[string]any)
	if !ok {
		t.Fatalf("expected frames property, got %#v", props["frames"])
	}
	if !schemaNumberEquals(frames["minimum"], 29) || !schemaNumberEquals(frames["maximum"], 289) {
		t.Fatalf("expected frames JSON Schema constraints, got %#v", frames)
	}
	if !schemaValuesEqual(frames["enum"], []any{29, 33, 37}) {
		enumValues, ok := frames["enum"].([]int)
		if !ok || len(enumValues) != 66 || enumValues[0] != 29 || enumValues[1] != 33 || enumValues[len(enumValues)-1] != 289 {
			t.Fatalf("expected frames enum to express 25 + 4n, got %#v", frames["enum"])
		}
	}
	if frames["description"] == "" {
		t.Fatalf("expected frames schema description, got %#v", frames)
	}
	if _, ok := frames["multipleOf"]; ok {
		t.Fatalf("expected frames enum to suppress incompatible multipleOf, got %#v", frames)
	}
	if schema["additionalProperties"] != false {
		t.Fatalf("expected additionalProperties=false, got %#v", schema)
	}
	allOf, ok := schema["allOf"].([]any)
	if !ok || len(allOf) != 4 {
		t.Fatalf("expected four cross-param schema rules, got %#v", schema["allOf"])
	}
	if !schemaRuleHasKey(allOf, "not") {
		t.Fatalf("expected conflict rule in allOf, got %#v", allOf)
	}
	if !schemaRuleHasKey(allOf, "if") {
		t.Fatalf("expected conditional enum rule in allOf, got %#v", allOf)
	}
	if !schemaHasConflictRule(allOf, "duration", "frames") {
		t.Fatalf("expected duration/frames conflict rule in allOf, got %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "draft", true, "resolution", "enum", []any{"480p"}, false) {
		t.Fatalf("expected draft=true to restrict resolution enum, got %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "draft", true, "return_last_frame", "const", false, false) {
		t.Fatalf("expected draft=true to force return_last_frame=false, got %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "", nil, "sequential_image_generation", "const", "auto", true) {
		t.Fatalf("expected image_count to require sequential_image_generation=auto, got %#v", allOf)
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
			{Key: "return_last_frame", Type: "boolean", ConditionalConst: []ParamConditionalConst{{WhenParam: "draft", WhenValue: true, Value: false}}},
			{Key: "sequential_image_generation", Type: "select", Options: []string{"disabled", "auto"}},
			{Key: "image_count", Type: "number", Min: 1, Max: 15, Step: 1, RequiresValue: []ParamRequiresValue{{Param: "sequential_image_generation", Value: "auto"}}},
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
	err = ValidateGenerationParams(def, CapabilityVideo, `{"draft":true,"return_last_frame":true}`, "", 0)
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError for conditional const, got %T %[1]v", err)
	}
	if validationErr.SuggestedFix["return_last_frame"] != false {
		t.Fatalf("expected return_last_frame suggested fix, got %#v", validationErr.SuggestedFix)
	}
	err = ValidateGenerationParams(def, CapabilityVideo, `{"image_count":3,"sequential_image_generation":"disabled"}`, "", 0)
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError for required value, got %T %[1]v", err)
	}
	if validationErr.SuggestedFix["sequential_image_generation"] != "auto" {
		t.Fatalf("expected sequential_image_generation suggested fix, got %#v", validationErr.SuggestedFix)
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

func schemaHasConflictRule(rules []any, first, second string) bool {
	for _, rule := range rules {
		m, ok := rule.(map[string]any)
		if !ok {
			continue
		}
		notRule, ok := m["not"].(map[string]any)
		if !ok {
			continue
		}
		required := stringSliceFromAny(notRule["required"])
		if containsString(required, first) && containsString(required, second) {
			return true
		}
	}
	return false
}

func schemaHasConditionalPropertyRule(rules []any, whenParam string, whenValue any, param string, keyword string, value any, requiresParam bool) bool {
	for _, rule := range rules {
		m, ok := rule.(map[string]any)
		if !ok {
			continue
		}
		if whenParam != "" && !schemaRuleMatchesCondition(m, whenParam, whenValue) {
			continue
		}
		thenRule, ok := m["then"].(map[string]any)
		if !ok {
			continue
		}
		props, ok := thenRule["properties"].(map[string]any)
		if !ok {
			continue
		}
		prop, ok := props[param].(map[string]any)
		if !ok || !schemaValuesEqual(prop[keyword], value) {
			continue
		}
		if requiresParam && !containsString(stringSliceFromAny(thenRule["required"]), param) {
			continue
		}
		return true
	}
	return false
}

func schemaRuleMatchesCondition(rule map[string]any, whenParam string, whenValue any) bool {
	ifRule, ok := rule["if"].(map[string]any)
	if !ok {
		return false
	}
	props, ok := ifRule["properties"].(map[string]any)
	if !ok {
		return false
	}
	prop, ok := props[whenParam].(map[string]any)
	if !ok {
		return false
	}
	return schemaValuesEqual(prop["const"], whenValue)
}

func schemaValuesEqual(actual, expected any) bool {
	actualSlice, actualIsSlice := comparableSliceFromAny(actual)
	expectedSlice, expectedIsSlice := comparableSliceFromAny(expected)
	if actualIsSlice || expectedIsSlice {
		if !actualIsSlice || !expectedIsSlice || len(actualSlice) != len(expectedSlice) {
			return false
		}
		for i := range actualSlice {
			if actualSlice[i] != expectedSlice[i] {
				return false
			}
		}
		return true
	}
	return actual == expected
}

func schemaNumberEquals(actual any, expected float64) bool {
	switch v := actual.(type) {
	case int:
		return float64(v) == expected
	case int64:
		return float64(v) == expected
	case float64:
		return v == expected
	default:
		return false
	}
}

func comparableSliceFromAny(value any) ([]any, bool) {
	switch items := value.(type) {
	case []any:
		return items, true
	case []string:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	case []int:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	default:
		return nil, false
	}
}

func stringSliceFromAny(value any) []string {
	switch items := value.(type) {
	case []string:
		return append([]string{}, items...)
	case []any:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
