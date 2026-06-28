package catalog

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/infra/cache"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type Service struct {
	catalog providercontract.AIGatewayModelCatalog
}

type ListOptions struct {
	ProviderVariants bool
	RouteGroup       string
	APIKinds         []string
	Operation        string
	ReferenceAssets  []providercontract.AIReferenceAssetIntent
}

type PublicModel struct {
	ID                uint                                      `json:"id"`
	CatalogEntryID    uint                                      `json:"catalog_entry_id,omitempty"`
	ModelID           string                                    `json:"model_id"`
	DisplayName       string                                    `json:"display_name"`
	ShortName         string                                    `json:"short_name,omitempty"`
	Capabilities      []string                                  `json:"capabilities"`
	SupportedAPIKinds []string                                  `json:"supported_api_kinds,omitempty"`
	AcceptsImageInput bool                                      `json:"accepts_image_input"`
	IsDefault         bool                                      `json:"is_default,omitempty"`
	LogicalModelID    string                                    `json:"logical_model_id,omitempty"`
	ProviderVariants  int                                       `json:"provider_variant_count,omitempty"`
	SupportedParams   []map[string]any                          `json:"supported_params,omitempty"`
	InputRequirements providercontract.AIModelInputRequirements `json:"input_requirements,omitempty"`
	ParamsSchema      map[string]any                            `json:"params_schema,omitempty"`
}

func NewService(modelCatalog providercontract.AIGatewayModelCatalog, cacheStore ...cache.Cache) *Service {
	_ = cacheStore
	return &Service{catalog: modelCatalog}
}

func (s *Service) ListByCapability(ctx context.Context, capability string, providerVariants ...bool) ([]PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	return s.ListByCapabilityWithOptions(ctx, capability, ListOptions{ProviderVariants: variants})
}

func (s *Service) ListByCapabilityWithOptions(ctx context.Context, capability string, opts ListOptions) ([]PublicModel, error) {
	apiKinds := splitModelAPIKindQuery(opts.APIKinds...)
	capabilities := splitCapabilityQuery(capability)
	filter := providercontract.AIModelListFilter{
		Capabilities:     capabilities,
		APIKinds:         apiKinds,
		Operation:        strings.TrimSpace(opts.Operation),
		ReferenceAssets:  opts.ReferenceAssets,
		ProviderVariants: opts.ProviderVariants,
		RouteGroup:       strings.TrimSpace(opts.RouteGroup),
	}
	descriptors, err := s.catalog.ListModels(ctx, filter)
	if err != nil {
		return nil, err
	}
	models := make([]PublicModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, publicModelFromDescriptor(descriptor))
	}
	return models, nil
}

func (s *Service) ListByCapabilityForRoute(ctx context.Context, capability string, routeGroup string, providerVariants ...bool) ([]PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	return s.ListByCapabilityWithOptions(ctx, capability, ListOptions{ProviderVariants: variants, RouteGroup: routeGroup})
}

func publicModelFromDescriptor(descriptor providercontract.AIModelDescriptor) PublicModel {
	return PublicModel{
		ID:                descriptor.CatalogEntryID,
		CatalogEntryID:    descriptor.CatalogEntryID,
		ModelID:           descriptor.ModelID,
		DisplayName:       descriptor.DisplayName,
		ShortName:         descriptor.ShortName,
		Capabilities:      append([]string(nil), descriptor.Capabilities...),
		SupportedAPIKinds: append([]string(nil), descriptor.SupportedAPIKinds...),
		AcceptsImageInput: descriptor.AcceptsImageInput,
		IsDefault:         descriptor.IsDefault,
		LogicalModelID:    descriptor.LogicalModelID,
		ProviderVariants:  descriptor.ProviderVariants,
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

func splitModelAPIKindQuery(values ...string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			kind := strings.TrimSpace(part)
			if kind == "" || seen[kind] {
				continue
			}
			seen[kind] = true
			out = append(out, kind)
		}
	}
	return out
}
