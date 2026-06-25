package ai

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/movscript/movscript/internal/infra/ai"
)

type PreviewCatalogEntryContractInput struct {
	AdapterType           string
	CustomCapabilities    string
	CustomAcceptsImage    bool
	CustomMaxInputImages  int
	CustomMaxInputVideos  int
	CustomSupportedParams string
}

type CatalogEntryContractPreview struct {
	Capabilities          []string       `json:"capabilities"`
	SupportedParams       []ai.ParamDef  `json:"supported_params"`
	ParamsSchema          map[string]any `json:"params_schema"`
	ParamsSchemaRuleCount int            `json:"params_schema_rule_count"`
	AgentContract         AgentContract  `json:"agent_contract"`
}

type AgentContract struct {
	ContractVersion    int                    `json:"contract_version"`
	InputRequirements  AgentInputRequirements `json:"input_requirements"`
	SupportedParamKeys []string               `json:"supported_param_keys"`
	SupportedParams    []AgentContractParam   `json:"supported_params"`
}

type AgentInputRequirement struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type AgentInputRequirements struct {
	Image AgentInputRequirement `json:"image"`
	Video AgentInputRequirement `json:"video"`
}

type AgentContractParam struct {
	Key              string                     `json:"key"`
	Label            string                     `json:"label,omitempty"`
	Type             string                     `json:"type,omitempty"`
	Options          []string                   `json:"options,omitempty"`
	Enum             []any                      `json:"enum,omitempty"`
	Default          any                        `json:"default,omitempty"`
	Min              *float64                   `json:"min,omitempty"`
	Max              *float64                   `json:"max,omitempty"`
	Step             *float64                   `json:"step,omitempty"`
	Description      string                     `json:"description,omitempty"`
	ConflictsWith    []string                   `json:"conflicts_with,omitempty"`
	ConditionalEnum  []ai.ParamConditionalEnum  `json:"conditional_enum,omitempty"`
	ConditionalConst []ai.ParamConditionalConst `json:"conditional_const,omitempty"`
	RequiresValue    []ai.ParamRequiresValue    `json:"requires_value,omitempty"`
}

func (s *Service) PreviewCatalogEntryContract(input PreviewCatalogEntryContractInput) (CatalogEntryContractPreview, error) {
	capabilities := ai.SplitCapabilities(input.CustomCapabilities)
	if len(capabilities) == 0 {
		return CatalogEntryContractPreview{}, fmt.Errorf("%w: custom_capabilities is required", ErrInvalidModelCatalog)
	}
	if err := validateInputLimit("custom_max_input_images", input.CustomMaxInputImages); err != nil {
		return CatalogEntryContractPreview{}, err
	}
	if err := validateInputLimit("custom_max_input_videos", input.CustomMaxInputVideos); err != nil {
		return CatalogEntryContractPreview{}, err
	}
	if err := ai.ValidateModelParamConfig(input.AdapterType, capabilities, input.CustomSupportedParams); err != nil {
		return CatalogEntryContractPreview{}, fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
	}
	params, _ := ai.ResolveEffectiveParams(input.AdapterType, capabilities, input.CustomSupportedParams)
	schema := ai.ParamsSchema(params)
	return CatalogEntryContractPreview{
		Capabilities:          capabilities,
		SupportedParams:       params,
		ParamsSchema:          schema,
		ParamsSchemaRuleCount: schemaRuleCount(schema),
		AgentContract:         buildAgentContract(capabilities, input.CustomAcceptsImage, input.CustomMaxInputImages, input.CustomMaxInputVideos, params, schema),
	}, nil
}

func buildAgentContract(capabilities []string, acceptsImage bool, maxInputImages, maxInputVideos int, params []ai.ParamDef, schema map[string]any) AgentContract {
	out := AgentContract{
		ContractVersion:    1,
		InputRequirements:  agentInputRequirementsForCapabilities(capabilities, acceptsImage, maxInputImages, maxInputVideos),
		SupportedParamKeys: make([]string, 0, len(params)),
		SupportedParams:    make([]AgentContractParam, 0, len(params)),
	}
	schemaProperties := schemaParamProperties(schema)
	for _, param := range params {
		if param.Key == "" {
			continue
		}
		out.SupportedParamKeys = append(out.SupportedParamKeys, param.Key)
		item := AgentContractParam{
			Key:              param.Key,
			Label:            param.Label,
			Type:             param.Type,
			Options:          append([]string{}, param.Options...),
			Default:          param.Default,
			ConflictsWith:    append([]string{}, param.ConflictsWith...),
			ConditionalEnum:  cloneConditionalEnum(param.ConditionalEnum),
			ConditionalConst: append([]ai.ParamConditionalConst{}, param.ConditionalConst...),
			RequiresValue:    append([]ai.ParamRequiresValue{}, param.RequiresValue...),
		}
		if min, ok := paramJSONNumberField(param, "min"); ok {
			item.Min = &min
		}
		if max, ok := paramJSONNumberField(param, "max"); ok {
			item.Max = &max
		}
		if step, ok := paramJSONNumberField(param, "step"); ok {
			item.Step = &step
		}
		mergeAgentContractSchemaProperty(&item, schemaProperties[param.Key])
		out.SupportedParams = append(out.SupportedParams, item)
	}
	sort.Strings(out.SupportedParamKeys)
	return out
}

func agentInputRequirementsForCapabilities(capabilities []string, acceptsImage bool, maxInputImages, maxInputVideos int) AgentInputRequirements {
	var out AgentInputRequirements
	if acceptsImage {
		out.Image.Max = 1
	}
	if maxInputImages != 0 {
		out.Image.Max = maxInputImages
	}
	if maxInputVideos != 0 {
		out.Video.Max = maxInputVideos
	}
	imageRequired := len(capabilities) > 0
	videoRequired := len(capabilities) > 0
	for _, capability := range capabilities {
		if agentRequiredImageInputMin(capability) == 0 {
			imageRequired = false
		}
		if agentRequiredVideoInputMin(capability) == 0 {
			videoRequired = false
		}
	}
	if imageRequired {
		out.Image.Min = 1
		if out.Image.Max == 0 {
			out.Image.Max = 1
		}
	}
	if videoRequired {
		out.Video.Min = 1
		if out.Video.Max == 0 {
			out.Video.Max = 1
		}
	}
	return out
}

func agentRequiredImageInputMin(capability string) int {
	if capability == ai.CapabilityImageEdit || capability == ai.CapabilityVideoI2V {
		return 1
	}
	return 0
}

func agentRequiredVideoInputMin(capability string) int {
	if capability == ai.CapabilityVideoV2V {
		return 1
	}
	return 0
}

func schemaParamProperties(schema map[string]any) map[string]any {
	raw, ok := schema["properties"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return raw
}

func mergeAgentContractSchemaProperty(item *AgentContractParam, property any) {
	prop, ok := property.(map[string]any)
	if !ok {
		return
	}
	if values, ok := jsonScalarArray(prop["enum"]); ok {
		if strings, ok := allStrings(values); ok {
			item.Options = strings
		} else {
			item.Enum = values
		}
	}
	if item.Default == nil {
		item.Default = prop["default"]
	}
	if item.Min == nil {
		if min, ok := jsonNumber(prop["minimum"]); ok {
			item.Min = &min
		}
	}
	if item.Max == nil {
		if max, ok := jsonNumber(prop["maximum"]); ok {
			item.Max = &max
		}
	}
	if item.Step == nil {
		if step, ok := jsonNumber(prop["multipleOf"]); ok {
			item.Step = &step
		}
	}
	if description, ok := prop["description"].(string); ok && strings.TrimSpace(description) != "" {
		item.Description = strings.TrimSpace(description)
	}
}

func jsonScalarArray(value any) ([]any, bool) {
	raw := scalarArrayItems(value)
	if len(raw) == 0 {
		return nil, false
	}
	out := make([]any, 0, len(raw))
	for _, item := range raw {
		switch item.(type) {
		case string, int, int64, float64, bool:
			out = append(out, item)
		default:
			return nil, false
		}
	}
	return out, true
}

func scalarArrayItems(value any) []any {
	switch items := value.(type) {
	case []any:
		return items
	case []string:
		out := make([]any, len(items))
		for i, item := range items {
			out[i] = item
		}
		return out
	case []int:
		out := make([]any, len(items))
		for i, item := range items {
			out[i] = item
		}
		return out
	case []int64:
		out := make([]any, len(items))
		for i, item := range items {
			out[i] = item
		}
		return out
	case []float64:
		out := make([]any, len(items))
		for i, item := range items {
			out[i] = item
		}
		return out
	case []bool:
		out := make([]any, len(items))
		for i, item := range items {
			out[i] = item
		}
		return out
	default:
		return nil
	}
}

func allStrings(values []any) ([]string, bool) {
	out := make([]string, 0, len(values))
	for _, value := range values {
		item, ok := value.(string)
		if !ok {
			return nil, false
		}
		out = append(out, item)
	}
	return out, true
}

func jsonNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		n, err := v.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

func paramJSONNumberField(param ai.ParamDef, field string) (float64, bool) {
	raw, err := json.Marshal(param)
	if err != nil {
		return 0, false
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return 0, false
	}
	value, ok := obj[field].(float64)
	return value, ok
}

func cloneConditionalEnum(items []ai.ParamConditionalEnum) []ai.ParamConditionalEnum {
	out := make([]ai.ParamConditionalEnum, len(items))
	for i, item := range items {
		out[i] = item
		out[i].Options = append([]string{}, item.Options...)
	}
	return out
}

func validateInputLimit(field string, value int) error {
	if value < -1 {
		return fmt.Errorf("%w: %s must be -1 for unlimited or a non-negative integer", ErrInvalidModelCatalog, field)
	}
	return nil
}

func validateCapacityConfig(capacityWeight int, maxConcurrency int) error {
	if capacityWeight < 0 {
		return fmt.Errorf("%w: capacity_weight must be a positive integer", ErrInvalidModelCatalog)
	}
	if maxConcurrency < 0 {
		return fmt.Errorf("%w: max_concurrency must be 0 for unlimited or a positive integer", ErrInvalidModelCatalog)
	}
	return nil
}

func normalizeCapacityWeight(value int) int {
	if value <= 0 {
		return 1
	}
	return value
}

func schemaRuleCount(schema map[string]any) int {
	if items, ok := schema["allOf"].([]any); ok {
		return len(items)
	}
	return 0
}
