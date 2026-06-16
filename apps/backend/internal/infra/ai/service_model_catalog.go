package ai

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

func (s *AIService) ListModels(ctx context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	capabilities := compactModelCatalogCapabilities(filter)
	if len(capabilities) == 0 {
		capabilities = allModelCatalogCapabilities()
	}
	models, err := s.GetModelsByAnyCapability(capabilities)
	if filter.ProviderVariants {
		models, err = s.GetProviderModelsByAnyCapability(capabilities)
	}
	if err != nil {
		return nil, err
	}
	out := make([]providercontract.AIModelDescriptor, 0, len(models))
	for _, model := range models {
		out = append(out, publicModelToContractDescriptor(model))
	}
	return s.editionFilterModelCatalog(ctx, filter, out)
}

func (s *AIService) ResolveModel(ctx context.Context, request providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:       request.ModelID,
		ModelConfigID: request.ModelConfigID,
		Capability:    request.Capability,
	})
	if err != nil {
		return providercontract.AIModelBinding{}, err
	}
	binding := providercontract.AIModelBinding{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		ProviderModelID: route.ProviderModelID,
		Capability:      request.Capability,
		SelectionReason: route.SelectionReason,
	}
	var row modelConfigWithProvider
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id = ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", route.ModelConfigID).
		First(&row).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return providercontract.AIModelBinding{}, err
	} else if err == nil {
		binding.AdapterType = row.AdapterType
		binding.ProviderName = row.ProviderName
	}
	return binding, nil
}

func publicModelToContractDescriptor(model PublicModel) providercontract.AIModelDescriptor {
	return providercontract.AIModelDescriptor{
		ModelID:           model.ModelID,
		ModelConfigID:     model.ID,
		CredentialID:      model.CredentialID,
		ProviderModelID:   firstNonEmptyString(model.ModelIDOverride, model.ModelID),
		ModelDefID:        model.ModelDefID,
		ModelIDOverride:   model.ModelIDOverride,
		DisplayName:       model.DisplayName,
		ShortName:         model.ShortName,
		ProviderName:      model.ProviderName,
		AdapterType:       model.AdapterType,
		Capabilities:      append([]string(nil), model.Capabilities...),
		PricingMode:       string(model.PricingMode),
		AcceptsImageInput: model.AcceptsImageInput,
		IsDefault:         model.IsDefault,
		LogicalModelID:    model.LogicalModelID,
		ProviderVariants:  model.ProviderVariants,
		Priority:          model.Priority,
		CapacityWeight:    model.CapacityWeight,
		MaxConcurrency:    model.MaxConcurrency,
		SupportedParams:   paramDefsToContractMaps(model.SupportedParams),
		InputRequirements: modelInputsToContract(model.InputRequirements),
		ParamsSchema:      cloneAnyMap(model.ParamsSchema),
	}
}

func modelInputsToContract(input ModelInputs) providercontract.AIModelInputRequirements {
	return providercontract.AIModelInputRequirements{
		Image: providercontract.AIModelInputRequirement{Min: input.Image.Min, Max: input.Image.Max},
		Video: providercontract.AIModelInputRequirement{Min: input.Video.Min, Max: input.Video.Max},
	}
}

func paramDefsToContractMaps(params []ParamDef) []map[string]any {
	if len(params) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(params))
	for _, param := range params {
		raw, err := json.Marshal(param)
		if err != nil {
			continue
		}
		var item map[string]any
		if err := json.Unmarshal(raw, &item); err != nil {
			continue
		}
		out = append(out, item)
	}
	return out
}

func cloneAnyMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func compactModelCatalogCapabilities(filter providercontract.AIModelListFilter) []string {
	items := append([]string{}, filter.Capabilities...)
	if strings.TrimSpace(filter.Capability) != "" {
		items = append(items, filter.Capability)
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	return out
}

func allModelCatalogCapabilities() []string {
	return []string{
		CapabilityText,
		CapabilityReasoning,
		CapabilityImage,
		CapabilityImageEdit,
		CapabilityVideo,
		CapabilityVideoI2V,
		CapabilityVideoV2V,
		CapabilityAudio,
		CapabilityAudioTTS,
		CapabilityAudioSTT,
		CapabilitySubAlign,
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
