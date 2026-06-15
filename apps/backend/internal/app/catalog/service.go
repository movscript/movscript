package catalog

import (
	"context"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/cache"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type Service struct {
	catalog providercontract.AIGatewayModelCatalog
	cache   cache.Cache
}

const modelsCacheTTL = 5 * time.Minute

type PublicModel struct {
	ID                uint                                      `json:"id"`
	CredentialID      uint                                      `json:"credential_id"`
	ModelID           string                                    `json:"model_id"`
	DisplayName       string                                    `json:"display_name"`
	ShortName         string                                    `json:"short_name,omitempty"`
	ProviderName      string                                    `json:"provider_name,omitempty"`
	AdapterType       string                                    `json:"adapter_type,omitempty"`
	Capabilities      []string                                  `json:"capabilities"`
	PricingMode       string                                    `json:"pricing_mode,omitempty"`
	AcceptsImageInput bool                                      `json:"accepts_image_input"`
	IsDefault         bool                                      `json:"is_default,omitempty"`
	LogicalModelID    string                                    `json:"logical_model_id,omitempty"`
	ProviderVariants  int                                       `json:"provider_variant_count,omitempty"`
	ModelDefID        string                                    `json:"model_def_id"`
	ModelIDOverride   string                                    `json:"model_id_override,omitempty"`
	Priority          int                                       `json:"priority"`
	CapacityWeight    int                                       `json:"capacity_weight"`
	MaxConcurrency    int                                       `json:"max_concurrency"`
	SupportedParams   []map[string]any                          `json:"supported_params,omitempty"`
	InputRequirements providercontract.AIModelInputRequirements `json:"input_requirements,omitempty"`
	ParamsSchema      map[string]any                            `json:"params_schema,omitempty"`
}

func NewService(modelCatalog providercontract.AIGatewayModelCatalog, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{catalog: modelCatalog, cache: c}
}

func (s *Service) ListByCapability(ctx context.Context, capability string, providerVariants ...bool) ([]PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	key := "models:capability:" + capability + modelsCacheVariantSuffix(variants)
	var cached []PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	capabilities := splitCapabilityQuery(capability)
	filter := providercontract.AIModelListFilter{Capabilities: capabilities, ProviderVariants: variants}
	descriptors, err := s.catalog.ListModels(ctx, filter)
	if err != nil {
		return nil, err
	}
	models := make([]PublicModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, publicModelFromDescriptor(descriptor))
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}

func publicModelFromDescriptor(descriptor providercontract.AIModelDescriptor) PublicModel {
	return PublicModel{
		ID:                descriptor.ModelConfigID,
		CredentialID:      descriptor.CredentialID,
		ModelID:           descriptor.ModelID,
		DisplayName:       descriptor.DisplayName,
		ShortName:         descriptor.ShortName,
		ProviderName:      descriptor.ProviderName,
		AdapterType:       descriptor.AdapterType,
		Capabilities:      append([]string(nil), descriptor.Capabilities...),
		PricingMode:       descriptor.PricingMode,
		AcceptsImageInput: descriptor.AcceptsImageInput,
		IsDefault:         descriptor.IsDefault,
		LogicalModelID:    descriptor.LogicalModelID,
		ProviderVariants:  descriptor.ProviderVariants,
		ModelDefID:        descriptor.ModelDefID,
		ModelIDOverride:   descriptor.ModelIDOverride,
		Priority:          descriptor.Priority,
		CapacityWeight:    descriptor.CapacityWeight,
		MaxConcurrency:    descriptor.MaxConcurrency,
		SupportedParams:   cloneParamMaps(descriptor.SupportedParams),
		InputRequirements: descriptor.InputRequirements,
		ParamsSchema:      cloneAnyMap(descriptor.ParamsSchema),
	}
}

func cloneParamMaps(input []map[string]any) []map[string]any {
	if len(input) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(input))
	for _, item := range input {
		out = append(out, cloneAnyMap(item))
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

func splitCapabilityQuery(capability string) []string {
	parts := strings.Split(capability, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func modelsCacheVariantSuffix(providerVariants bool) string {
	if providerVariants {
		return ":provider_variants"
	}
	return ":logical"
}
