package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

func (s *AIService) ListModels(ctx context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	if descriptors, handled, err := s.listModelsFromCatalogEntries(ctx, filter); handled || err != nil {
		if err != nil {
			return nil, err
		}
		return s.editionFilterModelCatalog(ctx, filter, descriptors)
	}
	if s.editionModelCatalogOnly() {
		return s.editionFilterModelCatalog(ctx, filter, []providercontract.AIModelDescriptor{})
	}
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

func (s *AIService) listModelsFromCatalogEntries(ctx context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, bool, error) {
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return nil, false, nil
	}
	var total int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.AIModelCatalogEntry{}).Count(&total).Error; err != nil {
		return nil, false, err
	}
	if total == 0 {
		return nil, false, nil
	}
	var entries []persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).
		Preload("RouteBindings", "is_enabled = true").
		Where("is_enabled = true AND deleted_at IS NULL").
		Order("public_model_id ASC, provider_model_id ASC").
		Find(&entries).Error; err != nil {
		return nil, true, err
	}
	capabilities := compactModelCatalogCapabilities(filter)
	routeGroup := strings.TrimSpace(filter.RouteGroup)
	if routeGroup == "" {
		routeGroup = strings.TrimSpace(providerRouteGroupFromContext(ctx))
	}
	out := make([]providercontract.AIModelDescriptor, 0, len(entries))
	groupIndex := map[string]int{}
	for _, entry := range entries {
		def := catalogEntryDef(entry)
		if !modelDefMatchesAnyCapability(def, capabilities) {
			continue
		}
		bindings := catalogEntryBindingsForFilter(entry.RouteBindings, routeGroup)
		if routeGroup != "" && len(bindings) == 0 {
			continue
		}
		if filter.ProviderVariants && len(bindings) > 0 {
			for _, binding := range bindings {
				out = append(out, catalogEntryDescriptor(entry, def, &binding))
			}
			continue
		}
		var binding *persistencemodel.AIModelRouteBinding
		if len(bindings) > 0 {
			binding = catalogEntryBestBinding(bindings)
		}
		descriptor := catalogEntryDescriptor(entry, def, binding)
		descriptor.ProviderVariants = len(bindings)
		if descriptor.ProviderVariants == 0 {
			descriptor.ProviderVariants = 1
		}
		key := catalogDescriptorDedupKey(descriptor)
		if idx, ok := groupIndex[key]; ok {
			out[idx] = mergeCatalogDescriptor(out[idx], descriptor)
			continue
		}
		groupIndex[key] = len(out)
		out = append(out, descriptor)
	}
	return out, true, nil
}

func catalogEntryBestBinding(bindings []persistencemodel.AIModelRouteBinding) *persistencemodel.AIModelRouteBinding {
	if len(bindings) == 0 {
		return nil
	}
	best := bindings[0]
	for _, binding := range bindings[1:] {
		if binding.Priority > best.Priority || (binding.Priority == best.Priority && binding.ID < best.ID) {
			best = binding
		}
	}
	return &best
}

func catalogDescriptorDedupKey(model providercontract.AIModelDescriptor) string {
	return strings.TrimSpace(model.ModelID) + "\x00" + catalogDescriptorContractSignature(model)
}

func catalogDescriptorContractSignature(model providercontract.AIModelDescriptor) string {
	body, err := json.Marshal(struct {
		Capabilities      []string                                  `json:"capabilities"`
		AcceptsImageInput bool                                      `json:"accepts_image_input"`
		SupportedParams   []map[string]any                          `json:"supported_params"`
		InputRequirements providercontract.AIModelInputRequirements `json:"input_requirements"`
		ParamsSchema      map[string]any                            `json:"params_schema"`
	}{
		Capabilities:      model.Capabilities,
		AcceptsImageInput: model.AcceptsImageInput,
		SupportedParams:   model.SupportedParams,
		InputRequirements: model.InputRequirements,
		ParamsSchema:      model.ParamsSchema,
	})
	if err != nil {
		return strings.TrimSpace(model.ProviderModelID)
	}
	return string(body)
}

func mergeCatalogDescriptor(left, right providercontract.AIModelDescriptor) providercontract.AIModelDescriptor {
	if right.Priority > left.Priority {
		right.ProviderVariants += left.ProviderVariants
		right.CapacityWeight += left.CapacityWeight
		right.Capabilities = mergeCapabilities(left.Capabilities, right.Capabilities)
		if left.MaxConcurrency == 0 || right.MaxConcurrency == 0 {
			right.MaxConcurrency = 0
		} else {
			right.MaxConcurrency += left.MaxConcurrency
		}
		return right
	}
	left.ProviderVariants += right.ProviderVariants
	left.CapacityWeight += right.CapacityWeight
	left.Capabilities = mergeCapabilities(left.Capabilities, right.Capabilities)
	if left.MaxConcurrency == 0 || right.MaxConcurrency == 0 {
		left.MaxConcurrency = 0
	} else {
		left.MaxConcurrency += right.MaxConcurrency
	}
	return left
}

func catalogEntryDef(entry persistencemodel.AIModelCatalogEntry) *ModelDef {
	return ResolveModelDef(
		entry.ProviderModelID,
		AdapterOpenAICompat,
		entry.DisplayName,
		entry.Capabilities,
		entry.PricingMode,
		entry.AcceptsImage,
		entry.MaxInputImages,
		entry.MaxInputVideos,
		entry.ImageEditField,
		entry.SupportedParams,
	)
}

func modelDefMatchesAnyCapability(def *ModelDef, capabilities []string) bool {
	if len(capabilities) == 0 {
		return true
	}
	for _, capability := range capabilities {
		if modelHasCapability(def, capability) {
			return true
		}
	}
	return false
}

func catalogEntryBindingsForFilter(bindings []persistencemodel.AIModelRouteBinding, routeGroup string) []persistencemodel.AIModelRouteBinding {
	out := make([]persistencemodel.AIModelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		if routeGroup != "" && strings.TrimSpace(binding.RouteGroup) != routeGroup {
			continue
		}
		out = append(out, binding)
	}
	return out
}

func catalogEntryDescriptor(entry persistencemodel.AIModelCatalogEntry, def *ModelDef, binding *persistencemodel.AIModelRouteBinding) providercontract.AIModelDescriptor {
	providerModelID := strings.TrimSpace(entry.ProviderModelID)
	publicModelID := strings.TrimSpace(entry.PublicModelID)
	if publicModelID == "" {
		publicModelID = providerModelID
	}
	credentialID := uint(0)
	modelConfigID := entry.ID
	priority := 0
	capacityWeight := 1
	maxConcurrency := 0
	if binding != nil {
		if binding.CredentialID != nil {
			credentialID = *binding.CredentialID
		}
		if binding.LocalModelConfigID != nil {
			modelConfigID = *binding.LocalModelConfigID
		}
		priority = binding.Priority
		capacityWeight = runtimeCandidateCapacityWeight(runtimeModelCandidate{cfg: persistencemodel.AIModelConfig{CapacityWeight: binding.CapacityWeight}})
		maxConcurrency = binding.MaxConcurrency
	}
	return providercontract.AIModelDescriptor{
		ModelID:           publicModelID,
		ModelConfigID:     modelConfigID,
		CatalogEntryID:    entry.ID,
		CredentialID:      credentialID,
		ProviderModelID:   providerModelID,
		ModelDefID:        providerModelID,
		ModelIDOverride:   providerModelID,
		DisplayName:       def.DisplayName,
		ShortName:         entry.ShortName,
		Capabilities:      append([]string(nil), def.Capabilities...),
		PricingMode:       string(def.PricingMode),
		AcceptsImageInput: def.AcceptsImageInput,
		LogicalModelID:    publicModelID,
		Priority:          priority,
		CapacityWeight:    capacityWeight,
		MaxConcurrency:    maxConcurrency,
		SupportedParams:   paramDefsToContractMaps(def.SupportedParams),
		InputRequirements: modelInputsToContract(modelInputsForDef(def)),
		ParamsSchema:      ParamsSchema(def.SupportedParams),
	}
}

func (s *AIService) resolveCatalogModelRoutePlan(req ModelRouteRequest, capability string, modelID string) (ModelRoutePlan, bool, error) {
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return ModelRoutePlan{}, false, nil
	}
	modelID = strings.TrimSpace(modelID)
	if modelID == "" && req.CatalogEntryID == 0 {
		return ModelRoutePlan{}, false, nil
	}
	var entries []persistencemodel.AIModelCatalogEntry
	query := s.db.
		Preload("RouteBindings", "is_enabled = true").
		Where("is_enabled = true AND deleted_at IS NULL")
	if modelID != "" {
		query = query.Where("public_model_id = ?", modelID)
	} else {
		query = query.Where("id = ?", req.CatalogEntryID)
	}
	if err := query.Order("public_model_id ASC, provider_model_id ASC").Find(&entries).Error; err != nil {
		return ModelRoutePlan{}, true, err
	}
	if len(entries) == 0 {
		return ModelRoutePlan{}, false, nil
	}

	routeGroup := strings.TrimSpace(req.RouteGroup)
	type catalogRouteCandidate struct {
		route     ModelRoute
		priority  int
		bindingID uint
	}
	candidates := make([]catalogRouteCandidate, 0, len(entries))
	for _, entry := range entries {
		def := catalogEntryDef(entry)
		if !modelHasCapability(def, capability) {
			continue
		}
		bindings := catalogEntryBindingsForFilter(entry.RouteBindings, routeGroup)
		if len(bindings) == 0 {
			continue
		}
		sort.SliceStable(bindings, func(i, j int) bool {
			if bindings[i].Priority != bindings[j].Priority {
				return bindings[i].Priority > bindings[j].Priority
			}
			return bindings[i].ID < bindings[j].ID
		})
		for index, binding := range bindings {
			modelConfigID := entry.ID
			if binding.LocalModelConfigID != nil {
				modelConfigID = *binding.LocalModelConfigID
			}
			credentialID := uint(0)
			if binding.CredentialID != nil {
				credentialID = *binding.CredentialID
			}
			reason := "catalog_model_id"
			if routeGroup != "" {
				reason = "catalog_route_group"
			}
			if index > 0 {
				reason = "fallback_candidate"
			}
			candidates = append(candidates, catalogRouteCandidate{
				route: ModelRoute{
					ModelID:         strings.TrimSpace(entry.PublicModelID),
					ModelConfigID:   modelConfigID,
					CatalogEntryID:  entry.ID,
					RouteBindingID:  binding.ID,
					CredentialID:    credentialID,
					SourceType:      strings.TrimSpace(binding.SourceType),
					RouteGroup:      strings.TrimSpace(binding.RouteGroup),
					ProviderModelID: strings.TrimSpace(entry.ProviderModelID),
					SelectionReason: reason,
					EstimatedCost:   0,
				},
				priority:  binding.Priority,
				bindingID: binding.ID,
			})
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].priority != candidates[j].priority {
			return candidates[i].priority > candidates[j].priority
		}
		return candidates[i].bindingID < candidates[j].bindingID
	})
	routes := make([]ModelRoute, 0, len(candidates))
	for index, candidate := range candidates {
		route := candidate.route
		if index > 0 {
			route.SelectionReason = "fallback_candidate"
		}
		routes = append(routes, route)
	}
	if len(routes) == 0 {
		requested := modelID
		if requested == "" {
			requested = fmt.Sprintf("catalog_entry:%d", req.CatalogEntryID)
		}
		if routeGroup != "" {
			return ModelRoutePlan{}, true, fmt.Errorf("model %q is not available for route group %q and capability %s", requested, routeGroup, capability)
		}
		return ModelRoutePlan{}, true, fmt.Errorf("model %q is not available for capability %s", requested, capability)
	}
	return ModelRoutePlan{
		ModelID:         routes[0].ModelID,
		Capability:      capability,
		Routes:          routes,
		SelectionReason: routes[0].SelectionReason,
	}, true, nil
}

type catalogRouteRuntime struct {
	entry       persistencemodel.AIModelCatalogEntry
	config      persistencemodel.AIModelConfig
	def         *ModelDef
	provider    Provider
	adapterType string
}

type catalogRouteDefinition struct {
	entry  persistencemodel.AIModelCatalogEntry
	config persistencemodel.AIModelConfig
	def    *ModelDef
}

func (s *AIService) catalogRouteDefinition(ctx context.Context, route ModelRoute, capability string) (catalogRouteDefinition, bool, error) {
	if route.CatalogEntryID == 0 || strings.TrimSpace(route.SourceType) == "" {
		return catalogRouteDefinition{}, false, nil
	}
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return catalogRouteDefinition{}, false, nil
	}
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, route.CatalogEntryID).Error; err != nil {
		return catalogRouteDefinition{}, true, err
	}
	def := catalogEntryDef(entry)
	if !modelHasCapability(def, capability) {
		return catalogRouteDefinition{}, true, fmt.Errorf("model %q does not support %s", entry.PublicModelID, capability)
	}
	return catalogRouteDefinition{
		entry:  entry,
		config: catalogEntrySyntheticConfig(entry, route.ModelConfigID),
		def:    def,
	}, true, nil
}

func (s *AIService) catalogRouteRuntime(ctx context.Context, userID uint, route ModelRoute, capability string) (catalogRouteRuntime, bool, error) {
	if strings.TrimSpace(route.RouteGroup) != "" {
		ctx = WithProviderRouteGroup(ctx, strings.TrimSpace(route.RouteGroup))
	}
	definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
	if err != nil || !handled {
		return catalogRouteRuntime{}, handled, err
	}
	if strings.TrimSpace(route.SourceType) == persistencemodel.ModelRouteSourceLocalProvider {
		if s.registry == nil {
			return catalogRouteRuntime{}, true, fmt.Errorf("ai provider registry is not configured")
		}
		if route.CredentialID == 0 {
			return catalogRouteRuntime{}, true, fmt.Errorf("credential id is required for local provider catalog route")
		}
		var cred persistencemodel.AICredential
		if err := s.db.WithContext(ctx).Where("id = ? AND is_enabled = true", route.CredentialID).First(&cred).Error; err != nil {
			return catalogRouteRuntime{}, true, fmt.Errorf("credential id=%d not found or disabled", route.CredentialID)
		}
		provider, err := s.registry.buildProvider(cred, definition.def)
		if err != nil {
			return catalogRouteRuntime{}, true, err
		}
		return catalogRouteRuntime{
			entry:       definition.entry,
			config:      definition.config,
			def:         definition.def,
			provider:    provider,
			adapterType: cred.AdapterType,
		}, true, nil
	}
	provider, adapterType, handled, err := s.editionProviderForCatalogRoute(ctx, userID, route, capability)
	if handled || err != nil {
		if err != nil {
			return catalogRouteRuntime{}, true, err
		}
		return catalogRouteRuntime{
			entry:       definition.entry,
			config:      definition.config,
			def:         definition.def,
			provider:    provider,
			adapterType: adapterType,
		}, true, nil
	}
	return catalogRouteRuntime{}, false, nil
}

func catalogEntrySyntheticConfig(entry persistencemodel.AIModelCatalogEntry, id uint) persistencemodel.AIModelConfig {
	cfg := persistencemodel.AIModelConfig{
		ModelDefID:            strings.TrimSpace(entry.ProviderModelID),
		ModelIDOverride:       strings.TrimSpace(entry.ProviderModelID),
		CustomDisplayName:     strings.TrimSpace(entry.DisplayName),
		ShortName:             strings.TrimSpace(entry.ShortName),
		IsEnabled:             entry.IsEnabled,
		CustomCapabilities:    strings.TrimSpace(entry.Capabilities),
		CustomPricingMode:     strings.TrimSpace(entry.PricingMode),
		CustomAcceptsImage:    entry.AcceptsImage,
		CustomMaxInputImages:  entry.MaxInputImages,
		CustomMaxInputVideos:  entry.MaxInputVideos,
		CustomImageEditField:  strings.TrimSpace(entry.ImageEditField),
		CustomSupportedParams: strings.TrimSpace(entry.SupportedParams),
		CreditsInputPer1M:     entry.CreditsInputPer1M,
		CreditsOutputPer1M:    entry.CreditsOutputPer1M,
		CreditsPerImage:       entry.CreditsPerImage,
		CreditsPerSecond:      entry.CreditsPerSecond,
		CreditsPerCall:        entry.CreditsPerCall,
	}
	cfg.ID = id
	if cfg.ID == 0 {
		cfg.ID = entry.ID
	}
	return cfg
}

func (s *AIService) ResolveModel(ctx context.Context, request providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:        request.ModelID,
		ModelConfigID:  request.ModelConfigID,
		CatalogEntryID: request.CatalogEntryID,
		Capability:     request.Capability,
		RouteGroup:     providerRouteGroupFromContext(ctx),
	})
	if err != nil {
		return providercontract.AIModelBinding{}, err
	}
	binding := providercontract.AIModelBinding{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		CatalogEntryID:  route.CatalogEntryID,
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
		CapabilityAudioMusic,
		CapabilityAudioSFX,
		CapabilitySubAlign,
		CapabilitySubTranslate,
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
