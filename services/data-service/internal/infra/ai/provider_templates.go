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
	ProviderType     string
	Profile          string
	AdapterType      string
	Lab              string
	IDPrefix         string
	ProviderKind     string
	ProviderCategory string
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
		for _, rule := range comboProvidersForModelTemplate(template) {
			out = append(out, ComboTemplate{
				ComboTemplateKey:     template.ID + "@" + rule.ProviderKind,
				ModelTemplateKey:     template.ID,
				ProviderType:         rule.ProviderType,
				Profile:              rule.Profile,
				ProviderKind:         rule.ProviderKind,
				ProviderCategory:     rule.ProviderCategory,
				AdapterType:          template.AdapterType,
				DefaultPublicModelID: template.DefaultPublicModelID,
				ProviderModelID:      template.ModelID,
				APIKinds:             comboAPIKindsForCapabilities(template.Capabilities),
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
		if strings.TrimSpace(rule.AdapterType) != "" && strings.TrimSpace(rule.AdapterType) != strings.TrimSpace(template.AdapterType) {
			continue
		}
		if strings.TrimSpace(rule.Lab) != "" && strings.TrimSpace(rule.Lab) != strings.TrimSpace(template.Lab) {
			continue
		}
		if rule.IDPrefix != "" && !strings.HasPrefix(template.ID, rule.IDPrefix) {
			continue
		}
		out = append(out, rule)
	}
	return out
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

func comboAPIKindsForCapabilities(capabilities []string) []string {
	if hasString(capabilities, CapabilityVideo) || hasString(capabilities, CapabilityVideoI2V) || hasString(capabilities, CapabilityVideoV2V) {
		return []string{"video", "async_task"}
	}
	if hasString(capabilities, CapabilityImage) || hasString(capabilities, CapabilityImageEdit) {
		return []string{"image"}
	}
	if hasString(capabilities, CapabilityAudioTTS) || hasString(capabilities, CapabilityAudioSTT) ||
		hasString(capabilities, CapabilityAudioMusic) || hasString(capabilities, CapabilityAudioSFX) {
		return []string{"audio"}
	}
	return []string{"text"}
}
