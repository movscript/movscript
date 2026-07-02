package ai

import (
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestProviderTemplatesDeclareOfficialArkTrustBoundary(t *testing.T) {
	templates := ProviderTemplates()
	var ark ProviderTemplate
	for _, template := range templates {
		if template.ProviderKind == persistencemodel.AIProviderKindVolcengineArk {
			ark = template
			break
		}
	}
	if ark.ProviderKind == "" {
		t.Fatal("expected built-in Volcengine Ark provider template")
	}
	if ark.ProviderCategory != persistencemodel.AIProviderCategoryOfficialPlatform ||
		ark.ProviderType != persistencemodel.AIProviderTypeVolcen ||
		ark.Profile != persistencemodel.AIProviderProfileArk ||
		ark.DefaultAdapterType != AdapterVolcen {
		t.Fatalf("unexpected Ark provider template: %#v", ark)
	}
	if ark.Capabilities["asset_library"] != true || ark.Capabilities["generated_artifact_trust"] != true {
		t.Fatalf("Ark provider template must own asset library and generated artifact trust: %#v", ark.Capabilities)
	}
}

func TestComboTemplatesKeepRelayGatewayAsAggregatorProvider(t *testing.T) {
	templates := ComboTemplates()
	foundRelayGateway := false
	for _, template := range templates {
		if template.ProviderType != persistencemodel.AIProviderTypeRelayGateway {
			continue
		}
		foundRelayGateway = true
		if template.ProviderCategory != persistencemodel.AIProviderCategoryAggregatorGateway {
			t.Fatalf("Relay gateway combo category = %q, want aggregator gateway", template.ProviderCategory)
		}
		if template.ProviderKind != persistencemodel.AIProviderKindRelayGateway {
			t.Fatalf("Relay gateway combo provider kind = %q, want relay_gateway", template.ProviderKind)
		}
	}
	if !foundRelayGateway {
		t.Fatal("expected at least one Relay gateway combo template")
	}
}

func TestComboTemplateRulesKeepGenericOpenAICompatibleGateway(t *testing.T) {
	templates := ComboTemplates()
	var openai ComboTemplate
	for _, template := range templates {
		if template.ModelTemplateKey == "openai:gpt-5.2" {
			openai = template
			break
		}
	}
	if openai.ModelTemplateKey == "" {
		t.Fatal("expected combo template for openai:gpt-5.2")
	}
	if openai.ProviderType != persistencemodel.AIProviderTypeRelayGateway {
		t.Fatalf("first openai combo provider type = %q, want relay gateway aggregator", openai.ProviderType)
	}
	var officialOpenAI ComboTemplate
	for _, template := range templates {
		if template.ModelTemplateKey == "openai:gpt-5.2" && template.ProviderType == persistencemodel.AIProviderTypeOpenAI {
			officialOpenAI = template
			break
		}
	}
	if officialOpenAI.ProviderKind != persistencemodel.AIProviderKindOpenAICompatGateway {
		t.Fatalf("official openai combo provider kind = %q, want OpenAI official", officialOpenAI.ProviderKind)
	}
}

func TestComboTemplatesSkipTemplateOnlyModels(t *testing.T) {
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "minimax:mimo-v2-omni" {
			t.Fatalf("template-only model should not generate combo template: %#v", template)
		}
	}
}

func TestComboTemplatesIncludeMiniMaxSpeechOfficialAudio(t *testing.T) {
	var found ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "minimax:speech-2.8-hd" && template.ProviderKind == "minimax_official" {
			found = template
			break
		}
	}
	if found.ModelTemplateKey == "" {
		t.Fatal("expected MiniMax Speech official combo template")
	}
	if found.AdapterType != AdapterMiniMax {
		t.Fatalf("adapter_type = %q, want %q", found.AdapterType, AdapterMiniMax)
	}
	if len(found.APIKinds) != 1 || found.APIKinds[0] != "audio" {
		t.Fatalf("api_kinds = %#v, want [audio]", found.APIKinds)
	}
}

func TestComboTemplatesSkipMiniMaxMimoUntilOfficialProtocolIsVerified(t *testing.T) {
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "minimax:mimo-v2-omni" {
			t.Fatalf("template-only Mimo v2 Omni should not generate combo routes until the official provider/protocol is verified: %#v", template)
		}
	}
}

func TestComboTemplatesIncludeDashScopeHTTPTextToSpeech(t *testing.T) {
	var image ComboTemplate
	var qwen ComboTemplate
	var cosy ComboTemplate
	var realtime ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "dashscope:qwen-image" && template.ProviderKind == "alibaba_dashscope_official" {
			image = template
		}
		if template.ModelTemplateKey == "dashscope:qwen3-tts-flash" && template.ProviderKind == "alibaba_dashscope_official" {
			qwen = template
		}
		if template.ModelTemplateKey == "dashscope:cosyvoice-v3-flash" && template.ProviderKind == "alibaba_dashscope_official" {
			cosy = template
		}
		if template.ModelTemplateKey == "dashscope:qwen3-tts-flash-realtime" && template.ProviderKind == "alibaba_dashscope_official" {
			realtime = template
		}
	}
	if qwen.AdapterType != AdapterDashScope || len(qwen.APIKinds) != 1 || qwen.APIKinds[0] != "audio" {
		t.Fatalf("qwen combo = %#v", qwen)
	}
	if cosy.AdapterType != AdapterDashScope || len(cosy.APIKinds) != 1 || cosy.APIKinds[0] != "audio" {
		t.Fatalf("cosy combo = %#v", cosy)
	}
	if realtime.AdapterType != AdapterDashScope || len(realtime.APIKinds) != 1 || realtime.APIKinds[0] != "audio" {
		t.Fatalf("realtime combo = %#v", realtime)
	}
	if image.AdapterType != AdapterDashScope || len(image.APIKinds) != 1 || image.APIKinds[0] != "image" {
		t.Fatalf("image combo = %#v", image)
	}
}

func TestComboTemplatesIncludeGeminiTextToSpeech(t *testing.T) {
	var found ComboTemplate
	var lyria ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "gemini:gemini-3-1-flash-tts-preview" && template.ProviderKind == "google_gemini_official" {
			found = template
		}
		if template.ModelTemplateKey == "gemini:lyria-3-clip-preview" && template.ProviderKind == "google_gemini_official" {
			lyria = template
		}
	}
	if found.AdapterType != AdapterGemini || len(found.APIKinds) != 1 || found.APIKinds[0] != "audio" {
		t.Fatalf("gemini tts combo = %#v", found)
	}
	if lyria.AdapterType != AdapterGemini || len(lyria.APIKinds) != 1 || lyria.APIKinds[0] != "audio" {
		t.Fatalf("gemini lyria combo = %#v", lyria)
	}
}

func TestComboTemplatesOwnXAIOfficialVideoAdapters(t *testing.T) {
	var video ComboTemplate
	var imageToVideo ComboTemplate
	counts := map[string]int{}
	for _, template := range ComboTemplates() {
		if template.ProviderKind != "xai_official" {
			continue
		}
		counts[template.ModelTemplateKey]++
		switch template.ModelTemplateKey {
		case "xai:grok-imagine-video":
			video = template
		case "xai:grok-imagine-video-1.5":
			imageToVideo = template
		}
	}
	if video.AdapterType != AdapterOfficialVideoGenerations {
		t.Fatalf("xAI official t2v combo adapter_type = %q, want %q", video.AdapterType, AdapterOfficialVideoGenerations)
	}
	if imageToVideo.AdapterType != AdapterOpenAIVideoMultipart {
		t.Fatalf("xAI official i2v combo adapter_type = %q, want %q", imageToVideo.AdapterType, AdapterOpenAIVideoMultipart)
	}
	if counts["xai:grok-imagine-video"] != 1 || counts["xai:grok-imagine-video-1.5"] != 1 {
		t.Fatalf("xAI official video combo counts = %#v, want exactly one per video template", counts)
	}
}

func TestAWSBedrockStaysProviderOnly(t *testing.T) {
	var provider ProviderTemplate
	for _, template := range ProviderTemplates() {
		if template.ProviderKind == "aws_bedrock" {
			provider = template
			break
		}
	}
	if provider.ProviderKind == "" {
		t.Fatal("expected AWS Bedrock provider template")
	}
	if provider.ProviderType != "aws" || provider.Profile != "bedrock" || provider.DefaultAdapterType != AdapterOpenAICompat {
		t.Fatalf("unexpected AWS Bedrock provider template: %#v", provider)
	}
	for _, template := range ComboTemplates() {
		if template.ProviderKind == "aws_bedrock" || strings.HasPrefix(template.ModelTemplateKey, "aws-bedrock:") {
			t.Fatalf("AWS Bedrock should not be modeled as a lab-derived combo template: %#v", template)
		}
	}
}

func TestAWSBedrockOpenAIStaysProviderOnly(t *testing.T) {
	var provider ProviderTemplate
	for _, template := range ProviderTemplates() {
		if template.ProviderKind == "aws_bedrock_openai" {
			provider = template
			break
		}
	}
	if provider.ProviderKind == "" {
		t.Fatal("expected AWS Bedrock OpenAI provider template")
	}
	if provider.ProviderType != "aws" || provider.Profile != "bedrock_openai" || provider.DefaultAdapterType != AdapterOpenAICompat {
		t.Fatalf("unexpected AWS Bedrock OpenAI provider template: %#v", provider)
	}
	for _, template := range ComboTemplates() {
		if template.ProviderKind == "aws_bedrock_openai" || strings.HasPrefix(template.ModelTemplateKey, "aws-bedrock-openai:") {
			t.Fatalf("AWS Bedrock OpenAI should not be modeled as a lab-derived combo template: %#v", template)
		}
	}
}

func TestLocalAudioRuntimeProviderTemplateOwnsOpenSourceAudioCombos(t *testing.T) {
	var provider ProviderTemplate
	for _, template := range ProviderTemplates() {
		if template.ProviderKind == "local_audio_runtime" {
			provider = template
			break
		}
	}
	if provider.ProviderKind == "" {
		t.Fatal("expected local audio runtime provider template")
	}
	if provider.ProviderType != "local" || provider.Profile != "audio" || provider.ProviderCategory != persistencemodel.AIProviderCategoryLocalEndpoint || provider.DefaultAdapterType != AdapterLocal {
		t.Fatalf("unexpected local audio provider template: %#v", provider)
	}
	if provider.Capabilities["audio_runtime"] != true || provider.Capabilities["local_endpoint"] != true {
		t.Fatalf("local audio provider capabilities = %#v, want audio_runtime local endpoint", provider.Capabilities)
	}
	found := map[string]bool{}
	for _, template := range ComboTemplates() {
		if !strings.HasPrefix(template.ModelTemplateKey, "open-source-audio:") {
			continue
		}
		if template.ProviderKind != "local_audio_runtime" || template.ProviderType != "local" || template.AdapterType != AdapterLocal {
			t.Fatalf("open-source audio combo should use local runtime only: %#v", template)
		}
		found[template.ModelTemplateKey] = true
	}
	for _, key := range []string{"open-source-audio:musicgen", "open-source-audio:ace-step", "open-source-audio:ace-step-1-5"} {
		if !found[key] {
			t.Fatalf("missing local audio runtime combo for %s", key)
		}
	}
}

func TestComboTemplatesIncludeSeedASR(t *testing.T) {
	var found ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "volcengine:doubao-seed-asr-2-0" && template.ProviderKind == "volcengine_ark_official" {
			found = template
			break
		}
	}
	if found.ModelTemplateKey == "" {
		t.Fatal("expected Seed ASR combo template")
	}
	if found.AdapterType != AdapterVolcen || len(found.APIKinds) != 1 || found.APIKinds[0] != "audio" {
		t.Fatalf("seed asr combo = %#v", found)
	}
	if found.ProviderModelID != "volc.seedasr.auc" {
		t.Fatalf("provider_model_id = %q, want volc.seedasr.auc", found.ProviderModelID)
	}
}

func TestComboTemplatesInclude83ziSeedance20ProviderModelOverride(t *testing.T) {
	var found ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "volcengine:seedance-2-0" && template.ProviderKind == "83zi_sd2_gateway" {
			found = template
			break
		}
	}
	if found.ModelTemplateKey == "" {
		t.Fatal("expected 83zi Seedance 2.0 combo template")
	}
	if found.AdapterType != AdapterVyroSeedance || found.DefaultPublicModelID != "seedance-2-0" {
		t.Fatalf("83zi seedance combo = %#v", found)
	}
	if found.ProviderModelID != "Seedance-2.0" {
		t.Fatalf("provider_model_id = %q, want Seedance-2.0", found.ProviderModelID)
	}
}

func TestComboTemplatesIncludeMurekaOfficialMusic(t *testing.T) {
	var song ComboTemplate
	var instrumental ComboTemplate
	var lyrics ComboTemplate
	var extension ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "mureka:song-generation" && template.ProviderKind == "mureka_official" {
			song = template
		}
		if template.ModelTemplateKey == "mureka:instrumental-generation" && template.ProviderKind == "mureka_official" {
			instrumental = template
		}
		if template.ModelTemplateKey == "mureka:lyrics-generation" && template.ProviderKind == "mureka_official" {
			lyrics = template
		}
		if template.ModelTemplateKey == "mureka:song-extension" && template.ProviderKind == "mureka_official" {
			extension = template
		}
	}
	if song.AdapterType != AdapterMureka || len(song.APIKinds) != 1 || song.APIKinds[0] != "audio" {
		t.Fatalf("song combo = %#v", song)
	}
	if instrumental.AdapterType != AdapterMureka || len(instrumental.APIKinds) != 1 || instrumental.APIKinds[0] != "audio" {
		t.Fatalf("instrumental combo = %#v", instrumental)
	}
	if lyrics.AdapterType != AdapterMureka || len(lyrics.APIKinds) != 1 || lyrics.APIKinds[0] != ModelAPIKindOpenAIChatCompletions {
		t.Fatalf("lyrics combo = %#v", lyrics)
	}
	if extension.AdapterType != AdapterMureka || len(extension.APIKinds) != 1 || extension.APIKinds[0] != "audio" {
		t.Fatalf("extension combo = %#v", extension)
	}
}

func TestComboTemplatesIncludeStabilityOfficialAudio(t *testing.T) {
	var stable3 ComboTemplate
	var stable25 ComboTemplate
	for _, template := range ComboTemplates() {
		if template.ModelTemplateKey == "stability:stable-audio-3" && template.ProviderKind == "stability_official" {
			stable3 = template
		}
		if template.ModelTemplateKey == "stability:stable-audio-2-5" && template.ProviderKind == "stability_official" {
			stable25 = template
		}
	}
	if stable3.AdapterType != AdapterStability || len(stable3.APIKinds) != 1 || stable3.APIKinds[0] != "audio" {
		t.Fatalf("stable audio 3 combo = %#v", stable3)
	}
	if stable25.AdapterType != AdapterStability || len(stable25.APIKinds) != 1 || stable25.APIKinds[0] != "audio" {
		t.Fatalf("stable audio 2.5 combo = %#v", stable25)
	}
	if stable25.ProviderModelID != "stable-audio-2.5" {
		t.Fatalf("stable audio 2.5 provider_model_id = %q", stable25.ProviderModelID)
	}
}
