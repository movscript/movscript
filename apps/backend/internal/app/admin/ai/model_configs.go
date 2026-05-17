package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/app/dto"
	domainai "github.com/movscript/movscript/internal/domain/ai"
	"github.com/movscript/movscript/internal/infra/ai"
)

type PatchModelConfigInput struct {
	ID                    string
	ModelIDOverride       *string
	IsEnabled             *bool
	Priority              *int
	CapacityWeight        *int
	MaxConcurrency        *int
	CreditsInputPer1M     *float64
	CreditsOutputPer1M    *float64
	CreditsPerImage       *float64
	CreditsPerSecond      *float64
	CreditsPerCall        *float64
	CustomDisplayName     *string
	ShortName             *string
	CustomCapabilities    *string
	CustomPricingMode     *string
	CustomAcceptsImage    *bool
	CustomMaxInputImages  *int
	CustomMaxInputVideos  *int
	CustomImageEditField  *string
	CustomSupportedParams *string
}

type PreviewModelConfigContractInput struct {
	AdapterType           string
	CustomCapabilities    string
	CustomAcceptsImage    bool
	CustomMaxInputImages  int
	CustomMaxInputVideos  int
	CustomSupportedParams string
}

type ModelConfigContractPreview struct {
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

func (s *Service) ListModelConfigs(ctx context.Context, credentialID string) ([]domainai.ModelConfig, error) {
	return s.repo.ListModelConfigs(ctx, credentialID)
}

func (s *Service) CreateModelConfig(ctx context.Context, credentialID uint, input dto.AIModelConfigInput) (domainai.ModelConfig, error) {
	adapterType, err := s.adapterTypeForCredential(ctx, credentialID)
	if err != nil {
		return domainai.ModelConfig{}, err
	}
	if err := validateModelConfigInput(adapterType, "", input); err != nil {
		return domainai.ModelConfig{}, err
	}
	cfg := newModelConfig(credentialID, input)
	if err := s.repo.CreateModelConfig(ctx, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) UpdateModelConfig(ctx context.Context, id string, input dto.AIModelConfigInput) (domainai.ModelConfig, error) {
	cfg, err := s.GetModelConfig(ctx, id)
	if err != nil {
		return cfg, err
	}
	adapterType, err := s.adapterTypeForCredential(ctx, cfg.CredentialID)
	if err != nil {
		return cfg, err
	}
	if err := validateModelConfigInput(adapterType, cfg.CustomSupportedParams, input); err != nil {
		return cfg, err
	}
	applyModelConfigInput(&cfg, input)
	if err := s.repo.SaveModelConfig(ctx, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) DeleteModelConfig(ctx context.Context, id string) (domainai.ModelConfig, error) {
	modelConfigID, err := parseUintID(id)
	if err != nil {
		return domainai.ModelConfig{}, err
	}
	cfg, err := s.repo.GetModelConfig(ctx, id)
	if err != nil {
		return cfg, err
	}
	if err := s.repo.DeleteModelConfig(ctx, modelConfigID); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) PatchModelConfig(ctx context.Context, input PatchModelConfigInput) (domainai.ModelConfig, error) {
	cfg, err := s.GetModelConfig(ctx, input.ID)
	if err != nil {
		return cfg, err
	}
	if input.ModelIDOverride != nil {
		cfg.ModelIDOverride = *input.ModelIDOverride
	}
	if input.CustomDisplayName != nil {
		cfg.CustomDisplayName = *input.CustomDisplayName
	}
	if input.ShortName != nil {
		cfg.ShortName = *input.ShortName
	}
	if input.CustomCapabilities != nil {
		cfg.CustomCapabilities = *input.CustomCapabilities
	}
	if input.CustomPricingMode != nil {
		cfg.CustomPricingMode = *input.CustomPricingMode
	}
	if input.CustomAcceptsImage != nil {
		cfg.CustomAcceptsImage = *input.CustomAcceptsImage
	}
	if input.CustomMaxInputImages != nil {
		cfg.CustomMaxInputImages = *input.CustomMaxInputImages
	}
	if input.CustomMaxInputVideos != nil {
		cfg.CustomMaxInputVideos = *input.CustomMaxInputVideos
	}
	if input.CustomImageEditField != nil {
		cfg.CustomImageEditField = *input.CustomImageEditField
	}
	if input.CustomSupportedParams != nil {
		cfg.CustomSupportedParams = *input.CustomSupportedParams
	}
	adapterType, err := s.adapterTypeForCredential(ctx, cfg.CredentialID)
	if err != nil {
		return cfg, err
	}
	if err := validateStoredModelConfig(adapterType, cfg); err != nil {
		return cfg, err
	}
	if input.IsEnabled != nil {
		cfg.IsEnabled = *input.IsEnabled
	}
	if input.Priority != nil {
		cfg.Priority = *input.Priority
	}
	if input.CapacityWeight != nil {
		cfg.CapacityWeight = normalizeCapacityWeight(*input.CapacityWeight)
	}
	if input.MaxConcurrency != nil {
		cfg.MaxConcurrency = *input.MaxConcurrency
	}
	if input.CreditsInputPer1M != nil {
		cfg.CreditsInputPer1M = *input.CreditsInputPer1M
	}
	if input.CreditsOutputPer1M != nil {
		cfg.CreditsOutputPer1M = *input.CreditsOutputPer1M
	}
	if input.CreditsPerImage != nil {
		cfg.CreditsPerImage = *input.CreditsPerImage
	}
	if input.CreditsPerSecond != nil {
		cfg.CreditsPerSecond = *input.CreditsPerSecond
	}
	if input.CreditsPerCall != nil {
		cfg.CreditsPerCall = *input.CreditsPerCall
	}
	if err := s.repo.SaveModelConfig(ctx, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) GetModelConfig(ctx context.Context, id string) (domainai.ModelConfig, error) {
	return s.repo.GetModelConfig(ctx, id)
}

func (s *Service) PreviewModelConfigContract(input PreviewModelConfigContractInput) (ModelConfigContractPreview, error) {
	capabilities := ai.SplitCapabilities(input.CustomCapabilities)
	if len(capabilities) == 0 {
		return ModelConfigContractPreview{}, fmt.Errorf("%w: custom_capabilities is required", ErrInvalidModelConfig)
	}
	if err := validateInputLimit("custom_max_input_images", input.CustomMaxInputImages); err != nil {
		return ModelConfigContractPreview{}, err
	}
	if err := validateInputLimit("custom_max_input_videos", input.CustomMaxInputVideos); err != nil {
		return ModelConfigContractPreview{}, err
	}
	if err := ai.ValidateModelParamConfig(input.AdapterType, capabilities, input.CustomSupportedParams); err != nil {
		return ModelConfigContractPreview{}, fmt.Errorf("%w: %v", ErrInvalidModelConfig, err)
	}
	params, _ := ai.ResolveEffectiveParams(input.AdapterType, capabilities, input.CustomSupportedParams)
	schema := ai.ParamsSchema(params)
	return ModelConfigContractPreview{
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
	for _, capability := range capabilities {
		switch capability {
		case ai.CapabilityImageEdit, ai.CapabilityVideoI2V:
			out.Image.Min = 1
			if out.Image.Max == 0 {
				out.Image.Max = 1
			}
		case ai.CapabilityVideoV2V:
			out.Video.Min = 1
			if out.Video.Max == 0 {
				out.Video.Max = 1
			}
		}
	}
	return out
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

func (s *Service) TestModelConfig(ctx context.Context, id string) (TestResult, error) {
	cfg, err := s.GetModelConfig(ctx, id)
	if err != nil {
		return TestResult{}, err
	}
	cred, err := s.GetCredential(ctx, cfg.CredentialID)
	if err != nil {
		return TestResult{}, fmt.Errorf("credential not found: %w", err)
	}
	def := ai.ResolveModelDef(cfg.ModelDefID, cred.AdapterType, cfg.CustomDisplayName, cfg.CustomCapabilities, cfg.CustomPricingMode, cfg.CustomAcceptsImage, cfg.CustomMaxInputImages, cfg.CustomMaxInputVideos, cfg.CustomImageEditField, cfg.CustomSupportedParams)

	hasText := false
	for _, cap := range def.Capabilities {
		if cap == "text" {
			hasText = true
			break
		}
	}
	if !hasText {
		return TestResult{
			Success: true,
			Message: "图像/视频模型跳过生成测试（避免计费），请通过凭据连接测试验证 key",
		}, nil
	}

	provider, _, err := s.registry.BuildForConfig(cfg.ToModel())
	if err != nil {
		return TestResult{Success: false, Message: err.Error()}, nil
	}
	modelID := ai.ResolveModelID(cfg.ModelIDOverride, def)
	start := time.Now()
	_, err = provider.TextGenerate(ctx, ai.TextRequest{
		Model:     modelID,
		Messages:  []ai.Message{{Role: "user", Content: "Hi"}},
		MaxTokens: 1,
	})
	if err != nil {
		return TestResult{Success: false, Message: err.Error(), LatencyMs: time.Since(start).Milliseconds()}, nil
	}
	return TestResult{Success: true, Message: "模型响应正常", LatencyMs: time.Since(start).Milliseconds()}, nil
}

func (s *Service) DebugModelConfig(ctx context.Context, id string) (ai.DebugCallResult, error) {
	cfg, err := s.GetModelConfig(ctx, id)
	if err != nil {
		return ai.DebugCallResult{}, err
	}
	return s.registry.DebugCall(ctx, cfg.ToModel()), nil
}

func newModelConfig(credentialID uint, input dto.AIModelConfigInput) domainai.ModelConfig {
	return domainai.NewModelConfig(domainai.NewModelConfigSpec{
		CredentialID:          credentialID,
		ModelDefID:            input.ModelDefID,
		ModelIDOverride:       input.ModelIDOverride,
		IsEnabled:             input.IsEnabled,
		Priority:              input.Priority,
		CapacityWeight:        input.CapacityWeight,
		MaxConcurrency:        input.MaxConcurrency,
		CreditsInputPer1M:     input.CreditsInputPer1M,
		CreditsOutputPer1M:    input.CreditsOutputPer1M,
		CreditsPerImage:       input.CreditsPerImage,
		CreditsPerSecond:      input.CreditsPerSecond,
		CreditsPerCall:        input.CreditsPerCall,
		CustomDisplayName:     input.CustomDisplayName,
		ShortName:             input.ShortName,
		CustomCapabilities:    input.CustomCapabilities,
		CustomPricingMode:     input.CustomPricingMode,
		CustomAcceptsImage:    input.CustomAcceptsImage,
		CustomMaxInputImages:  input.CustomMaxInputImages,
		CustomMaxInputVideos:  input.CustomMaxInputVideos,
		CustomImageEditField:  input.CustomImageEditField,
		CustomSupportedParams: input.CustomSupportedParams,
	})
}

func applyModelConfigInput(cfg *domainai.ModelConfig, input dto.AIModelConfigInput) {
	cfg.ModelDefID = input.ModelDefID
	cfg.ModelIDOverride = input.ModelIDOverride
	cfg.Priority = input.Priority
	cfg.CapacityWeight = normalizeCapacityWeight(input.CapacityWeight)
	cfg.MaxConcurrency = input.MaxConcurrency
	cfg.CreditsInputPer1M = input.CreditsInputPer1M
	cfg.CreditsOutputPer1M = input.CreditsOutputPer1M
	cfg.CreditsPerImage = input.CreditsPerImage
	cfg.CreditsPerSecond = input.CreditsPerSecond
	cfg.CreditsPerCall = input.CreditsPerCall
	cfg.CustomDisplayName = input.CustomDisplayName
	cfg.ShortName = input.ShortName
	cfg.CustomCapabilities = input.CustomCapabilities
	cfg.CustomPricingMode = input.CustomPricingMode
	cfg.CustomAcceptsImage = input.CustomAcceptsImage
	cfg.CustomMaxInputImages = input.CustomMaxInputImages
	cfg.CustomMaxInputVideos = input.CustomMaxInputVideos
	cfg.CustomImageEditField = input.CustomImageEditField
	cfg.CustomSupportedParams = input.CustomSupportedParams
	if input.IsEnabled != nil {
		cfg.IsEnabled = *input.IsEnabled
	}
}

func (s *Service) adapterTypeForCredential(ctx context.Context, credentialID uint) (string, error) {
	cred, err := s.GetCredential(ctx, credentialID)
	if err != nil {
		return "", fmt.Errorf("credential not found: %w", err)
	}
	return cred.AdapterType, nil
}

func validateModelConfigInput(adapterType string, existingSupportedParams string, input dto.AIModelConfigInput) error {
	if err := validateCapacityConfig(input.CapacityWeight, input.MaxConcurrency); err != nil {
		return err
	}
	supportedParams := input.CustomSupportedParams
	if supportedParams == "" {
		supportedParams = existingSupportedParams
	}
	if err := validateInputLimit("custom_max_input_images", input.CustomMaxInputImages); err != nil {
		return err
	}
	if err := validateInputLimit("custom_max_input_videos", input.CustomMaxInputVideos); err != nil {
		return err
	}
	capabilities := ai.SplitCapabilities(input.CustomCapabilities)
	if err := ai.ValidateModelParamConfig(adapterType, capabilities, supportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelConfig, err)
	}
	return nil
}

func validateStoredModelConfig(adapterType string, cfg domainai.ModelConfig) error {
	if strings.TrimSpace(cfg.CustomCapabilities) == "" {
		return fmt.Errorf("%w: custom_capabilities is required", ErrInvalidModelConfig)
	}
	if err := validateCapacityConfig(cfg.CapacityWeight, cfg.MaxConcurrency); err != nil {
		return err
	}
	if err := validateInputLimit("custom_max_input_images", cfg.CustomMaxInputImages); err != nil {
		return err
	}
	if err := validateInputLimit("custom_max_input_videos", cfg.CustomMaxInputVideos); err != nil {
		return err
	}
	capabilities := ai.SplitCapabilities(cfg.CustomCapabilities)
	if err := ai.ValidateModelParamConfig(adapterType, capabilities, cfg.CustomSupportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelConfig, err)
	}
	return nil
}

func validateInputLimit(field string, value int) error {
	if value < -1 {
		return fmt.Errorf("%w: %s must be -1 for unlimited or a non-negative integer", ErrInvalidModelConfig, field)
	}
	return nil
}

func validateCapacityConfig(capacityWeight int, maxConcurrency int) error {
	if capacityWeight < 0 {
		return fmt.Errorf("%w: capacity_weight must be a positive integer", ErrInvalidModelConfig)
	}
	if maxConcurrency < 0 {
		return fmt.Errorf("%w: max_concurrency must be 0 for unlimited or a positive integer", ErrInvalidModelConfig)
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
