package ai

import (
	"strings"
)

type ProviderTemplate struct {
	ProviderType                 string         `json:"provider_type"`
	Profile                      string         `json:"profile,omitempty"`
	ProviderKind                 string         `json:"provider_kind"`
	ProviderCategory             string         `json:"provider_category"`
	DisplayName                  string         `json:"display_name"`
	Description                  string         `json:"description,omitempty"`
	DefaultAdapterType           string         `json:"default_adapter_type"`
	DefaultAdapterKey            string         `json:"default_adapter_key"`
	DefaultBaseURLPrefix         string         `json:"default_base_url_prefix"`
	Capabilities                 map[string]any `json:"capabilities_json,omitempty"`
	AssetLibraryCapabilities     map[string]any `json:"asset_library_capabilities_json,omitempty"`
	GeneratedArtifactTrustPolicy map[string]any `json:"generated_artifact_trust_policy_json,omitempty"`
	UpstreamProviderKinds        []string       `json:"upstream_provider_kinds_json,omitempty"`
	IsBuiltin                    bool           `json:"is_builtin"`
	IsEnabled                    bool           `json:"is_enabled"`
	Version                      string         `json:"version"`
}

type ComboTemplate struct {
	ComboTemplateKey     string   `json:"combo_template_key"`
	ModelTemplateKey     string   `json:"model_template_key"`
	ProviderType         string   `json:"provider_type"`
	Profile              string   `json:"profile,omitempty"`
	ProviderKind         string   `json:"provider_kind"`
	ProviderCategory     string   `json:"provider_category"`
	AdapterType          string   `json:"adapter_type"`
	DefaultPublicModelID string   `json:"default_public_model_id"`
	ProviderModelID      string   `json:"provider_model_id"`
	APIKinds             []string `json:"api_kinds,omitempty"`
	RouteGroup           string   `json:"route_group"`
	Priority             int      `json:"priority"`
	CapacityWeight       int      `json:"capacity_weight"`
	IsBuiltin            bool     `json:"is_builtin"`
	IsEnabled            bool     `json:"is_enabled"`
	Version              string   `json:"version"`
}

type comboProviderRule struct {
	ProviderType      string
	Profile           string
	AdapterType       string
	Lab               string
	ExcludeLabs       []string
	ModelTemplateKey  string
	ProviderModelID   string
	IDPrefix          string
	ExcludeIDPrefixes []string
	ProviderKind      string
	ProviderCategory  string
}

func ProviderTemplates() []ProviderTemplate {
	out := make([]ProviderTemplate, 0, len(providerTemplateSources))
	for _, template := range providerTemplateSources {
		if template.DefaultAdapterType == "" {
			template.DefaultAdapterType = template.DefaultAdapterKey
		}
		if template.DefaultAdapterKey == "" {
			template.DefaultAdapterKey = template.DefaultAdapterType
		}
		template.Capabilities = cloneProviderTemplateMap(template.Capabilities)
		template.AssetLibraryCapabilities = cloneProviderTemplateMap(template.AssetLibraryCapabilities)
		template.GeneratedArtifactTrustPolicy = cloneProviderTemplateMap(template.GeneratedArtifactTrustPolicy)
		template.UpstreamProviderKinds = append([]string(nil), template.UpstreamProviderKinds...)
		out = append(out, template)
	}
	return out
}

func ComboTemplates() []ComboTemplate {
	templates := CatalogTemplates()
	out := make([]ComboTemplate, 0, len(templates))
	for _, template := range templates {
		if strings.TrimSpace(template.SourceStatus) == "template_only" {
			continue
		}
		for _, rule := range comboProvidersForModelTemplate(template) {
			adapterType := comboRuleAdapterType(rule)
			out = append(out, ComboTemplate{
				ComboTemplateKey:     template.ID + "@" + rule.ProviderKind,
				ModelTemplateKey:     template.ID,
				ProviderType:         rule.ProviderType,
				Profile:              rule.Profile,
				ProviderKind:         rule.ProviderKind,
				ProviderCategory:     rule.ProviderCategory,
				AdapterType:          adapterType,
				DefaultPublicModelID: template.DefaultPublicModelID,
				ProviderModelID:      comboRuleProviderModelID(rule, template),
				APIKinds:             comboAPIKindsForTemplate(template),
				RouteGroup:           "default",
				Priority:             0,
				CapacityWeight:       1,
				IsBuiltin:            true,
				IsEnabled:            true,
				Version:              "builtin.v1",
			})
		}
	}
	return out
}

func comboProvidersForModelTemplate(template CatalogTemplate) []comboProviderRule {
	out := make([]comboProviderRule, 0, len(comboProviderRules))
	for _, rule := range comboProviderRules {
		if strings.TrimSpace(rule.Lab) != "" && strings.TrimSpace(rule.Lab) != strings.TrimSpace(template.Lab) {
			continue
		}
		if hasString(rule.ExcludeLabs, strings.TrimSpace(template.Lab)) {
			continue
		}
		if strings.TrimSpace(rule.ModelTemplateKey) != "" && strings.TrimSpace(rule.ModelTemplateKey) != strings.TrimSpace(template.ID) {
			continue
		}
		if rule.IDPrefix != "" && !strings.HasPrefix(template.ID, rule.IDPrefix) {
			continue
		}
		excluded := false
		for _, prefix := range rule.ExcludeIDPrefixes {
			if prefix != "" && strings.HasPrefix(template.ID, prefix) {
				excluded = true
				break
			}
		}
		if excluded {
			continue
		}
		if !adapterSupportsTemplateCapabilities(comboRuleAdapterType(rule), template.Capabilities) {
			continue
		}
		out = append(out, rule)
	}
	return out
}

func adapterSupportsTemplateCapabilities(adapterType string, capabilities []string) bool {
	if len(capabilities) == 0 {
		return false
	}
	for _, capability := range capabilities {
		if !AdapterSupportsRuntimeCapability(adapterType, capability) {
			return false
		}
	}
	return true
}

func comboRuleAdapterType(rule comboProviderRule) string {
	if adapterType := strings.TrimSpace(rule.AdapterType); adapterType != "" {
		return adapterType
	}
	for _, provider := range ProviderTemplates() {
		if strings.TrimSpace(provider.ProviderKind) == strings.TrimSpace(rule.ProviderKind) {
			return strings.TrimSpace(provider.DefaultAdapterType)
		}
	}
	return ""
}

func comboRuleProviderModelID(rule comboProviderRule, template CatalogTemplate) string {
	if providerModelID := strings.TrimSpace(rule.ProviderModelID); providerModelID != "" {
		return providerModelID
	}
	return template.ModelID
}

func AdapterSupportsRuntimeCapability(adapterType, capability string) bool {
	switch strings.TrimSpace(adapterType) {
	case AdapterOpenAICompat:
		switch capability {
		case CapabilityFamilyTextGeneration, CapabilityReasoning, CapabilityFamilyImageGeneration, CapabilityFamilyAudioGeneration:
			return true
		}
	case AdapterNewAPI:
		switch capability {
		case CapabilityFamilyTextGeneration, CapabilityReasoning, CapabilityFamilyImageGeneration, CapabilityFamilyVideoGeneration, CapabilityFamilyAudioGeneration,
			CapabilityFamilyEmbedding, CapabilityFamilyRerank, CapabilityFamilyModeration, CapabilityFamilyRealtime:
			return true
		}
	case AdapterOpenAIVideoMultipart:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterOfficialVideoGenerations:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterYunwuUnifiedVideo:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterAnthropic:
		return capability == CapabilityFamilyTextGeneration || capability == CapabilityReasoning
	case AdapterDashScope:
		switch capability {
		case CapabilityFamilyImageGeneration, CapabilityFamilyVideoGeneration, CapabilityFamilyAudioGeneration:
			return true
		}
	case AdapterVyroSeedance:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterGemini:
		switch capability {
		case CapabilityFamilyTextGeneration, CapabilityReasoning, CapabilityFamilyImageGeneration, CapabilityFamilyVideoGeneration, CapabilityFamilyAudioGeneration:
			return true
		}
	case AdapterVolcen:
		switch capability {
		case CapabilityFamilyTextGeneration, CapabilityReasoning, CapabilityFamilyImageGeneration, CapabilityFamilyVideoGeneration, CapabilityFamilyAudioGeneration:
			return true
		}
	case AdapterKling:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterVidu:
		return capability == CapabilityFamilyVideoGeneration
	case AdapterElevenLabs:
		return capability == CapabilityFamilyAudioGeneration
	case AdapterMiniMax:
		return capability == CapabilityFamilyAudioGeneration
	case AdapterXiaomiMimo:
		return capability == CapabilityFamilyTextGeneration || capability == CapabilityFamilyAudioGeneration
	case AdapterMureka:
		return capability == CapabilityFamilyTextGeneration || capability == CapabilityFamilyAudioGeneration
	case AdapterStability:
		return capability == CapabilityFamilyAudioGeneration
	case AdapterDoubao2API:
		return capability == CapabilityFamilyImageGeneration || capability == CapabilityFamilyVideoGeneration
	case AdapterLocal:
		switch capability {
		case CapabilityFamilyTextGeneration, CapabilityReasoning, CapabilityFamilyImageGeneration, CapabilityFamilyVideoGeneration, CapabilityFamilyAudioGeneration:
			return true
		}
	}
	return false
}

func cloneProviderTemplateMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = cloneProviderTemplateValue(value)
	}
	return out
}

func cloneProviderTemplateValue(value any) any {
	switch v := value.(type) {
	case []any:
		out := make([]any, len(v))
		for i := range v {
			out[i] = cloneProviderTemplateValue(v[i])
		}
		return out
	case []string:
		return append([]string(nil), v...)
	case map[string]any:
		return cloneProviderTemplateMap(v)
	default:
		return v
	}
}

func comboAPIKindsForTemplate(template CatalogTemplate) []string {
	if explicit := NormalizeModelAPIKinds(template.APIKinds); len(explicit) > 0 {
		return explicit
	}
	return comboAPIKindsForCapabilities(template.Capabilities)
}

func comboAPIKindsForCapabilities(capabilities []string) []string {
	if hasString(capabilities, CapabilityFamilyVideoGeneration) {
		return []string{"video", "async_task"}
	}
	if hasString(capabilities, CapabilityFamilyImageGeneration) {
		return []string{"image"}
	}
	if hasString(capabilities, CapabilityFamilyAudioGeneration) {
		return []string{"audio"}
	}
	return []string{"text"}
}
