package ai

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"
)

func TestCatalogTemplateJSONExposesPublicModelAndParams(t *testing.T) {
	body, err := json.Marshal(CatalogTemplate{
		ID:                   "test",
		Lab:                  "seed",
		DefaultPublicModelID: "test",
		SupportedParams: []ParamDef{{
			Key:     "duration",
			Label:   "Duration",
			Type:    "select",
			Options: []string{"5", "10"},
			Default: "5",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := string(body)
	if !strings.Contains(got, `"default_public_model_id":"test"`) {
		t.Fatalf("missing default_public_model_id in JSON: %s", got)
	}
	if !strings.Contains(got, `"lab":"seed"`) {
		t.Fatalf("missing lab in JSON: %s", got)
	}
	if strings.Contains(got, "pricing_mode") {
		t.Fatalf("unexpected pricing_mode in JSON: %s", got)
	}
	if strings.Contains(got, "billing_mode") {
		t.Fatalf("unexpected legacy billing_mode in JSON: %s", got)
	}
	if !strings.Contains(got, `"supported_params"`) || !strings.Contains(got, `"duration"`) {
		t.Fatalf("missing supported_params in JSON: %s", got)
	}
}

func TestCatalogTemplatesExposeDisplaySafeDefaultPublicModelID(t *testing.T) {
	templates := CatalogTemplates()
	if len(templates) == 0 {
		t.Fatal("expected catalog templates")
	}
	byID := map[string]CatalogTemplate{}
	for _, template := range templates {
		byID[template.ID] = template
		if strings.TrimSpace(template.Lab) == "" {
			t.Fatalf("template %s has empty lab", template.ID)
		}
		if strings.TrimSpace(template.DefaultPublicModelID) == "" {
			t.Fatalf("template %s has empty default_public_model_id", template.ID)
		}
		if strings.Contains(template.DefaultPublicModelID, ":") {
			t.Fatalf("template %s exposes provider namespace in default_public_model_id %q", template.ID, template.DefaultPublicModelID)
		}
	}

	openAICompat := byID["volcengine:seedream-5-0"]
	arkNative := byID["volcengine-ark:seedream-5-0"]
	if openAICompat.DefaultPublicModelID == "" || arkNative.DefaultPublicModelID == "" {
		t.Fatal("expected Seedream 5.0 templates")
	}
	if openAICompat.DefaultPublicModelID != arkNative.DefaultPublicModelID {
		t.Fatalf("same model across adapters should share default public id, got %q and %q", openAICompat.DefaultPublicModelID, arkNative.DefaultPublicModelID)
	}
	if openAICompat.Lab != "seed" || arkNative.Lab != "seed" {
		t.Fatalf("Seedream templates lab = %q and %q, want seed", openAICompat.Lab, arkNative.Lab)
	}

	openAICompatLite := byID["volcengine:seedream-5-0-lite"]
	arkNativeLite := byID["volcengine-ark:seedream-5-0-lite"]
	if openAICompatLite.DefaultPublicModelID == "" || arkNativeLite.DefaultPublicModelID == "" {
		t.Fatal("expected Seedream 5.0 Lite templates")
	}
	if openAICompatLite.DefaultPublicModelID != arkNativeLite.DefaultPublicModelID {
		t.Fatalf("same lite model across adapters should share default public id, got %q and %q", openAICompatLite.DefaultPublicModelID, arkNativeLite.DefaultPublicModelID)
	}
}

func TestCatalogTemplatesByLabFiltersOnModelLab(t *testing.T) {
	templates := CatalogTemplatesByLab("seed")
	if len(templates) == 0 {
		t.Fatal("expected seed templates")
	}
	for _, template := range templates {
		if template.Lab != "seed" {
			t.Fatalf("CatalogTemplatesByLab(seed) returned %s with lab %q", template.ID, template.Lab)
		}
	}
	if got := CatalogTemplatesByLab("volcengine"); len(got) != 0 {
		t.Fatalf("volcengine is a provider/route family, not a lab; got %#v", got)
	}
	for _, providerOnlyLab := range []string{"aws-bedrock", "aws-bedrock-openai", "azure-openai", "relay_gateway", "apiyi", "local-audio"} {
		if got := CatalogTemplatesByLab(providerOnlyLab); len(got) != 0 {
			t.Fatalf("%s is a provider or runtime surface, not a lab; got %#v", providerOnlyLab, got)
		}
	}
	if got := CatalogTemplatesByLab("SEED"); len(got) != len(templates) {
		t.Fatalf("case-insensitive seed filter returned %d templates, want %d", len(got), len(templates))
	}
}

func TestCatalogTemplatesExposeModelSpecificSupportedParams(t *testing.T) {
	templates := CatalogTemplates()
	sawDalle := false
	sawSeedance := false
	for _, template := range templates {
		switch template.ID {
		case "openai:dall-e-3":
			sawDalle = true
			if !hasParam(template.SupportedParams, "image_size") || hasParam(template.SupportedParams, "size") {
				t.Fatalf("expected DALL-E template params to use canonical image_size key, got %#v", template.SupportedParams)
			}
		case "volcengine:seedance-1-0-lite-t2v":
			sawSeedance = true
			if !hasParam(template.SupportedParams, "duration") || !hasParam(template.SupportedParams, "resolution") {
				t.Fatalf("expected template supported params for %s, got %#v", template.ID, template.SupportedParams)
			}
			body, err := json.Marshal(template)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(body), `"supported_params"`) {
				t.Fatalf("expected template JSON to expose supported_params: %s", string(body))
			}
		}
	}
	if !sawDalle {
		t.Fatal("expected DALL-E template")
	}
	if !sawSeedance {
		t.Fatal("expected Seedance template")
	}
}

func TestCatalogTemplatesIncludeGPT52(t *testing.T) {
	for _, template := range CatalogTemplates() {
		if template.ID != "openai:gpt-5.2" {
			continue
		}
		if template.ModelID != "gpt-5.2" {
			t.Fatalf("model_id = %q, want gpt-5.2", template.ModelID)
		}
		if template.AdapterType != AdapterOpenAICompat {
			t.Fatalf("adapter_type = %q, want %q", template.AdapterType, AdapterOpenAICompat)
		}
		if !hasString(template.Capabilities, CapabilityText) || !hasString(template.Capabilities, CapabilityReasoning) {
			t.Fatalf("capabilities = %#v, want text and reasoning", template.Capabilities)
		}
		return
	}
	t.Fatal("expected GPT-5.2 template")
}

func TestCatalogTemplatesIncludeElevenLabsAudioModels(t *testing.T) {
	wantTTSModels := map[string]string{
		"elevenlabs:eleven-v3-tts":              "eleven_v3",
		"elevenlabs:eleven-multilingual-v2-tts": "eleven_multilingual_v2",
		"elevenlabs:eleven-flash-v2-5-tts":      "eleven_flash_v2_5",
		"elevenlabs:eleven-flash-v2-tts":        "eleven_flash_v2",
	}
	seenTTSModels := map[string]bool{}
	seenSTT := false

	for _, template := range CatalogTemplates() {
		if modelID, ok := wantTTSModels[template.ID]; ok {
			seenTTSModels[template.ID] = true
			if template.ModelID != modelID {
				t.Fatalf("%s model_id = %q, want %q", template.ID, template.ModelID, modelID)
			}
			if template.AdapterType != AdapterElevenLabs {
				t.Fatalf("%s adapter_type = %q, want %q", template.ID, template.AdapterType, AdapterElevenLabs)
			}
			if !hasString(template.Capabilities, CapabilityAudioTTS) {
				t.Fatalf("%s capabilities = %#v, want audio_tts", template.ID, template.Capabilities)
			}
			if !hasParam(template.SupportedParams, "output_format") || !hasParam(template.SupportedParams, "stability") {
				t.Fatalf("%s supported_params = %#v", template.ID, template.SupportedParams)
			}
		}
		if template.ID == "elevenlabs:scribe-v2" {
			seenSTT = true
			if template.ModelID != "scribe_v2" || template.AdapterType != AdapterElevenLabs ||
				!hasString(template.Capabilities, CapabilityAudioSTT) ||
				!hasParam(template.SupportedParams, "diarize") {
				t.Fatalf("scribe template = %#v", template)
			}
		}
	}

	for id := range wantTTSModels {
		if !seenTTSModels[id] {
			t.Fatalf("expected ElevenLabs TTS template %s", id)
		}
	}
	if !seenSTT {
		t.Fatal("expected ElevenLabs Scribe v2 template")
	}
}

func TestOpenAICompatAdapterDefaultsIncludeAudioAndAlignParams(t *testing.T) {
	ttsParams := DefaultParamsForAdapter(AdapterOpenAICompat, []string{CapabilityAudioTTS})
	if !hasParam(ttsParams, "response_format") || !hasParam(ttsParams, "speed") || !hasParam(ttsParams, "instructions") {
		t.Fatalf("openai-compatible TTS params = %#v, want response_format, speed, instructions", ttsParams)
	}

	transcribeParams := DefaultParamsForAdapter(AdapterOpenAICompat, []string{CapabilityAudioSTT})
	if !hasParam(transcribeParams, "response_format") || !hasParam(transcribeParams, "prompt") || !hasParam(transcribeParams, "temperature") {
		t.Fatalf("openai-compatible STT params = %#v, want response_format, prompt, temperature", transcribeParams)
	}

	chatParams := DefaultParamsForAdapter(AdapterOpenAICompat, []string{CapabilityAudioChat})
	if !hasParam(chatParams, "voice") || !hasParam(chatParams, "response_format") || !hasParam(chatParams, "temperature") || !hasParam(chatParams, "max_tokens") {
		t.Fatalf("openai-compatible audio chat params = %#v, want voice, response_format, temperature, max_tokens", chatParams)
	}

	alignParams := DefaultParamsForAdapter(AdapterOpenAICompat, []string{CapabilitySubAlign})
	if !hasParam(alignParams, "response_format") || !hasParam(alignParams, "prompt") || !hasParam(alignParams, "temperature") {
		t.Fatalf("openai-compatible align params = %#v, want transcription params", alignParams)
	}
}

func TestDashScopeRealtimeTTSModelsAreNotClassifiedAsAudioChat(t *testing.T) {
	want := map[string]bool{
		"dashscope:qwen3-tts-flash-realtime":          false,
		"dashscope:qwen3-tts-instruct-flash-realtime": false,
	}
	for _, template := range CatalogTemplates() {
		if _, ok := want[template.ID]; !ok {
			continue
		}
		want[template.ID] = true
		if !hasString(template.Capabilities, CapabilityAudioTTS) {
			t.Fatalf("%s capabilities = %#v, want audio_tts", template.ID, template.Capabilities)
		}
		if hasString(template.Capabilities, CapabilityAudioChat) {
			t.Fatalf("%s capabilities = %#v, realtime TTS must not be listed as audio_chat", template.ID, template.Capabilities)
		}
	}
	for id, found := range want {
		if !found {
			t.Fatalf("expected template %s", id)
		}
	}
}

func TestLocalAdapterDefaultsIncludeAudioGenerationParams(t *testing.T) {
	musicParams := DefaultParamsForAdapter(AdapterLocal, []string{CapabilityAudioMusic})
	if !hasParam(musicParams, "duration") || !hasParam(musicParams, "output_format") || !hasParam(musicParams, "negative_prompt") {
		t.Fatalf("local music params = %#v, want duration, output_format, negative_prompt", musicParams)
	}

	sfxParams := DefaultParamsForAdapter(AdapterLocal, []string{CapabilityAudioSFX})
	if !hasParam(sfxParams, "duration") || !hasParam(sfxParams, "output_format") || !hasParam(sfxParams, "negative_prompt") {
		t.Fatalf("local sfx params = %#v, want duration, output_format, negative_prompt", sfxParams)
	}
}

func TestCatalogTemplateSupportedParamsAreValidCanonicalContracts(t *testing.T) {
	aliasKeys := map[string]bool{}
	for alias := range generationParamAliasMap() {
		aliasKeys[alias] = true
	}
	for _, template := range CatalogTemplates() {
		if len(template.SupportedParams) == 0 {
			continue
		}
		for _, param := range template.SupportedParams {
			if aliasKeys[param.Key] {
				t.Fatalf("template %s exposes alias parameter key %q", template.ID, param.Key)
			}
		}
		body, err := json.Marshal(template.SupportedParams)
		if err != nil {
			t.Fatalf("marshal supported params for template %s: %v", template.ID, err)
		}
		if err := ValidateModelParamConfig(template.AdapterType, template.Capabilities, string(body)); err != nil {
			t.Fatalf("template %s has invalid supported params: %v", template.ID, err)
		}
	}
}

func TestVisualCatalogTemplateDefaultsValidateAsAgentSubmittedParams(t *testing.T) {
	for _, template := range CatalogTemplates() {
		if !hasVisualGenerationCapability(template.Capabilities) {
			continue
		}
		jobType := defaultJobTypeForTemplateCapabilities(template.Capabilities)
		if jobType == "" {
			t.Fatalf("visual template %s has no supported default job type: %#v", template.ID, template.Capabilities)
		}
		aspectRatio, duration, extraParams := defaultGenerationArgsForTemplate(t, template)
		extraParamsJSON := ""
		if len(extraParams) > 0 {
			body, err := json.Marshal(extraParams)
			if err != nil {
				t.Fatalf("marshal default params for template %s: %v", template.ID, err)
			}
			extraParamsJSON = string(body)
		}
		def := &ModelDef{
			ID:                      template.ID,
			ModelID:                 template.ModelID,
			DisplayName:             template.DisplayName,
			Capabilities:            template.Capabilities,
			AdapterType:             template.AdapterType,
			SupportedParams:         template.SupportedParams,
			SupportedParamsExplicit: true,
		}
		if err := ValidateGenerationParams(def, jobType, extraParamsJSON, aspectRatio, duration); err != nil {
			t.Fatalf("template %s default generation params must validate for job_type %s: aspect_ratio=%q duration=%d extra_params=%s: %v",
				template.ID, jobType, aspectRatio, duration, extraParamsJSON, err)
		}
	}
}

func TestVisualCatalogTemplatesDeclareModelSpecificSupportedParams(t *testing.T) {
	for _, template := range CatalogTemplates() {
		if !hasVisualGenerationCapability(template.Capabilities) {
			continue
		}
		if len(template.SupportedParams) == 0 {
			t.Fatalf("visual template %s must declare model-specific supported params to avoid broad adapter defaults", template.ID)
		}
	}
}

func TestImageCatalogTemplatesOmitKnownUnsupportedParams(t *testing.T) {
	for _, template := range CatalogTemplates() {
		switch template.ID {
		case "openai:gpt-image-1", "openai:gpt-image-1-edit", "openai:gpt-image-2", "openai:gpt-image-2-edit":
			if hasParam(template.SupportedParams, "style") {
				t.Fatalf("template %s must not expose unsupported style param: %#v", template.ID, template.SupportedParams)
			}
		case "volcengine:seedream-5-0", "volcengine:seedream-5-0-lite", "volcengine-ark:seedream-5-0", "volcengine-ark:seedream-5-0-lite":
			if hasParam(template.SupportedParams, "prompt_strength") || hasParam(template.SupportedParams, "guidance_scale") {
				t.Fatalf("template %s must not expose unsupported prompt strength/guidance scale params: %#v", template.ID, template.SupportedParams)
			}
		}
	}
}

func TestVideoCatalogTemplatesExposeDurationContractMatchingRuntimeLimits(t *testing.T) {
	for _, template := range catalogTemplateSources {
		if !hasString(template.Capabilities, CapabilityVideo) &&
			!hasString(template.Capabilities, CapabilityVideoI2V) &&
			!hasString(template.Capabilities, CapabilityVideoV2V) {
			continue
		}
		duration, ok := findTemplateParam(template.SupportedParams, "duration")
		if !ok {
			t.Fatalf("video template %s must expose duration param for agent preflight", template.ID)
		}
		if duration.Type != "select" || len(duration.Options) == 0 {
			t.Fatalf("video template %s duration must be a non-empty select contract, got %#v", template.ID, duration)
		}
		if template.DefaultDurSec > 0 && !hasString(duration.Options, intString(template.DefaultDurSec)) {
			t.Fatalf("video template %s duration options %v must include default duration %d", template.ID, duration.Options, template.DefaultDurSec)
		}
		if template.MaxDurSec > 0 {
			if !hasString(duration.Options, intString(template.MaxDurSec)) {
				t.Fatalf("video template %s duration options %v must include max duration %d", template.ID, duration.Options, template.MaxDurSec)
			}
			for _, option := range duration.Options {
				value, ok := parseIntOption(option)
				if !ok || value < -1 {
					t.Fatalf("video template %s duration option %q must be an integer or -1 auto sentinel", template.ID, option)
				}
				if value > template.MaxDurSec {
					t.Fatalf("video template %s duration option %q exceeds max duration %d", template.ID, option, template.MaxDurSec)
				}
			}
		}
	}
}

func TestResolveModelDefUsesAdapterDefaultParams(t *testing.T) {
	def := ResolveModelDef(
		"custom-video", AdapterVolcen,
		"Custom Video", CapabilityVideo, "",
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

func hasVisualGenerationCapability(capabilities []string) bool {
	for _, cap := range capabilities {
		switch cap {
		case CapabilityImage, CapabilityImageEdit, CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
			return true
		}
	}
	return false
}

func defaultJobTypeForTemplateCapabilities(capabilities []string) string {
	switch {
	case hasString(capabilities, CapabilityImage):
		return CapabilityImage
	case hasString(capabilities, CapabilityImageEdit):
		return CapabilityImageEdit
	case hasString(capabilities, CapabilityVideo):
		return CapabilityVideo
	case hasString(capabilities, CapabilityVideoI2V):
		return CapabilityVideoI2V
	case hasString(capabilities, CapabilityVideoV2V):
		return CapabilityVideoV2V
	default:
		return ""
	}
}

func defaultGenerationArgsForTemplate(t *testing.T, template CatalogTemplate) (string, int, map[string]any) {
	t.Helper()
	extraParams := map[string]any{}
	aspectRatio := ""
	duration := 0
	for _, param := range template.SupportedParams {
		if param.Default == nil {
			continue
		}
		switch param.Key {
		case "aspect_ratio":
			value, ok := param.Default.(string)
			if !ok {
				t.Fatalf("template %s aspect_ratio default must be a string, got %#v", template.ID, param.Default)
			}
			aspectRatio = value
		case "duration":
			duration = defaultDurationSeconds(t, template.ID, param.Default)
		default:
			extraParams[param.Key] = param.Default
		}
	}
	return aspectRatio, duration, extraParams
}

func defaultDurationSeconds(t *testing.T, templateID string, value any) int {
	t.Helper()
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		if v != float64(int(v)) {
			t.Fatalf("template %s duration default must be an integer second count, got %v", templateID, v)
		}
		return int(v)
	case string:
		parsed, err := strconv.Atoi(v)
		if err != nil {
			t.Fatalf("template %s duration default must parse as integer seconds, got %q", templateID, v)
		}
		return parsed
	default:
		t.Fatalf("template %s duration default must be numeric or numeric string, got %#v", templateID, value)
		return 0
	}
}

func TestResolveModelDefUsesAdapterDefaultTextParams(t *testing.T) {
	def := ResolveModelDef(
		"custom-text", AdapterOpenAICompat,
		"Custom Text", CapabilityText, "",
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
		"Custom Image Edit", CapabilityImageEdit, "",
		false, 0, 0,
		"", "",
	)
	if !def.AcceptsImageInput || def.MaxInputImages != 1 {
		t.Fatalf("expected image_edit to imply accepts image input with max=1, got accepts=%v max=%d", def.AcceptsImageInput, def.MaxInputImages)
	}
	if def.ImageEditField != "image[]" {
		t.Fatalf("ImageEditField = %q, want image[]", def.ImageEditField)
	}
}

func TestResolveModelDefInfersImageInputFromI2VCapability(t *testing.T) {
	def := ResolveModelDef(
		"custom-i2v", AdapterVolcen,
		"Custom I2V", CapabilityVideoI2V, "",
		false, 0, 0,
		"", "",
	)
	if !def.AcceptsImageInput || def.MaxInputImages != 1 {
		t.Fatalf("expected i2v to imply accepts image input with max=1, got accepts=%v max=%d", def.AcceptsImageInput, def.MaxInputImages)
	}
}

func TestResolveModelDefInfersImageInputFromCustomImageLimit(t *testing.T) {
	def := ResolveModelDef(
		"custom-image-model", AdapterVolcen,
		"Custom Image Model", CapabilityImage, "",
		false, 4, 0,
		"", "",
	)
	if !def.AcceptsImageInput || def.MaxInputImages != 4 {
		t.Fatalf("expected custom max input images to imply accepts image input, got accepts=%v max=%d", def.AcceptsImageInput, def.MaxInputImages)
	}
}

func TestVisualCatalogTemplatesExposeConsistentInputMetadata(t *testing.T) {
	for _, template := range CatalogTemplates() {
		if hasString(template.Capabilities, CapabilityImageEdit) || hasString(template.Capabilities, CapabilityVideoI2V) {
			if !template.AcceptsImageInput || template.MaxInputImages == 0 {
				t.Fatalf("template %s with image input capability must expose accepts_image_input and max_input_images, got accepts=%v max=%d", template.ID, template.AcceptsImageInput, template.MaxInputImages)
			}
		}
		if hasString(template.Capabilities, CapabilityVideoV2V) && template.MaxInputVideos == 0 {
			t.Fatalf("template %s with v2v capability must expose max_input_videos", template.ID)
		}
	}
}

func TestResolveModelDefAllowsEmptyModelParamOverride(t *testing.T) {
	def := ResolveModelDef(
		"restricted-video", AdapterVolcen,
		"Restricted Video", CapabilityVideo, "",
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
		"Restricted Text", CapabilityText, "",
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
		"Profile Video", CapabilityVideo, "",
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
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"allow":["custom_flag"],"add":[{"key":"custom_flag","label":"Custom Flag","type":"boolean"}]}`); err != nil {
		t.Fatalf("expected allow to reference added param: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"aspect_ratio":{"key":"ratio","type":"select","options":["16:9"]}}}`); err != nil {
		t.Fatalf("expected override key aliases to match canonical key: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"web_search","label":"Web Search","type":"boolean"},{"key":"web_search","label":"Web Search 2","type":"boolean"}]}`); err == nil {
		t.Fatal("expected duplicate profile add key to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"duration","label":"Duration","type":"select","options":["5"]}]}`); err == nil {
		t.Fatal("expected profile add existing adapter param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"ratio","label":"Ratio","type":"select","options":["16:9"]}]}`); err == nil {
		t.Fatal("expected profile add alias of existing adapter param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"duration":{"type":"select","options":["5"]}},"add":[{"key":"duration","label":"Duration","type":"select","options":["10"]}]}`); err == nil {
		t.Fatal("expected profile add overridden param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"","type":"boolean"}]}`); err == nil {
		t.Fatal("expected empty param key to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"alow":["duration"]}`); err == nil {
		t.Fatal("expected unknown profile field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `["duration"]`); err == nil {
		t.Fatal("expected non-object legacy param item to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","label":"Negative Prompt"}]`); err == nil {
		t.Fatal("expected missing param type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":123,"label":"Negative Prompt","type":"string"}]`); err == nil {
		t.Fatal("expected non-string param key to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","label":123,"type":"string"}]`); err == nil {
		t.Fatal("expected non-string param label to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","label":"Negative Prompt","type":123}]`); err == nil {
		t.Fatal("expected non-string param type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","label":"Negative Prompt","type":"string","defualt":"low quality"}]`); err == nil {
		t.Fatal("expected unknown param field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","type":"string"}]`); err == nil {
		t.Fatal("expected missing param label to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"negative_prompt","type":"string"}]}`); err == nil {
		t.Fatal("expected missing profile add label to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"negative_prompt","label":"Negative Prompt","type":"string","defualt":"low quality"}]}`); err == nil {
		t.Fatal("expected unknown profile add param field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"add":[{"key":"frames","label":"Frames","type":"number","min":"1"}]}`); err == nil {
		t.Fatal("expected non-number profile add min to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"frames":{"type":"number","step":"1"}}}`); err == nil {
		t.Fatal("expected non-number profile override step to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"seed","label":"Seed","type":"number","step":0}]`); err == nil {
		t.Fatal("expected explicit zero step to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"ratio","type":"select","options":["16:9"]}]`); err != nil {
		t.Fatalf("expected known alias to receive normalized label: %v", err)
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","type":"select"}]`); err == nil {
		t.Fatal("expected select without options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","label":"Resolution","type":"select","options":"480p"}]`); err == nil {
		t.Fatal("expected non-array options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"resolution","label":"Resolution","type":"select","options":[480]}]`); err == nil {
		t.Fatal("expected non-string options item to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","label":"Frames","type":"number","json_schema":[]}]`); err == nil {
		t.Fatal("expected non-object json_schema to be rejected")
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
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"conflicts_with":[1]}]`); err == nil {
		t.Fatal("expected non-string conflicts_with item to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"default":"10"}]`); err == nil {
		t.Fatal("expected select default outside options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"duration","type":"select","options":["5"],"default":5}]`); err == nil {
		t.Fatal("expected select default with number type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"seed","label":"Seed","type":"number","min":0,"max":0,"default":1}]`); err == nil {
		t.Fatal("expected number default above explicit zero max to be rejected")
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
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `{"override":{"duration":{"key":"frames","type":"number"}}}`); err == nil {
		t.Fatal("expected override key mismatch to be rejected")
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
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"workspace","type":"boolean","default":"false"}]`); err == nil {
		t.Fatal("expected boolean default with string type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"negative_prompt","type":"string","default":123}]`); err == nil {
		t.Fatal("expected string default with number type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"enum":"29"}}]`); err == nil {
		t.Fatal("expected invalid json_schema enum to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"enum":[29,{"value":33}]}}]`); err == nil {
		t.Fatal("expected non-scalar json_schema enum item to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"pattern":"["}}]`); err == nil {
		t.Fatal("expected invalid json_schema pattern to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"image_size","type":"string","json_schema":{"x_movscript_image_size":{"width_multiple_of":0}}}]`); err == nil {
		t.Fatal("expected invalid image size schema constraint to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","json_schema":{"minimum":100,"maximum":50}}]`); err == nil {
		t.Fatal("expected invalid json_schema range to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[{"key":"frames","type":"number","default":31,"json_schema":{"enum":[29,33]}}]`); err == nil {
		t.Fatal("expected default outside json_schema enum to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"workspace","when_value":"true","options":["480p"]}]}
	]`); err == nil {
		t.Fatal("expected conditional when_value with wrong type to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":{"when_param":"workspace","when_value":true,"options":["480p"]}}
	]`); err == nil {
		t.Fatal("expected non-array conditional_enum to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":["workspace"]}
	]`); err == nil {
		t.Fatal("expected non-object conditional_enum item to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"whenParam":"workspace","when_value":true,"options":["480p"]}]}
	]`); err == nil {
		t.Fatal("expected unknown conditional_enum field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":1,"when_value":true,"options":["480p"]}]}
	]`); err == nil {
		t.Fatal("expected non-string conditional_enum when_param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":null,"when_value":true,"options":["480p"]}]}
	]`); err == nil {
		t.Fatal("expected null conditional_enum when_param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"workspace","when_value":true,"options":"480p"}]}
	]`); err == nil {
		t.Fatal("expected non-array conditional_enum options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"workspace","when_value":true,"options":[480]}]}
	]`); err == nil {
		t.Fatal("expected non-string conditional_enum option to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"workspace","when_value":true,"options":["720p"]}]}
	]`); err == nil {
		t.Fatal("expected conditional enum option outside target options to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"return_last_frame","type":"boolean","conditional_const":[{"when_param":"workspace","when_value":true,"vale":false}]}
	]`); err == nil {
		t.Fatal("expected unknown conditional_const field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"return_last_frame","type":"boolean","conditional_const":[{"when_param":1,"when_value":true,"value":false}]}
	]`); err == nil {
		t.Fatal("expected non-string conditional_const when_param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"return_last_frame","type":"boolean","conditional_const":[{"when_param":"workspace","when_value":true,"value":null}]}
	]`); err == nil {
		t.Fatal("expected null conditional_const value to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"workspace","type":"boolean"},
		{"key":"resolution","type":"select","options":["480p"],"conditional_enum":[{"when_param":"workspace","when_value":true,"options":["480p","480p"]}]}
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
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"image_count","type":"number","min":1,"max":15},
		{"key":"sequential_image_generation","type":"select","options":["disabled","auto"]},
		{"key":"seed","type":"number","requires_value":[{"parameter":"sequential_image_generation","value":"auto"}]}
	]`); err == nil {
		t.Fatal("expected unknown requires_value field to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"image_count","type":"number","min":1,"max":15},
		{"key":"sequential_image_generation","type":"select","options":["disabled","auto"]},
		{"key":"seed","type":"number","requires_value":[{"param":1,"value":"auto"}]}
	]`); err == nil {
		t.Fatal("expected non-string requires_value param to be rejected")
	}
	if err := ValidateModelParamConfig(AdapterVolcen, []string{CapabilityVideo}, `[
		{"key":"image_count","type":"number","min":1,"max":15},
		{"key":"sequential_image_generation","type":"select","options":["disabled","auto"]},
		{"key":"seed","type":"number","requires_value":[{"param":null,"value":"auto"}]}
	]`); err == nil {
		t.Fatal("expected null requires_value param to be rejected")
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
		"Profile Video", CapabilityVideo, "",
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

func TestValidateGenRequestReturnsStructuredInputCountError(t *testing.T) {
	def := ResolveModelDef(
		"custom-i2v", AdapterVolcen,
		"Custom I2V", CapabilityVideoI2V, "",
		true, 2, 0,
		"", "",
	)
	err := ValidateGenRequest(def, GenRequest{
		OutputType: CapabilityVideoI2V,
		ImageCount: 3,
	})
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "INVALID_INPUT_COUNT" || validationErr.Field != "image" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
	if validationErr.RequiredMin == nil || *validationErr.RequiredMin != 1 {
		t.Fatalf("expected required_min=1, got %#v", validationErr.RequiredMin)
	}
	if validationErr.AllowedMax == nil || *validationErr.AllowedMax != 2 {
		t.Fatalf("expected allowed_max=2, got %#v", validationErr.AllowedMax)
	}
	if validationErr.ActualCount == nil || *validationErr.ActualCount != 3 {
		t.Fatalf("expected actual_count=3, got %#v", validationErr.ActualCount)
	}
}

func TestValidateGenRequestReturnsStructuredUnsupportedOutputTypeError(t *testing.T) {
	def := ResolveModelDef(
		"custom-image", AdapterVolcen,
		"Custom Image", CapabilityImage, "",
		false, 0, 0,
		"", "",
	)
	err := ValidateGenRequest(def, GenRequest{
		OutputType: CapabilityVideo,
	})
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "UNSUPPORTED_OUTPUT_TYPE" || validationErr.Field != "output_type" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
	if len(validationErr.AllowedValues) != 1 || validationErr.AllowedValues[0] != CapabilityImage {
		t.Fatalf("expected allowed output types to preserve model capabilities, got %#v", validationErr.AllowedValues)
	}
}

func TestValidateGenerationParamsValidatesStringParamType(t *testing.T) {
	def := ResolveModelDef(
		"profile-image", AdapterOpenAICompat,
		"Profile Image", CapabilityImage, "",
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
		ID:           "schema-video",
		DisplayName:  "Schema Video",
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
	if len(validationErr.AllowedValues) != 3 || validationErr.AllowedValues[0] != 29 || validationErr.AllowedValues[1] != 33 || validationErr.AllowedValues[2] != 37 {
		t.Fatalf("expected numeric allowed values to keep numeric types, got %#v", validationErr.AllowedValues)
	}
	if validationErr.SuggestedFix["frames"] != 29 {
		t.Fatalf("expected first schema enum value as suggested fix, got %#v", validationErr.SuggestedFix)
	}
}

func TestValidateGenerationParamsAppliesImageSizeSchemaConstraints(t *testing.T) {
	def := &ModelDef{
		ID:           "schema-image",
		DisplayName:  "Schema Image",
		Capabilities: []string{CapabilityImage},
		SupportedParams: []ParamDef{
			{
				Key:     "image_size",
				Type:    "string",
				Default: "auto",
				JSONSchema: map[string]any{
					"pattern": `^(auto|[1-9][0-9]{0,3}x[1-9][0-9]{0,3})$`,
					"x_movscript_image_size": map[string]any{
						"allow_auto":         true,
						"width_multiple_of":  16,
						"height_multiple_of": 16,
						"max_width":          3840,
						"max_height":         2160,
						"min_aspect_ratio":   1.0 / 3.0,
						"max_aspect_ratio":   3.0,
					},
				},
			},
		},
		SupportedParamsExplicit: true,
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"image_size":"1536x864"}`, "", 0); err != nil {
		t.Fatalf("expected flexible image size to validate: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"image_size":"auto"}`, "", 0); err != nil {
		t.Fatalf("expected auto image size to validate: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"image_size":"1537x864"}`, "", 0); err == nil {
		t.Fatal("expected non-multiple image width to be rejected")
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"image_size":"3840x1000"}`, "", 0); err == nil {
		t.Fatal("expected out-of-range aspect ratio to be rejected")
	}
}

func TestValidateAndNormalizeGenerationParamsReturnsCanonicalKeys(t *testing.T) {
	def := ResolveModelDef(
		"custom-image", AdapterVolcen,
		"Custom Image", CapabilityImage, "",
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

func TestValidateAndNormalizeGenerationParamsCanonicalizesAliases(t *testing.T) {
	aliases := generationParamAliasMap()
	for from, to := range aliases {
		paramType, value := aliasTestParamValue(to)
		params := CanonicalizeGenerationParams(map[string]any{from: value})
		if params[to] != value {
			t.Fatalf("expected runtime alias %q to canonicalize to %q, got %#v", from, to, params)
		}
		if _, ok := params[from]; ok {
			t.Fatalf("expected runtime alias %q to be removed after canonicalization, got %#v", from, params)
		}

		def := &ModelDef{
			DisplayName:             "Alias Test",
			Capabilities:            []string{CapabilityImage},
			SupportedParams:         []ParamDef{{Key: to, Type: paramType}},
			SupportedParamsExplicit: true,
		}
		body, err := json.Marshal(map[string]any{from: value})
		if err != nil {
			t.Fatal(err)
		}
		normalized, err := ValidateAndNormalizeGenerationParams(def, CapabilityImage, string(body), "", 0)
		if err != nil {
			t.Fatalf("expected runtime alias %q to validate as %q: %v", from, to, err)
		}
		if normalized[to] != value {
			t.Fatalf("expected validated params to contain %q, got %#v", to, normalized)
		}
		if _, ok := normalized[from]; ok {
			t.Fatalf("expected validated params to omit alias %q, got %#v", from, normalized)
		}
	}
}

func aliasTestParamValue(key string) (string, any) {
	switch key {
	case "image_size":
		return "string", "1024x1024"
	case "prompt_strength":
		return "number", float64(0.5)
	case "image_count":
		return "number", float64(1)
	case "fixed_camera", "audio":
		return "boolean", true
	default:
		return "string", "value"
	}
}

func TestNormalizeParamDefsForUICanonicalizesAliases(t *testing.T) {
	aliases := generationParamAliasMap()
	for from, to := range aliases {
		params := NormalizeParamDefsForUI([]ParamDef{{Key: from, Type: "select", Options: []string{"value"}}})
		if len(params) != 1 || params[0].Key != to {
			t.Fatalf("expected alias %q to normalize to %q, got %#v", from, to, params)
		}
	}
}

func TestValidateAndNormalizeGenerationParamsIgnoresJobMetadata(t *testing.T) {
	def := ResolveModelDef(
		"grok-imagine-image-edit", AdapterOpenAICompat,
		"Grok Imagine Image Edit", CapabilityImageEdit, "",
		true, 1, 0,
		"image[]", `[
			{"key":"image_size","label":"尺寸","type":"select","options":["1024x1024"]},
			{"key":"quality","label":"质量","type":"select","options":["standard"]}
		]`,
	)
	params, err := ValidateAndNormalizeGenerationParams(def, CapabilityImageEdit, `{
		"source":"workspace_submit",
		"resource_id":123,
		"job_id":456,
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
			ConditionalEnum: []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"480p"}}}},
		{Key: "return_last_frame", Label: "返回尾帧", Type: "boolean", Default: false,
			ConditionalConst: []ParamConditionalConst{{WhenParam: "workspace", WhenValue: true, Value: false}}},
		{Key: "image_count", Label: "生成张数", Type: "number", Min: 1, Max: 15, Step: 1,
			RequiresValue: []ParamRequiresValue{{Param: "sequential_image_generation", Value: "auto"}}},
		{Key: "sequential_image_generation", Label: "组图", Type: "select", Options: []string{"disabled", "auto"}, Default: "disabled"},
		{Key: "seed", Label: "种子", Type: "number", Min: -1, Max: 100, Step: 1},
		{Key: "audio", Label: "音频", Type: "boolean", Default: true},
		{Key: "workspace", Label: "样片", Type: "boolean", Default: false},
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
	if !schemaHasConditionalPropertyRule(allOf, "workspace", true, "resolution", "enum", []any{"480p"}, false) {
		t.Fatalf("expected workspace=true to restrict resolution enum, got %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "workspace", true, "return_last_frame", "const", false, false) {
		t.Fatalf("expected workspace=true to force return_last_frame=false, got %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "", nil, "sequential_image_generation", "const", "auto", true) {
		t.Fatalf("expected image_count to require sequential_image_generation=auto, got %#v", allOf)
	}
}

func TestParamDefPreservesExplicitZeroNumberBounds(t *testing.T) {
	const raw = `[{"key":"prompt_strength","label":"Prompt Strength","type":"number","min":0,"max":0}]`
	params, explicit := ResolveEffectiveParams(AdapterVolcen, []string{CapabilityImage}, raw)
	if !explicit || len(params) != 1 {
		t.Fatalf("expected explicit custom params, got explicit=%v params=%#v", explicit, params)
	}
	param := params[0]
	if !param.hasMin() || !param.hasMax() {
		t.Fatalf("expected explicit zero number bounds to keep presence, got %#v", param)
	}
	encoded, err := json.Marshal(param)
	if err != nil {
		t.Fatalf("marshal param: %v", err)
	}
	if !strings.Contains(string(encoded), `"min":0`) || !strings.Contains(string(encoded), `"max":0`) {
		t.Fatalf("expected explicit zero bounds in JSON contract, got %s", string(encoded))
	}
	schema := ParamsSchema(params)
	props := schema["properties"].(map[string]any)
	strength := props["prompt_strength"].(map[string]any)
	if !schemaNumberEquals(strength["minimum"], 0) || !schemaNumberEquals(strength["maximum"], 0) {
		t.Fatalf("expected zero bounds in params schema, got %#v", strength)
	}
	def := &ModelDef{
		ID:                      "zero-bound",
		DisplayName:             "Zero Bound",
		Capabilities:            []string{CapabilityImage},
		SupportedParams:         params,
		SupportedParamsExplicit: true,
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"prompt_strength":1}`, "", 0); err == nil {
		t.Fatal("expected explicit zero max to reject value above zero")
	}
	if err := ValidateGenerationParams(def, CapabilityImage, `{"prompt_strength":0}`, "", 0); err != nil {
		t.Fatalf("expected zero value to satisfy explicit zero bounds: %v", err)
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
			{Key: "workspace", Type: "boolean"},
			{Key: "resolution", Type: "select", Options: []string{"480p", "720p"}, ConditionalEnum: []ParamConditionalEnum{{WhenParam: "workspace", WhenValue: true, Options: []string{"480p"}}}},
			{Key: "return_last_frame", Type: "boolean", ConditionalConst: []ParamConditionalConst{{WhenParam: "workspace", WhenValue: true, Value: false}}},
			{Key: "sequential_image_generation", Type: "select", Options: []string{"disabled", "auto"}},
			{Key: "image_count", Type: "number", Min: 1, Max: 15, Step: 1, RequiresValue: []ParamRequiresValue{{Param: "sequential_image_generation", Value: "auto"}}},
		},
		SupportedParamsExplicit: true,
	}
	var validationErr *ValidationError
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"5","frames":29}`, "", 0); err == nil {
		t.Fatal("expected declared conflict rule to reject duration + frames")
	} else if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError for conflict, got %T %[1]v", err)
	} else if value, ok := validationErr.SuggestedFix["frames"]; !ok || value != nil {
		t.Fatalf("expected conflict suggested fix to remove frames, got %#v", validationErr.SuggestedFix)
	}
	err := ValidateGenerationParams(def, CapabilityVideo, `{"workspace":true,"resolution":"720p"}`, "", 0)
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T %[1]v", err)
	}
	if validationErr.SuggestedFix["resolution"] != "480p" {
		t.Fatalf("expected resolution suggested fix, got %#v", validationErr.SuggestedFix)
	}
	err = ValidateGenerationParams(def, CapabilityVideo, `{"workspace":true,"return_last_frame":true}`, "", 0)
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

func TestExplicitSupportedParamsDoNotInheritLegacyCrossParamRules(t *testing.T) {
	def := &ModelDef{
		ID:           "declared-rules-without-conflict",
		DisplayName:  "Declared Rules Without Conflict",
		Capabilities: []string{CapabilityVideo},
		SupportedParams: []ParamDef{
			{Key: "duration", Type: "select", Options: []string{"5", "10"}},
			{Key: "frames", Type: "number", Min: 29, Max: 289, Step: 4},
			{Key: "workspace", Type: "boolean"},
			{Key: "resolution", Type: "select", Options: []string{"480p", "720p"}},
			{Key: "return_last_frame", Type: "boolean"},
			{Key: "sequential_image_generation", Type: "select", Options: []string{"disabled", "auto"}},
			{Key: "image_count", Type: "number", Min: 1, Max: 15, Step: 1},
		},
		SupportedParamsExplicit: true,
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"5","frames":29}`, "", 0); err != nil {
		t.Fatalf("expected explicit params without conflicts_with to allow duration + frames: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"workspace":true,"resolution":"720p","return_last_frame":true}`, "", 0); err != nil {
		t.Fatalf("expected explicit params without conditional rules to allow workspace combination: %v", err)
	}
	if err := ValidateGenerationParams(def, CapabilityVideo, `{"image_count":3,"sequential_image_generation":"disabled"}`, "", 0); err != nil {
		t.Fatalf("expected explicit params without requires_value to allow image_count combination: %v", err)
	}
}

func TestAdapterDefaultParamsKeepLegacyCrossParamRules(t *testing.T) {
	def := &ModelDef{
		ID:           "adapter-default-legacy-rules",
		DisplayName:  "Adapter Default Legacy Rules",
		Capabilities: []string{CapabilityVideo},
		SupportedParams: []ParamDef{
			{Key: "duration", Type: "select", Options: []string{"5", "10"}},
			{Key: "frames", Type: "number", Min: 29, Max: 289, Step: 4},
		},
	}
	err := ValidateGenerationParams(def, CapabilityVideo, `{"duration":"5","frames":29}`, "", 0)
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected legacy ValidationError, got %T %[1]v", err)
	}
	if validationErr.Code != "INVALID_PARAMETER_COMBINATION" || validationErr.Field != "frames" {
		t.Fatalf("unexpected legacy validation error: %#v", validationErr)
	}
}

func TestModelInputsForDefReflectsTaskRequirements(t *testing.T) {
	def := ResolveModelDef(
		"custom-i2v", AdapterVolcen,
		"Custom I2V", CapabilityVideoI2V, "",
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

func TestModelInputsForDefReflectsOptionalCustomImageInputs(t *testing.T) {
	def := ResolveModelDef(
		"custom-image-model", AdapterVolcen,
		"Custom Image Model", CapabilityImage, "",
		false, 4, 0,
		"", "",
	)
	inputs := modelInputsForDef(def)
	if !def.AcceptsImageInput {
		t.Fatalf("expected custom image input limit to set accepts image input")
	}
	if inputs.Image.Min != 0 || inputs.Image.Max != 4 {
		t.Fatalf("expected optional image input min=0 max=4, got %#v", inputs.Image)
	}
	if inputs.Video.Min != 0 || inputs.Video.Max != 0 {
		t.Fatalf("expected no video input requirement, got %#v", inputs.Video)
	}
}

func TestModelInputsForDefAllowsOptionalImageInputForMixedImageEditModels(t *testing.T) {
	def := ResolveModelDef(
		"custom-image-and-edit", AdapterGemini,
		"Custom Image And Edit", strings.Join([]string{CapabilityImage, CapabilityImageEdit}, ","), "",
		true, -1, 0,
		"", "",
	)
	inputs := modelInputsForDef(def)
	if !def.AcceptsImageInput {
		t.Fatalf("expected mixed image/edit model to accept image input")
	}
	if inputs.Image.Min != 0 || inputs.Image.Max != -1 {
		t.Fatalf("expected mixed image/edit model image input min=0 max=-1, got %#v", inputs.Image)
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

func findTemplateParam(params []ParamDef, key string) (ParamDef, bool) {
	for _, p := range params {
		if p.Key == key {
			return p, true
		}
	}
	return ParamDef{}, false
}

func intString(value int) string {
	return strconv.Itoa(value)
}

func parseIntOption(value string) (int, bool) {
	parsed, err := strconv.Atoi(value)
	return parsed, err == nil
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
