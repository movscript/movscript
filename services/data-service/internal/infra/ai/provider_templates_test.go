package ai

import (
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

func TestComboTemplatesKeepNewAPIAsAggregatorProvider(t *testing.T) {
	templates := ComboTemplates()
	foundNewAPI := false
	for _, template := range templates {
		if template.ProviderType != persistencemodel.AIProviderTypeNewAPI {
			continue
		}
		foundNewAPI = true
		if template.ProviderCategory != persistencemodel.AIProviderCategoryAggregatorGateway {
			t.Fatalf("New API combo category = %q, want aggregator gateway", template.ProviderCategory)
		}
		if template.ProviderKind != persistencemodel.AIProviderKindNewAPI {
			t.Fatalf("New API combo provider kind = %q, want new_api", template.ProviderKind)
		}
	}
	if !foundNewAPI {
		t.Fatal("expected at least one New API combo template")
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
	if openai.ProviderType != persistencemodel.AIProviderTypeNewAPI {
		t.Fatalf("first openai combo provider type = %q, want New API aggregator", openai.ProviderType)
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
