package aiadmin

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/app/dto"
	domainaiadmin "github.com/movscript/movscript/internal/domain/aiadmin"
	"github.com/movscript/movscript/internal/infra/ai"
)

type PatchModelConfigInput struct {
	ID                    string
	ModelIDOverride       *string
	IsEnabled             *bool
	Priority              *int
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
	CustomSupportedParams string
}

type ModelConfigContractPreview struct {
	Capabilities          []string       `json:"capabilities"`
	SupportedParams       []ai.ParamDef  `json:"supported_params"`
	ParamsSchema          map[string]any `json:"params_schema"`
	ParamsSchemaRuleCount int            `json:"params_schema_rule_count"`
}

func (s *Service) ListModelConfigs(ctx context.Context, credentialID string) ([]domainaiadmin.ModelConfig, error) {
	return s.repo.ListModelConfigs(ctx, credentialID)
}

func (s *Service) CreateModelConfig(ctx context.Context, credentialID uint, input dto.AIModelConfigInput) (domainaiadmin.ModelConfig, error) {
	adapterType, err := s.adapterTypeForCredential(ctx, credentialID)
	if err != nil {
		return domainaiadmin.ModelConfig{}, err
	}
	if err := validateModelConfigInput(adapterType, "", input); err != nil {
		return domainaiadmin.ModelConfig{}, err
	}
	cfg := newModelConfig(credentialID, input)
	if err := s.repo.CreateModelConfig(ctx, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Service) UpdateModelConfig(ctx context.Context, id string, input dto.AIModelConfigInput) (domainaiadmin.ModelConfig, error) {
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

func (s *Service) DeleteModelConfig(ctx context.Context, id string) error {
	return s.repo.DeleteModelConfig(ctx, id)
}

func (s *Service) PatchModelConfig(ctx context.Context, input PatchModelConfigInput) (domainaiadmin.ModelConfig, error) {
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

func (s *Service) GetModelConfig(ctx context.Context, id string) (domainaiadmin.ModelConfig, error) {
	return s.repo.GetModelConfig(ctx, id)
}

func (s *Service) PreviewModelConfigContract(input PreviewModelConfigContractInput) (ModelConfigContractPreview, error) {
	capabilities := ai.SplitCapabilities(input.CustomCapabilities)
	if len(capabilities) == 0 {
		return ModelConfigContractPreview{}, fmt.Errorf("%w: custom_capabilities is required", ErrInvalidModelConfig)
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
	}, nil
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

func newModelConfig(credentialID uint, input dto.AIModelConfigInput) domainaiadmin.ModelConfig {
	return domainaiadmin.NewModelConfig(domainaiadmin.NewModelConfigSpec{
		CredentialID:          credentialID,
		ModelDefID:            input.ModelDefID,
		ModelIDOverride:       input.ModelIDOverride,
		IsEnabled:             input.IsEnabled,
		Priority:              input.Priority,
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

func applyModelConfigInput(cfg *domainaiadmin.ModelConfig, input dto.AIModelConfigInput) {
	cfg.ModelDefID = input.ModelDefID
	cfg.ModelIDOverride = input.ModelIDOverride
	cfg.Priority = input.Priority
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
	supportedParams := input.CustomSupportedParams
	if supportedParams == "" {
		supportedParams = existingSupportedParams
	}
	capabilities := ai.SplitCapabilities(input.CustomCapabilities)
	if err := ai.ValidateModelParamConfig(adapterType, capabilities, supportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelConfig, err)
	}
	return nil
}

func validateStoredModelConfig(adapterType string, cfg domainaiadmin.ModelConfig) error {
	if strings.TrimSpace(cfg.CustomCapabilities) == "" {
		return fmt.Errorf("%w: custom_capabilities is required", ErrInvalidModelConfig)
	}
	capabilities := ai.SplitCapabilities(cfg.CustomCapabilities)
	if err := ai.ValidateModelParamConfig(adapterType, capabilities, cfg.CustomSupportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelConfig, err)
	}
	return nil
}

func schemaRuleCount(schema map[string]any) int {
	if items, ok := schema["allOf"].([]any); ok {
		return len(items)
	}
	return 0
}
