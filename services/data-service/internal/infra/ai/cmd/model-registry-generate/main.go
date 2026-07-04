package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	"gopkg.in/yaml.v3"
)

type registryFile struct {
	Lab       string           `yaml:"lab" json:"lab"`
	Templates []templateSource `yaml:"templates" json:"templates"`
}

type providerRegistryFile struct {
	Providers []providerTemplateSource `yaml:"providers" json:"providers"`
}

type providerTemplateSource struct {
	ProviderType                 string         `yaml:"provider_type" json:"provider_type"`
	Profile                      string         `yaml:"profile,omitempty" json:"profile,omitempty"`
	ProviderKind                 string         `yaml:"provider_kind" json:"provider_kind"`
	ProviderCategory             string         `yaml:"provider_category" json:"provider_category"`
	DisplayName                  string         `yaml:"display_name" json:"display_name"`
	Description                  string         `yaml:"description,omitempty" json:"description,omitempty"`
	DefaultAdapterType           string         `yaml:"default_adapter_type" json:"default_adapter_type"`
	DefaultAdapterKey            string         `yaml:"default_adapter_key" json:"default_adapter_key"`
	DefaultBaseURLPrefix         string         `yaml:"default_base_url_prefix" json:"default_base_url_prefix"`
	Capabilities                 map[string]any `yaml:"capabilities,omitempty" json:"capabilities,omitempty"`
	AssetLibraryCapabilities     map[string]any `yaml:"asset_library_capabilities,omitempty" json:"asset_library_capabilities,omitempty"`
	GeneratedArtifactTrustPolicy map[string]any `yaml:"generated_artifact_trust_policy,omitempty" json:"generated_artifact_trust_policy,omitempty"`
	UpstreamProviderKinds        []string       `yaml:"upstream_provider_kinds,omitempty" json:"upstream_provider_kinds,omitempty"`
	IsBuiltin                    bool           `yaml:"is_builtin" json:"is_builtin"`
	IsEnabled                    bool           `yaml:"is_enabled" json:"is_enabled"`
	Version                      string         `yaml:"version" json:"version"`
}

type comboRulesFile struct {
	Rules []comboRuleSource `yaml:"rules" json:"rules"`
}

type comboRuleSource struct {
	ProviderType      string   `yaml:"provider_type,omitempty" json:"provider_type,omitempty"`
	Profile           string   `yaml:"profile,omitempty" json:"profile,omitempty"`
	AdapterType       string   `yaml:"adapter_type,omitempty" json:"adapter_type,omitempty"`
	Lab               string   `yaml:"lab,omitempty" json:"lab,omitempty"`
	ExcludeLabs       []string `yaml:"exclude_labs,omitempty" json:"exclude_labs,omitempty"`
	ModelTemplateKey  string   `yaml:"model_template_key,omitempty" json:"model_template_key,omitempty"`
	ProviderModelID   string   `yaml:"provider_model_id,omitempty" json:"provider_model_id,omitempty"`
	IDPrefix          string   `yaml:"id_prefix,omitempty" json:"id_prefix,omitempty"`
	ExcludeIDPrefixes []string `yaml:"exclude_id_prefixes,omitempty" json:"exclude_id_prefixes,omitempty"`
	ProviderKind      string   `yaml:"provider_kind,omitempty" json:"provider_kind,omitempty"`
	ProviderCategory  string   `yaml:"provider_category,omitempty" json:"provider_category,omitempty"`
}

type templateSource struct {
	Order                 int            `yaml:"order,omitempty" json:"order,omitempty"`
	ID                    string         `yaml:"id" json:"id"`
	Lab                   string         `yaml:"lab" json:"lab"`
	ModelID               string         `yaml:"model_id" json:"model_id"`
	DisplayName           string         `yaml:"display_name" json:"display_name"`
	RouteAdapterHint      string         `yaml:"route_adapter_hint,omitempty" json:"route_adapter_hint,omitempty"`
	Capabilities          []string       `yaml:"capabilities" json:"capabilities"`
	APIKinds              []string       `yaml:"api_kinds,omitempty" json:"api_kinds,omitempty"`
	ModelCapabilitiesJSON map[string]any `yaml:"model_capabilities_json,omitempty" json:"model_capabilities_json,omitempty"`
	AllowModelIDOverride  bool           `yaml:"allow_model_id_override,omitempty" json:"allow_model_id_override,omitempty"`
	Input                 inputSource    `yaml:"input,omitempty" json:"input,omitempty"`
	InputImageField       string         `yaml:"input_image_field,omitempty" json:"input_image_field,omitempty"`
	Video                 videoSource    `yaml:"video,omitempty" json:"video,omitempty"`
	Params                []paramSource  `yaml:"params,omitempty" json:"params,omitempty"`
	Source                sourceEvidence `yaml:"source" json:"source"`
}

type inputSource struct {
	AcceptsImage bool `yaml:"accepts_image,omitempty" json:"accepts_image,omitempty"`
	MaxImages    int  `yaml:"max_images,omitempty" json:"max_images,omitempty"`
	MaxVideos    int  `yaml:"max_videos,omitempty" json:"max_videos,omitempty"`
}

type videoSource struct {
	DefaultDurationSec int `yaml:"default_duration_sec,omitempty" json:"default_duration_sec,omitempty"`
	MaxDurationSec     int `yaml:"max_duration_sec,omitempty" json:"max_duration_sec,omitempty"`
}

type sourceEvidence struct {
	URL        string `yaml:"url" json:"url"`
	VerifiedAt string `yaml:"verified_at" json:"verified_at"`
	Status     string `yaml:"status" json:"status"`
}

type paramSource struct {
	Key              string                          `yaml:"key" json:"key"`
	Label            string                          `yaml:"label,omitempty" json:"label,omitempty"`
	Type             string                          `yaml:"type" json:"type"`
	Options          []string                        `yaml:"options,omitempty" json:"options,omitempty"`
	Default          any                             `yaml:"default,omitempty" json:"default,omitempty"`
	Min              *float64                        `yaml:"min,omitempty" json:"min,omitempty"`
	Max              *float64                        `yaml:"max,omitempty" json:"max,omitempty"`
	Step             *float64                        `yaml:"step,omitempty" json:"step,omitempty"`
	JSONSchema       map[string]any                  `yaml:"json_schema,omitempty" json:"json_schema,omitempty"`
	ConflictsWith    []string                        `yaml:"conflicts_with,omitempty" json:"conflicts_with,omitempty"`
	ConditionalEnum  []infraai.ParamConditionalEnum  `yaml:"conditional_enum,omitempty" json:"conditional_enum,omitempty"`
	ConditionalConst []infraai.ParamConditionalConst `yaml:"conditional_const,omitempty" json:"conditional_const,omitempty"`
	RequiresValue    []infraai.ParamRequiresValue    `yaml:"requires_value,omitempty" json:"requires_value,omitempty"`
}

type snapshotEntry struct {
	ID                    string         `json:"id"`
	Lab                   string         `json:"lab"`
	ModelID               string         `json:"model_id"`
	RouteAdapterHint      string         `json:"route_adapter_hint,omitempty"`
	Capabilities          []string       `json:"capabilities"`
	APIKinds              []string       `json:"api_kinds,omitempty"`
	ModelCapabilitiesJSON map[string]any `json:"model_capabilities_json,omitempty"`
	ParamKeys             []string       `json:"param_keys,omitempty"`
	Source                sourceEvidence `json:"source"`
}

func main() {
	infraDir := defaultAIInfraDir()
	sourceDir := flag.String("source", filepath.Join(infraDir, "model_registry", "labs"), "directory containing lab YAML files")
	providerSource := flag.String("provider-source", filepath.Join(infraDir, "model_registry", "providers.yaml"), "YAML file containing provider templates")
	comboRulesSource := flag.String("combo-rules", filepath.Join(infraDir, "model_registry", "combo_rules.yaml"), "YAML file containing combo template provider rules")
	goOut := flag.String("out", filepath.Join(infraDir, "catalog_templates.generated.go"), "generated Go output path")
	providerGoOut := flag.String("provider-out", filepath.Join(infraDir, "provider_templates.generated.go"), "generated provider template Go output path")
	snapshotOut := flag.String("snapshot", filepath.Join(infraDir, "model_registry.snapshot.json"), "snapshot JSON output path")
	check := flag.Bool("check", false, "verify generated outputs are up to date")
	bootstrap := flag.Bool("bootstrap-from-current", false, "write lab YAML from the currently compiled CatalogTemplates")
	flag.Parse()

	if *bootstrap {
		if err := bootstrapFromCurrent(*sourceDir); err != nil {
			fatal(err)
		}
		return
	}

	templates, err := loadTemplates(*sourceDir)
	if err != nil {
		fatal(err)
	}
	if err := validateTemplates(templates); err != nil {
		fatal(err)
	}
	providers, err := loadProviderTemplates(*providerSource)
	if err != nil {
		fatal(err)
	}
	rules, err := loadComboRules(*comboRulesSource)
	if err != nil {
		fatal(err)
	}
	if err := validateProviderTemplates(providers); err != nil {
		fatal(err)
	}
	if err := validateComboRules(rules, providers); err != nil {
		fatal(err)
	}
	if err := validateRegistryBoundaries(templates, providers, rules); err != nil {
		fatal(err)
	}
	if err := validateRuntimeCapabilityCoverage(templates, rules); err != nil {
		fatal(err)
	}
	if err := writeGeneratedGo(*goOut, templates, *check); err != nil {
		fatal(err)
	}
	if err := writeProviderGeneratedGo(*providerGoOut, providers, rules, *check); err != nil {
		fatal(err)
	}
	if err := writeSnapshot(*snapshotOut, templates, *check); err != nil {
		fatal(err)
	}
}

func defaultAIInfraDir() string {
	if _, err := os.Stat(filepath.Join("internal", "infra", "ai", "catalog.go")); err == nil {
		return filepath.Join("internal", "infra", "ai")
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func bootstrapFromCurrent(sourceDir string) error {
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		return err
	}
	grouped := map[string][]templateSource{}
	today := time.Now().Format("2006-01-02")
	for i, template := range infraai.CatalogTemplates() {
		lab := labForTemplateID(template.ID)
		source := sourceForTemplate(template.ID, template.Capabilities, today)
		grouped[lab] = append(grouped[lab], templateSource{
			Order:                 i + 1,
			ID:                    template.ID,
			Lab:                   lab,
			ModelID:               template.ModelID,
			DisplayName:           template.DisplayName,
			RouteAdapterHint:      template.RouteAdapterHint,
			Capabilities:          append([]string(nil), template.Capabilities...),
			ModelCapabilitiesJSON: modelCapabilitiesMapFromJSONString(template.ModelCapabilitiesJSON),
			Input: inputSource{
				AcceptsImage: template.AcceptsImageInput,
				MaxImages:    template.MaxInputImages,
				MaxVideos:    template.MaxInputVideos,
			},
			InputImageField: template.InputImageField,
			Params:          paramsToSource(template.SupportedParams),
			Source:          source,
		})
	}
	labs := make([]string, 0, len(grouped))
	for lab := range grouped {
		labs = append(labs, lab)
	}
	sort.Strings(labs)
	for _, lab := range labs {
		payload, err := yaml.Marshal(registryFile{Lab: lab, Templates: grouped[lab]})
		if err != nil {
			return err
		}
		path := filepath.Join(sourceDir, lab+".yaml")
		if err := os.WriteFile(path, payload, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func loadTemplates(sourceDir string) ([]templateSource, error) {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	var out []templateSource
	for _, entry := range entries {
		if entry.IsDir() || (!strings.HasSuffix(entry.Name(), ".yaml") && !strings.HasSuffix(entry.Name(), ".yml")) {
			continue
		}
		path := filepath.Join(sourceDir, entry.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var file registryFile
		if err := yaml.Unmarshal(raw, &file); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		fileLab := strings.TrimSuffix(strings.TrimSuffix(entry.Name(), ".yaml"), ".yml")
		if strings.TrimSpace(file.Lab) == "" {
			return nil, fmt.Errorf("%s: lab is required", path)
		}
		for i := range file.Templates {
			template := file.Templates[i]
			if template.Lab == "" {
				template.Lab = file.Lab
			}
			if template.Lab != file.Lab {
				return nil, fmt.Errorf("%s: template %q lab %q does not match file lab %q", path, template.ID, template.Lab, file.Lab)
			}
			if fileLab != file.Lab {
				return nil, fmt.Errorf("%s: filename lab %q does not match file lab %q", path, fileLab, file.Lab)
			}
			out = append(out, template)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Order == out[j].Order {
			return out[i].ID < out[j].ID
		}
		return out[i].Order < out[j].Order
	})
	return out, nil
}

func validateTemplates(templates []templateSource) error {
	if len(templates) == 0 {
		return fmt.Errorf("no templates found")
	}
	seen := map[string]bool{}
	for _, template := range templates {
		if strings.TrimSpace(template.ID) == "" {
			return fmt.Errorf("template id is required")
		}
		if seen[template.ID] {
			return fmt.Errorf("duplicate template id %q", template.ID)
		}
		seen[template.ID] = true
		if strings.TrimSpace(template.Lab) == "" {
			return fmt.Errorf("%s: lab is required", template.ID)
		}
		if strings.TrimSpace(template.ModelID) == "" {
			return fmt.Errorf("%s: model_id is required", template.ID)
		}
		if strings.TrimSpace(template.DisplayName) == "" {
			return fmt.Errorf("%s: display_name is required", template.ID)
		}
		if strings.TrimSpace(template.RouteAdapterHint) != "" && infraai.GetAdapterDef(template.RouteAdapterHint) == nil {
			return fmt.Errorf("%s: unknown route_adapter_hint %q", template.ID, template.RouteAdapterHint)
		}
		if len(template.Capabilities) == 0 {
			return fmt.Errorf("%s: capabilities are required", template.ID)
		}
		for _, capability := range template.Capabilities {
			if !validCapability(capability) {
				return fmt.Errorf("%s: unknown capability %q", template.ID, capability)
			}
		}
		if len(template.ModelCapabilitiesJSON) > 0 {
			if _, err := json.Marshal(template.ModelCapabilitiesJSON); err != nil {
				return fmt.Errorf("%s: model_capabilities_json invalid: %w", template.ID, err)
			}
		}
		for _, apiKind := range template.APIKinds {
			if !infraai.ValidModelAPIKind(apiKind) {
				return fmt.Errorf("%s: unknown api_kind %q", template.ID, apiKind)
			}
		}
		if strings.TrimSpace(template.Source.URL) == "" {
			return fmt.Errorf("%s: source.url is required", template.ID)
		}
		if _, err := time.Parse("2006-01-02", template.Source.VerifiedAt); err != nil {
			return fmt.Errorf("%s: source.verified_at must be YYYY-MM-DD: %w", template.ID, err)
		}
		switch template.Source.Status {
		case "verified", "needs_review", "deprecated", "unofficial", "observed", "template_only":
		default:
			return fmt.Errorf("%s: invalid source.status %q", template.ID, template.Source.Status)
		}
		if len(template.Params) > 0 {
			if err := infraai.ValidateModelParamConfigWithBaseParams(nil, paramSourcesJSON(template.Params)); err != nil {
				return fmt.Errorf("%s: params invalid: %w", template.ID, err)
			}
		}
	}
	return nil
}

func validateRuntimeCapabilityCoverage(templates []templateSource, rules []comboRuleSource) error {
	for _, template := range templates {
		if strings.TrimSpace(template.Source.Status) == "template_only" {
			continue
		}
		for _, capability := range template.Capabilities {
			if !routeTemplatesCoverRuntimeCapability(template, rules, capability) {
				return fmt.Errorf("%s: no route template adapter implements runtime capability %q; add a combo rule with a supported adapter or mark the template source.status as template_only", template.ID, capability)
			}
		}
	}
	return nil
}

func routeTemplatesCoverRuntimeCapability(template templateSource, rules []comboRuleSource, capability string) bool {
	for _, rule := range rules {
		if !comboRuleMatchesTemplateSource(rule, template) {
			continue
		}
		if adapterSupportsRuntimeCapability(rule.AdapterType, capability) {
			return true
		}
	}
	return false
}

func comboRuleMatchesTemplateSource(rule comboRuleSource, template templateSource) bool {
	if strings.TrimSpace(rule.Lab) != "" && strings.TrimSpace(rule.Lab) != strings.TrimSpace(template.Lab) {
		return false
	}
	if hasStringValue(rule.ExcludeLabs, strings.TrimSpace(template.Lab)) {
		return false
	}
	if strings.TrimSpace(rule.ModelTemplateKey) != "" && strings.TrimSpace(rule.ModelTemplateKey) != strings.TrimSpace(template.ID) {
		return false
	}
	if rule.IDPrefix != "" && !strings.HasPrefix(template.ID, rule.IDPrefix) {
		return false
	}
	for _, prefix := range rule.ExcludeIDPrefixes {
		if prefix != "" && strings.HasPrefix(template.ID, prefix) {
			return false
		}
	}
	return true
}

func hasStringValue(values []string, target string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == target {
			return true
		}
	}
	return false
}

func adapterSupportsRuntimeCapability(adapterType, capability string) bool {
	return infraai.AdapterSupportsRuntimeCapability(adapterType, capability)
}

func loadProviderTemplates(path string) ([]providerTemplateSource, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var file providerRegistryFile
	if err := yaml.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return file.Providers, nil
}

func loadComboRules(path string) ([]comboRuleSource, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var file comboRulesFile
	if err := yaml.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return file.Rules, nil
}

func validateProviderTemplates(providers []providerTemplateSource) error {
	if len(providers) == 0 {
		return fmt.Errorf("no provider templates found")
	}
	seen := map[string]bool{}
	seenTypeProfile := map[string]bool{}
	normalizeProviderTemplates(providers)
	for _, provider := range providers {
		if strings.TrimSpace(provider.ProviderType) == "" {
			return fmt.Errorf("%s: provider_type is required", provider.ProviderKind)
		}
		if strings.TrimSpace(provider.ProviderKind) == "" {
			return fmt.Errorf("provider_kind is required")
		}
		if seen[provider.ProviderKind] {
			return fmt.Errorf("duplicate provider_kind %q", provider.ProviderKind)
		}
		seen[provider.ProviderKind] = true
		typeProfile := providerTypeProfileKey(provider.ProviderType, provider.Profile)
		if seenTypeProfile[typeProfile] {
			return fmt.Errorf("duplicate provider_type/profile %q", typeProfile)
		}
		seenTypeProfile[typeProfile] = true
		if strings.TrimSpace(provider.ProviderCategory) == "" {
			return fmt.Errorf("%s: provider_category is required", provider.ProviderKind)
		}
		if strings.TrimSpace(provider.DisplayName) == "" {
			return fmt.Errorf("%s: display_name is required", provider.ProviderKind)
		}
		if infraai.GetAdapterDef(provider.DefaultAdapterType) == nil {
			return fmt.Errorf("%s: unknown default_adapter_type %q", provider.ProviderKind, provider.DefaultAdapterType)
		}
		if strings.TrimSpace(provider.Version) == "" {
			return fmt.Errorf("%s: version is required", provider.ProviderKind)
		}
	}
	return nil
}

func validateComboRules(rules []comboRuleSource, providers []providerTemplateSource) error {
	if len(rules) == 0 {
		return fmt.Errorf("no combo provider rules found")
	}
	providersByKind := map[string]providerTemplateSource{}
	providersByTypeProfile := map[string]providerTemplateSource{}
	for _, provider := range providers {
		providersByKind[provider.ProviderKind] = provider
		providersByTypeProfile[providerTypeProfileKey(provider.ProviderType, provider.Profile)] = provider
	}
	for i := range rules {
		rule := &rules[i]
		if strings.TrimSpace(rule.AdapterType) != "" && infraai.GetAdapterDef(rule.AdapterType) == nil {
			return fmt.Errorf("combo rule references unknown adapter_type %q", rule.AdapterType)
		}
		var provider providerTemplateSource
		var ok bool
		if strings.TrimSpace(rule.ProviderKind) != "" {
			provider, ok = providersByKind[rule.ProviderKind]
			if !ok {
				return fmt.Errorf("combo rule references unknown provider_kind %q", rule.ProviderKind)
			}
		} else {
			provider, ok = providersByTypeProfile[providerTypeProfileKey(rule.ProviderType, rule.Profile)]
			if !ok {
				return fmt.Errorf("combo rule references unknown provider_type/profile %q", providerTypeProfileKey(rule.ProviderType, rule.Profile))
			}
			rule.ProviderKind = provider.ProviderKind
		}
		if strings.TrimSpace(rule.ProviderType) == "" {
			rule.ProviderType = provider.ProviderType
		}
		if strings.TrimSpace(rule.Profile) == "" {
			rule.Profile = provider.Profile
		}
		if strings.TrimSpace(rule.ProviderCategory) == "" {
			rule.ProviderCategory = provider.ProviderCategory
		}
		if strings.TrimSpace(rule.AdapterType) == "" {
			rule.AdapterType = strings.TrimSpace(provider.DefaultAdapterType)
		}
		if strings.TrimSpace(rule.AdapterType) == "" {
			return fmt.Errorf("combo rule for provider_kind %q has no adapter_type and provider has no default_adapter_type", rule.ProviderKind)
		}
	}
	return nil
}

func validateRegistryBoundaries(templates []templateSource, providers []providerTemplateSource, rules []comboRuleSource) error {
	labs := map[string]bool{}
	templateKeys := map[string]bool{}
	for _, template := range templates {
		lab := strings.TrimSpace(template.Lab)
		if providerOnlyLabName(lab) {
			return fmt.Errorf("%s: lab %q is a provider or runtime boundary; use providers.yaml and route bindings instead", template.ID, lab)
		}
		labs[lab] = true
		templateKeys[strings.TrimSpace(template.ID)] = true
	}
	for _, rule := range rules {
		lab := strings.TrimSpace(rule.Lab)
		if lab != "" {
			if providerOnlyLabName(lab) {
				return fmt.Errorf("combo rule lab %q is a provider or runtime boundary; use an upstream model-family lab", lab)
			}
			if !labs[lab] {
				return fmt.Errorf("combo rule references unknown lab %q", lab)
			}
		}
		if modelTemplateKey := strings.TrimSpace(rule.ModelTemplateKey); modelTemplateKey != "" && !templateKeys[modelTemplateKey] {
			return fmt.Errorf("combo rule references unknown model_template_key %q", modelTemplateKey)
		}
		for _, excludedLab := range rule.ExcludeLabs {
			excludedLab = strings.TrimSpace(excludedLab)
			if excludedLab == "" {
				return fmt.Errorf("combo rule contains empty exclude_labs entry")
			}
			if providerOnlyLabName(excludedLab) {
				return fmt.Errorf("combo rule exclude_labs %q is a provider or runtime boundary", excludedLab)
			}
			if !labs[excludedLab] {
				return fmt.Errorf("combo rule exclude_labs references unknown lab %q", excludedLab)
			}
		}
		for _, prefix := range rule.ExcludeIDPrefixes {
			if strings.TrimSpace(prefix) == "" {
				return fmt.Errorf("combo rule contains empty exclude_id_prefixes entry")
			}
		}
	}
	for _, provider := range providers {
		if providerOnlyLabName(provider.ProviderKind) && strings.TrimSpace(provider.ProviderKind) != "relay_gateway" {
			return fmt.Errorf("%s: provider_kind uses lab-only legacy/provider name; use a stable provider kind", provider.ProviderKind)
		}
	}
	return nil
}

func providerOnlyLabName(value string) bool {
	switch strings.TrimSpace(value) {
	case "aws-bedrock", "aws-bedrock-openai", "azure-openai", "relay_gateway", "new_api", "new-api", "apiyi", "local-audio", "volcengine":
		return true
	default:
		return false
	}
}

func normalizeProviderTemplates(providers []providerTemplateSource) {
	for i := range providers {
		providers[i].ProviderType = strings.TrimSpace(providers[i].ProviderType)
		providers[i].Profile = strings.TrimSpace(providers[i].Profile)
		providers[i].ProviderKind = strings.TrimSpace(providers[i].ProviderKind)
		providers[i].ProviderCategory = strings.TrimSpace(providers[i].ProviderCategory)
		providers[i].DefaultAdapterType = strings.TrimSpace(providers[i].DefaultAdapterType)
		providers[i].DefaultAdapterKey = strings.TrimSpace(providers[i].DefaultAdapterKey)
		if providers[i].DefaultAdapterType == "" {
			providers[i].DefaultAdapterType = providers[i].DefaultAdapterKey
		}
		if providers[i].DefaultAdapterKey == "" {
			providers[i].DefaultAdapterKey = providers[i].DefaultAdapterType
		}
	}
}

func providerTypeProfileKey(providerType, profile string) string {
	providerType = strings.TrimSpace(providerType)
	profile = strings.TrimSpace(profile)
	if profile == "" {
		return providerType
	}
	return providerType + "/" + profile
}

func writeGeneratedGo(path string, templates []templateSource, check bool) error {
	var buf bytes.Buffer
	buf.WriteString("// Code generated by model-registry-generate; DO NOT EDIT.\n\n")
	buf.WriteString("package ai\n\n")
	buf.WriteString("import \"encoding/json\"\n\n")
	buf.WriteString("var catalogTemplateSources = []ModelDef{\n")
	for _, template := range templates {
		buf.WriteString("\t{\n")
		writeGoStringField(&buf, "ID", template.ID)
		writeGoStringField(&buf, "Lab", template.Lab)
		writeGoStringField(&buf, "ModelID", template.ModelID)
		writeGoStringField(&buf, "DisplayName", template.DisplayName)
		writeGoStringSliceField(&buf, "Capabilities", template.Capabilities)
		writeGoStringSliceField(&buf, "APIKinds", infraai.NormalizeModelAPIKinds(template.APIKinds))
		if raw := templateModelCapabilitiesJSONString(template); raw != "" {
			writeGoStringField(&buf, "ModelCapabilitiesJSON", raw)
		}
		writeGoStringField(&buf, "AdapterType", template.RouteAdapterHint)
		writeGoStringField(&buf, "SourceStatus", template.Source.Status)
		if template.Input.AcceptsImage {
			buf.WriteString("\t\tAcceptsImageInput: true,\n")
		}
		if template.Input.MaxImages != 0 {
			fmt.Fprintf(&buf, "\t\tMaxInputImages: %d,\n", template.Input.MaxImages)
		}
		if template.Input.MaxVideos != 0 {
			fmt.Fprintf(&buf, "\t\tMaxInputVideos: %d,\n", template.Input.MaxVideos)
		}
		if template.InputImageField != "" {
			writeGoStringField(&buf, "InputImageField", template.InputImageField)
		}
		if template.AllowModelIDOverride {
			buf.WriteString("\t\tAllowModelIDOverride: true,\n")
		}
		if template.Video.DefaultDurationSec != 0 {
			fmt.Fprintf(&buf, "\t\tDefaultDurSec: %d,\n", template.Video.DefaultDurationSec)
		}
		if template.Video.MaxDurationSec != 0 {
			fmt.Fprintf(&buf, "\t\tMaxDurSec: %d,\n", template.Video.MaxDurationSec)
		}
		if len(template.Params) > 0 {
			raw, err := json.Marshal(template.Params)
			if err != nil {
				return err
			}
			fmt.Fprintf(&buf, "\t\tSupportedParams: mustGeneratedCatalogParamDefs(%s),\n", strconv.Quote(string(raw)))
		}
		buf.WriteString("\t},\n")
	}
	buf.WriteString("}\n\n")
	buf.WriteString("func mustGeneratedCatalogParamDefs(raw string) []ParamDef {\n")
	buf.WriteString("\tvar params []ParamDef\n")
	buf.WriteString("\tif err := json.Unmarshal([]byte(raw), &params); err != nil {\n")
	buf.WriteString("\t\tpanic(err)\n")
	buf.WriteString("\t}\n")
	buf.WriteString("\treturn params\n")
	buf.WriteString("}\n")
	formatted, err := format.Source(buf.Bytes())
	if err != nil {
		return err
	}
	return writeOrCheck(path, formatted, check)
}

func writeSnapshot(path string, templates []templateSource, check bool) error {
	snapshot := make([]snapshotEntry, 0, len(templates))
	for _, template := range templates {
		keys := make([]string, 0, len(template.Params))
		for _, param := range template.Params {
			keys = append(keys, param.Key)
		}
		snapshot = append(snapshot, snapshotEntry{
			ID:                    template.ID,
			Lab:                   template.Lab,
			ModelID:               template.ModelID,
			RouteAdapterHint:      template.RouteAdapterHint,
			Capabilities:          template.Capabilities,
			APIKinds:              infraai.NormalizeModelAPIKinds(template.APIKinds),
			ModelCapabilitiesJSON: template.ModelCapabilitiesJSON,
			ParamKeys:             keys,
			Source:                template.Source,
		})
	}
	raw, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return writeOrCheck(path, raw, check)
}

func writeProviderGeneratedGo(path string, providers []providerTemplateSource, rules []comboRuleSource, check bool) error {
	var buf bytes.Buffer
	buf.WriteString("// Code generated by model-registry-generate; DO NOT EDIT.\n\n")
	buf.WriteString("package ai\n\n")
	buf.WriteString("import \"encoding/json\"\n\n")
	buf.WriteString("var providerTemplateSources = []ProviderTemplate{\n")
	for _, provider := range providers {
		buf.WriteString("\t{\n")
		writeGoStringField(&buf, "ProviderType", provider.ProviderType)
		if provider.Profile != "" {
			writeGoStringField(&buf, "Profile", provider.Profile)
		}
		writeGoStringField(&buf, "ProviderKind", provider.ProviderKind)
		writeGoStringField(&buf, "ProviderCategory", provider.ProviderCategory)
		writeGoStringField(&buf, "DisplayName", provider.DisplayName)
		if provider.Description != "" {
			writeGoStringField(&buf, "Description", provider.Description)
		}
		writeGoStringField(&buf, "DefaultAdapterType", provider.DefaultAdapterType)
		writeGoStringField(&buf, "DefaultAdapterKey", provider.DefaultAdapterKey)
		writeGoStringField(&buf, "DefaultBaseURLPrefix", provider.DefaultBaseURLPrefix)
		writeGoMapField(&buf, "Capabilities", provider.Capabilities)
		writeGoMapField(&buf, "AssetLibraryCapabilities", provider.AssetLibraryCapabilities)
		writeGoMapField(&buf, "GeneratedArtifactTrustPolicy", provider.GeneratedArtifactTrustPolicy)
		writeGoStringSliceField(&buf, "UpstreamProviderKinds", provider.UpstreamProviderKinds)
		if provider.IsBuiltin {
			buf.WriteString("\t\tIsBuiltin: true,\n")
		}
		if provider.IsEnabled {
			buf.WriteString("\t\tIsEnabled: true,\n")
		}
		writeGoStringField(&buf, "Version", provider.Version)
		buf.WriteString("\t},\n")
	}
	buf.WriteString("}\n\n")
	buf.WriteString("var comboProviderRules = []comboProviderRule{\n")
	for _, rule := range rules {
		buf.WriteString("\t{\n")
		writeGoStringField(&buf, "ProviderType", rule.ProviderType)
		if rule.Profile != "" {
			writeGoStringField(&buf, "Profile", rule.Profile)
		}
		writeGoStringField(&buf, "AdapterType", rule.AdapterType)
		if rule.Lab != "" {
			writeGoStringField(&buf, "Lab", rule.Lab)
		}
		writeGoStringSliceField(&buf, "ExcludeLabs", rule.ExcludeLabs)
		if rule.ModelTemplateKey != "" {
			writeGoStringField(&buf, "ModelTemplateKey", rule.ModelTemplateKey)
		}
		if rule.ProviderModelID != "" {
			writeGoStringField(&buf, "ProviderModelID", rule.ProviderModelID)
		}
		if rule.IDPrefix != "" {
			writeGoStringField(&buf, "IDPrefix", rule.IDPrefix)
		}
		writeGoStringSliceField(&buf, "ExcludeIDPrefixes", rule.ExcludeIDPrefixes)
		writeGoStringField(&buf, "ProviderKind", rule.ProviderKind)
		writeGoStringField(&buf, "ProviderCategory", rule.ProviderCategory)
		buf.WriteString("\t},\n")
	}
	buf.WriteString("}\n\n")
	buf.WriteString("func mustGeneratedProviderTemplateMap(raw string) map[string]any {\n")
	buf.WriteString("\tif raw == \"\" {\n")
	buf.WriteString("\t\treturn nil\n")
	buf.WriteString("\t}\n")
	buf.WriteString("\tvar value map[string]any\n")
	buf.WriteString("\tif err := json.Unmarshal([]byte(raw), &value); err != nil {\n")
	buf.WriteString("\t\tpanic(err)\n")
	buf.WriteString("\t}\n")
	buf.WriteString("\treturn value\n")
	buf.WriteString("}\n")
	formatted, err := format.Source(buf.Bytes())
	if err != nil {
		return err
	}
	return writeOrCheck(path, formatted, check)
}

func writeOrCheck(path string, raw []byte, check bool) error {
	if check {
		existing, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if !bytes.Equal(existing, raw) {
			return fmt.Errorf("%s is out of date; run model-registry-generate", path)
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

func writeGoStringField(buf *bytes.Buffer, field, value string) {
	fmt.Fprintf(buf, "\t\t%s: %s,\n", field, strconv.Quote(value))
}

func writeGoStringSliceField(buf *bytes.Buffer, field string, values []string) {
	if len(values) == 0 {
		return
	}
	fmt.Fprintf(buf, "\t\t%s: []string{", field)
	for i, value := range values {
		if i > 0 {
			buf.WriteString(", ")
		}
		buf.WriteString(strconv.Quote(value))
	}
	buf.WriteString("},\n")
}

func writeGoMapField(buf *bytes.Buffer, field string, value map[string]any) {
	if len(value) == 0 {
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	fmt.Fprintf(buf, "\t\t%s: mustGeneratedProviderTemplateMap(%s),\n", field, strconv.Quote(string(raw)))
}

func templateModelCapabilitiesJSONString(template templateSource) string {
	if len(template.ModelCapabilitiesJSON) == 0 {
		return ""
	}
	raw, err := json.Marshal(template.ModelCapabilitiesJSON)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func modelCapabilitiesMapFromJSONString(raw string) map[string]any {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return nil
	}
	return value
}

func paramsToSource(params []infraai.ParamDef) []paramSource {
	out := make([]paramSource, 0, len(params))
	for _, param := range params {
		item := paramSource{
			Key:              param.Key,
			Label:            param.Label,
			Type:             param.Type,
			Options:          append([]string(nil), param.Options...),
			Default:          param.Default,
			JSONSchema:       cloneMap(param.JSONSchema),
			ConflictsWith:    append([]string(nil), param.ConflictsWith...),
			ConditionalEnum:  append([]infraai.ParamConditionalEnum(nil), param.ConditionalEnum...),
			ConditionalConst: append([]infraai.ParamConditionalConst(nil), param.ConditionalConst...),
			RequiresValue:    append([]infraai.ParamRequiresValue(nil), param.RequiresValue...),
		}
		if param.Min != 0 {
			value := param.Min
			item.Min = &value
		}
		if param.Max != 0 {
			value := param.Max
			item.Max = &value
		}
		if param.Step != 0 {
			value := param.Step
			item.Step = &value
		}
		out = append(out, item)
	}
	return out
}

func sourceParamsToAI(params []paramSource) []infraai.ParamDef {
	out := make([]infraai.ParamDef, 0, len(params))
	for _, param := range params {
		item := infraai.ParamDef{
			Key:              param.Key,
			Label:            param.Label,
			Type:             param.Type,
			Options:          append([]string(nil), param.Options...),
			Default:          param.Default,
			JSONSchema:       cloneMap(param.JSONSchema),
			ConflictsWith:    append([]string(nil), param.ConflictsWith...),
			ConditionalEnum:  append([]infraai.ParamConditionalEnum(nil), param.ConditionalEnum...),
			ConditionalConst: append([]infraai.ParamConditionalConst(nil), param.ConditionalConst...),
			RequiresValue:    append([]infraai.ParamRequiresValue(nil), param.RequiresValue...),
		}
		if param.Min != nil {
			item.Min = *param.Min
		}
		if param.Max != nil {
			item.Max = *param.Max
		}
		if param.Step != nil {
			item.Step = *param.Step
		}
		out = append(out, item)
	}
	return out
}

func paramSourcesJSON(params []paramSource) string {
	raw, err := json.Marshal(params)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func cloneMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func labForTemplateID(id string) string {
	prefix, _, ok := strings.Cut(id, ":")
	if !ok {
		return "unknown"
	}
	switch prefix {
	case "volcengine", "volcengine-ark":
		return "seed"
	case "gemini":
		return "google-gemini"
	case "dashscope":
		return "alibaba-dashscope"
	default:
		return prefix
	}
}

func sourceForTemplate(id string, capabilities []string, date string) sourceEvidence {
	source := sourceEvidence{VerifiedAt: date, Status: "needs_review"}
	switch labForTemplateID(id) {
	case "openai":
		if hasCapability(capabilities, infraai.CapabilityFamilyImageGeneration) || hasCapability(capabilities, infraai.CapabilityFamilyImageGeneration) {
			source.URL = "https://developers.openai.com/api/reference/resources/images"
		} else {
			source.URL = "https://developers.openai.com/api/docs/models"
		}
	case "anthropic":
		source.URL = "https://platform.claude.com/docs/en/about-claude/models/overview"
	case "google-gemini":
		source.URL = "https://ai.google.dev/gemini-api/docs/models"
	case "xai":
		source.URL = "https://docs.x.ai/docs/models"
	case "elevenlabs":
		if hasCapability(capabilities, infraai.CapabilityFamilyAudioGeneration) {
			source.URL = "https://elevenlabs.io/docs/api-reference/speech-to-text/convert"
		} else {
			source.URL = "https://elevenlabs.io/docs/api-reference/text-to-speech/convert"
		}
	case "seed":
		if strings.Contains(id, "seedance") {
			source.URL = "https://www.volcengine.com/docs/82379/1520757?lang=zh"
		} else if strings.Contains(id, "seedream") {
			source.URL = "https://www.volcengine.com/docs/82379/1366799?lang=zh"
		} else {
			source.URL = "https://www.volcengine.com/docs/82379"
		}
	case "kling":
		source.URL = "https://kling.ai/document-api/apiReference/model/textToVideo"
	case "vidu":
		source.URL = "https://platform.vidu.com/docs/reference-to-video"
	case "alibaba-dashscope":
		source.URL = "https://help.aliyun.com/zh/model-studio/video-generation"
	default:
		source.URL = "https://models.dev/"
		source.Status = "unofficial"
	}
	return source
}

func hasCapability(capabilities []string, want string) bool {
	for _, capability := range capabilities {
		if capability == want {
			return true
		}
	}
	return false
}

func validCapability(value string) bool {
	switch value {
	case infraai.CapabilityFamilyTextGeneration,
		infraai.CapabilityReasoning,
		infraai.CapabilityFamilyImageGeneration,
		infraai.CapabilityFamilyVideoGeneration,
		infraai.CapabilityFamilyAudioGeneration:
		return true
	default:
		return false
	}
}
