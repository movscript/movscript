package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
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
	return s.editionFilterModelCatalog(ctx, filter, []providercontract.AIModelDescriptor{})
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
		Order("public_model_id ASC").
		Find(&entries).Error; err != nil {
		return nil, true, err
	}
	credentials, err := s.catalogRouteCredentialIndex(ctx, entries)
	if err != nil {
		return nil, true, err
	}
	capabilities := compactModelCatalogCapabilities(filter)
	if targetCapability := capabilityFamilyForTargetOutput(filter.TargetOutput); targetCapability != "" {
		capabilities = appendUniqueTrimmed(capabilities, targetCapability)
	}
	operation := strings.TrimSpace(filter.Operation)
	referenceAssets := routeReferenceAssetsFromContract(filter.ReferenceAssets)
	resolveIntent := filter.ResolveIntent || strings.TrimSpace(filter.TargetOutput) != "" || (operation == "" && len(referenceAssets) > 0)
	apiKinds := compactModelCatalogAPIKinds(filter)
	routeGroup := strings.TrimSpace(filter.RouteGroup)
	if routeGroup == "" {
		routeGroup = strings.TrimSpace(providerRouteGroupFromContext(ctx))
	}
	out := make([]providercontract.AIModelDescriptor, 0, len(entries))
	groupIndex := map[string]int{}
	for _, entry := range entries {
		def := catalogEntryDef(entry)
		if !catalogEntryMatchesAnyListCapability(entry, def, capabilities, operation, referenceAssets, resolveIntent) {
			continue
		}
		bindings := catalogEntryBindingsForFilter(entry.RouteBindings, routeGroup, apiKinds, credentials)
		bindings = catalogRouteBindingsForListIntent(bindings, capabilities, operation, referenceAssets, resolveIntent)
		if len(bindings) == 0 && len(apiKinds) > 0 {
			if len(entry.RouteBindings) > 0 || !modelAPIKindsIntersect(catalogRouteBindingSupportedAPIKinds(nil, credentials), apiKinds) {
				continue
			}
		}
		if routeGroup != "" && len(bindings) == 0 {
			continue
		}
		if filter.ProviderVariants && len(bindings) > 0 {
			for _, binding := range bindings {
				bindingDef := catalogEntryDefForBinding(entry, &binding, credentials)
				descriptor := catalogEntryDescriptor(entry, bindingDef, &binding, credentials, true)
				applyListIntentDescriptorMetadata(&descriptor, entry.ModelCapabilitiesJSON, capabilities, operation, referenceAssets, resolveIntent)
				out = append(out, descriptor)
			}
			continue
		}
		var binding *persistencemodel.AIModelRouteBinding
		descriptorDef := def
		if len(bindings) > 0 {
			binding = catalogEntryBestBinding(bindings)
			descriptorDef = catalogEntryDefForBinding(entry, binding, credentials)
		}
		descriptor := catalogEntryDescriptor(entry, descriptorDef, binding, credentials, false)
		applyListIntentDescriptorMetadata(&descriptor, entry.ModelCapabilitiesJSON, capabilities, operation, referenceAssets, resolveIntent)
		descriptor.SupportedAPIKinds = catalogRouteBindingsSupportedAPIKinds(bindings, credentials)
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

func (s *AIService) catalogRouteCredentialIndex(ctx context.Context, entries []persistencemodel.AIModelCatalogEntry) (map[uint]persistencemodel.AICredential, error) {
	ids := map[uint]bool{}
	for _, entry := range entries {
		for _, binding := range entry.RouteBindings {
			if binding.CredentialID != nil && *binding.CredentialID != 0 {
				ids[*binding.CredentialID] = true
			}
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	values := make([]uint, 0, len(ids))
	for id := range ids {
		values = append(values, id)
	}
	var credentials []persistencemodel.AICredential
	if err := s.db.WithContext(ctx).
		Where("id IN ? AND deleted_at IS NULL", values).
		Find(&credentials).Error; err != nil {
		return nil, err
	}
	out := make(map[uint]persistencemodel.AICredential, len(credentials))
	for _, credential := range credentials {
		out[credential.ID] = credential
	}
	return out, nil
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
		Capabilities               []string                                  `json:"capabilities"`
		Operations                 []string                                  `json:"operations"`
		AcceptsImageInput          bool                                      `json:"accepts_image_input"`
		SupportedParamsByOperation map[string][]map[string]any               `json:"supported_params_by_operation"`
		InputRequirements          providercontract.AIModelInputRequirements `json:"input_requirements"`
		ParamsSchemaByOperation    map[string]map[string]any                 `json:"params_schema_by_operation"`
	}{
		Capabilities:               model.Capabilities,
		Operations:                 model.Operations,
		AcceptsImageInput:          model.AcceptsImageInput,
		SupportedParamsByOperation: model.SupportedParamsByOperation,
		InputRequirements:          model.InputRequirements,
		ParamsSchemaByOperation:    model.ParamsSchemaByOperation,
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
		right.SupportedAPIKinds = mergeModelAPIKinds(left.SupportedAPIKinds, right.SupportedAPIKinds)
		right.ResolverOperations = mergeCapabilities(left.ResolverOperations, right.ResolverOperations)
		if right.InferredOperation == "" {
			right.InferredOperation = left.InferredOperation
		}
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
	left.SupportedAPIKinds = mergeModelAPIKinds(left.SupportedAPIKinds, right.SupportedAPIKinds)
	left.ResolverOperations = mergeCapabilities(left.ResolverOperations, right.ResolverOperations)
	if left.InferredOperation == "" {
		left.InferredOperation = right.InferredOperation
	}
	if left.MaxConcurrency == 0 || right.MaxConcurrency == 0 {
		left.MaxConcurrency = 0
	} else {
		left.MaxConcurrency += right.MaxConcurrency
	}
	return left
}

func catalogEntryDef(entry persistencemodel.AIModelCatalogEntry) *ModelDef {
	return catalogEntryDefForAdapter(entry, AdapterOpenAICompat)
}

func catalogEntryDefForBinding(entry persistencemodel.AIModelCatalogEntry, binding *persistencemodel.AIModelRouteBinding, credentials map[uint]persistencemodel.AICredential) *ModelDef {
	adapterType := ""
	if binding != nil {
		adapterType = strings.TrimSpace(binding.AdapterType)
		if adapterType == "" && binding.CredentialID != nil && credentials != nil {
			if credential, ok := credentials[*binding.CredentialID]; ok {
				adapterType = strings.TrimSpace(credential.AdapterType)
			}
		}
		if adapterType == "" {
			adapterType = strings.TrimSpace(binding.SourceType)
		}
	}
	return catalogEntryDefForAdapter(entry, adapterType)
}

func catalogEntryDefForRoute(entry persistencemodel.AIModelCatalogEntry, route ModelRoute) *ModelDef {
	return catalogEntryDefForAdapter(entry, routeAdapterType(route, ""))
}

func catalogEntryDefForAdapter(entry persistencemodel.AIModelCatalogEntry, adapterType string) *ModelDef {
	adapterType = strings.TrimSpace(adapterType)
	if adapterType == "" || GetAdapterDef(adapterType) == nil {
		adapterType = AdapterOpenAICompat
	}
	return ResolveModelDef(
		catalogEntryModelDefID(entry),
		adapterType,
		entry.DisplayName,
		entry.Capabilities,
		entry.ModelCapabilitiesJSON,
		entry.AcceptsImage,
		entry.MaxInputImages,
		entry.MaxInputVideos,
		entry.InputImageField,
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

func catalogEntryMatchesAnyListCapability(entry persistencemodel.AIModelCatalogEntry, def *ModelDef, capabilities []string, operation string, refs []RouteReferenceAssetIntent, resolveIntent bool) bool {
	if len(capabilities) == 0 {
		return true
	}
	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if isStructuredCapabilityFamily(capability) {
			if strings.TrimSpace(operation) != "" {
				if len(refs) > 0 {
					ok, _ := capabilityJSONSupportsIntent(entry.ModelCapabilitiesJSON, capability, operation, refs)
					if ok {
						return true
					}
				} else if ok, _ := capabilityJSONSupportsOperation(entry.ModelCapabilitiesJSON, capability, operation); ok {
					return true
				}
				continue
			}
			if resolveIntent {
				ok, _ := capabilityJSONSupportsInferredIntent(entry.ModelCapabilitiesJSON, capability, refs)
				if ok {
					return true
				}
				continue
			}
			if capabilityJSONHasDomain(entry.ModelCapabilitiesJSON, capability) {
				return true
			}
			continue
		}
		if modelHasCapability(def, capability) {
			return true
		}
	}
	return false
}

func catalogRouteBindingsForListIntent(bindings []persistencemodel.AIModelRouteBinding, capabilities []string, operation string, refs []RouteReferenceAssetIntent, resolveIntent bool) []persistencemodel.AIModelRouteBinding {
	operation = strings.TrimSpace(operation)
	if operation == "" && !resolveIntent {
		return bindings
	}
	out := make([]persistencemodel.AIModelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		if catalogRouteBindingSupportsAnyListIntent(binding, capabilities, operation, refs, resolveIntent) {
			out = append(out, binding)
		}
	}
	return out
}

func catalogRouteBindingSupportsAnyListIntent(binding persistencemodel.AIModelRouteBinding, capabilities []string, operation string, refs []RouteReferenceAssetIntent, resolveIntent bool) bool {
	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if !isStructuredCapabilityFamily(capability) {
			continue
		}
		if strings.TrimSpace(operation) == "" {
			if !resolveIntent {
				continue
			}
			for _, inferredOperation := range inferredStructuredCapabilityOperations(capability, refs) {
				if AdapterSupportsOperation(binding.AdapterType, capability, inferredOperation) {
					return true
				}
			}
			continue
		}
		if len(refs) > 0 {
			ok, _ := catalogRouteBindingMatchesStructuredIntent(binding, ModelRouteRequest{
				Operation:       operation,
				ReferenceAssets: refs,
			}, capability)
			if ok {
				return true
			}
			continue
		}
		if AdapterSupportsOperation(binding.AdapterType, capability, operation) {
			return true
		}
	}
	return false
}

func catalogEntryMatchesRouteRequest(entry persistencemodel.AIModelCatalogEntry, def *ModelDef, req ModelRouteRequest, capability string) bool {
	if isStructuredCapabilityFamily(capability) {
		ok, _ := capabilityJSONSupportsIntent(entry.ModelCapabilitiesJSON, capability, req.Operation, req.ReferenceAssets)
		return ok
	}
	return modelHasCapability(def, capability)
}

func catalogRouteBindingsForStructuredIntent(bindings []persistencemodel.AIModelRouteBinding, req ModelRouteRequest, capability string) []persistencemodel.AIModelRouteBinding {
	if !isStructuredCapabilityFamily(capability) {
		return bindings
	}
	out := make([]persistencemodel.AIModelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		if ok, _ := catalogRouteBindingMatchesStructuredIntent(binding, req, capability); ok {
			out = append(out, binding)
		}
	}
	return out
}

func catalogRouteBindingMatchesStructuredIntent(binding persistencemodel.AIModelRouteBinding, req ModelRouteRequest, capability string) (bool, string) {
	if !isStructuredCapabilityFamily(capability) {
		return true, ""
	}
	operation := strings.TrimSpace(req.Operation)
	if operation == "" {
		return true, ""
	}
	if AdapterSupportsOperation(binding.AdapterType, capability, operation) {
		return true, ""
	}
	return false, "adapter_contract:" + operation
}

func catalogEntryBindingsForFilter(bindings []persistencemodel.AIModelRouteBinding, routeGroup string, apiKinds []string, credentials map[uint]persistencemodel.AICredential) []persistencemodel.AIModelRouteBinding {
	out := make([]persistencemodel.AIModelRouteBinding, 0, len(bindings))
	for _, binding := range bindings {
		if routeGroup != "" && strings.TrimSpace(binding.RouteGroup) != routeGroup {
			continue
		}
		if len(apiKinds) > 0 && !catalogRouteBindingMatchesAPIKinds(binding, apiKinds, credentials) {
			continue
		}
		out = append(out, binding)
	}
	return out
}

func catalogRouteBindingMatchesAPIKinds(binding persistencemodel.AIModelRouteBinding, requested []string, credentials map[uint]persistencemodel.AICredential) bool {
	return modelAPIKindsIntersect(catalogRouteBindingSupportedAPIKinds(&binding, credentials), requested)
}

func catalogRouteBindingsSupportedAPIKinds(bindings []persistencemodel.AIModelRouteBinding, credentials map[uint]persistencemodel.AICredential) []string {
	if len(bindings) == 0 {
		return catalogRouteBindingSupportedAPIKinds(nil, credentials)
	}
	out := make([]string, 0)
	for _, binding := range bindings {
		out = mergeModelAPIKinds(out, catalogRouteBindingSupportedAPIKinds(&binding, credentials))
	}
	return out
}

func catalogRouteBindingSupportedAPIKinds(binding *persistencemodel.AIModelRouteBinding, credentials map[uint]persistencemodel.AICredential) []string {
	if binding == nil {
		return modelAPIKindsForAdapter(AdapterOpenAICompat)
	}
	if explicit := SplitModelAPIKinds(binding.APIKinds); len(explicit) > 0 {
		return explicit
	}
	if adapterType := strings.TrimSpace(binding.AdapterType); adapterType != "" {
		return modelAPIKindsForAdapter(adapterType)
	}
	switch strings.TrimSpace(binding.SourceType) {
	case persistencemodel.ModelRouteSourceLocalProvider:
		if binding.CredentialID != nil {
			if credential, ok := credentials[*binding.CredentialID]; ok {
				return modelAPIKindsForAdapter(credential.AdapterType)
			}
		}
		return modelAPIKindsForAdapter(AdapterOpenAICompat)
	case persistencemodel.ModelRouteSourceRelayGateway:
		return modelAPIKindsForAdapter(AdapterOpenAICompat)
	default:
		return modelAPIKindsForAdapter(AdapterOpenAICompat)
	}
}

func modelAPIKindsForAdapter(adapterType string) []string {
	switch strings.TrimSpace(adapterType) {
	case AdapterAnthropic:
		return []string{ModelAPIKindAnthropicMessages}
	case AdapterOpenAICompat, AdapterVolcen, AdapterGemini, AdapterDashScope, AdapterLocal, "":
		return []string{ModelAPIKindOpenAIChatCompletions, ModelAPIKindOpenAIResponses}
	default:
		return []string{ModelAPIKindOpenAIChatCompletions, ModelAPIKindOpenAIResponses}
	}
}

func mergeModelAPIKinds(left, right []string) []string {
	return NormalizeModelAPIKinds(append(append([]string{}, left...), right...))
}

func modelAPIKindsIntersect(left, right []string) bool {
	if len(right) == 0 {
		return true
	}
	left = NormalizeModelAPIKinds(left)
	right = NormalizeModelAPIKinds(right)
	if len(left) == 0 || len(right) == 0 {
		return false
	}
	set := make(map[string]bool, len(left))
	for _, kind := range left {
		set[kind] = true
	}
	for _, kind := range right {
		if set[kind] {
			return true
		}
	}
	return false
}

func firstMatchingModelAPIKind(supported, requested []string) string {
	if len(requested) == 0 {
		if normalized := NormalizeModelAPIKinds(supported); len(normalized) > 0 {
			return normalized[0]
		}
		return ""
	}
	supportedSet := map[string]bool{}
	for _, kind := range NormalizeModelAPIKinds(supported) {
		supportedSet[kind] = true
	}
	for _, kind := range NormalizeModelAPIKinds(requested) {
		if supportedSet[kind] {
			return kind
		}
	}
	return ""
}

func catalogEntryDescriptor(entry persistencemodel.AIModelCatalogEntry, def *ModelDef, binding *persistencemodel.AIModelRouteBinding, credentials map[uint]persistencemodel.AICredential, includeProviderDetails bool) providercontract.AIModelDescriptor {
	providerModelID := catalogRouteProviderModelID(entry, binding)
	publicModelID := strings.TrimSpace(entry.PublicModelID)
	if publicModelID == "" {
		publicModelID = providerModelID
	}
	credentialID := uint(0)
	providerID := ""
	priority := 0
	capacityWeight := 1
	maxConcurrency := 0
	providerName := ""
	adapterType := ""
	if binding != nil {
		providerID = catalogRouteProviderID(binding)
		adapterType = strings.TrimSpace(binding.AdapterType)
		if binding.CredentialID != nil {
			credentialID = *binding.CredentialID
			if includeProviderDetails {
				credential, ok := credentials[credentialID]
				if ok {
					providerName = credential.DisplayName
					if adapterType == "" {
						adapterType = credential.AdapterType
					}
				}
			}
		}
		priority = binding.Priority
		capacityWeight = runtimeCandidateCapacityWeight(runtimeModelCandidate{capacityWeight: binding.CapacityWeight})
		maxConcurrency = binding.MaxConcurrency
	}
	supportedParamsByOperation := paramDefsByOperationToContractMaps(def.SupportedParamsByOperation)
	paramsSchemaByOperation := paramsSchemaByOperation(def.SupportedParamsByOperation)
	return providercontract.AIModelDescriptor{
		ContractVersion:            2,
		ModelID:                    publicModelID,
		CatalogEntryID:             entry.ID,
		CredentialID:               credentialID,
		ProviderID:                 providerID,
		ProviderModelID:            providerModelID,
		ModelDefID:                 providerModelID,
		ModelIDOverride:            providerModelID,
		DisplayName:                def.DisplayName,
		ShortName:                  entry.ShortName,
		ProviderName:               providerName,
		AdapterType:                adapterType,
		Capabilities:               append([]string(nil), def.Capabilities...),
		Operations:                 operationKeysFromParamDefsByOperation(def.SupportedParamsByOperation),
		SupportedAPIKinds:          catalogRouteBindingSupportedAPIKinds(binding, credentials),
		AcceptsImageInput:          def.AcceptsImageInput,
		LogicalModelID:             publicModelID,
		Priority:                   priority,
		CapacityWeight:             capacityWeight,
		MaxConcurrency:             maxConcurrency,
		SupportedParamsByOperation: supportedParamsByOperation,
		InputRequirements:          modelInputsToContract(modelInputsForDef(def)),
		ParamsSchemaByOperation:    paramsSchemaByOperation,
	}
}

func (s *AIService) resolveCatalogModelRoutePlan(req ModelRouteRequest, capability string, modelID string) (ModelRoutePlan, bool, error) {
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return ModelRoutePlan{}, false, nil
	}
	if req.RouteBindingID != 0 {
		return s.resolveRouteBindingModelRoutePlan(req, capability)
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
	if err := query.Order("public_model_id ASC").Find(&entries).Error; err != nil {
		return ModelRoutePlan{}, true, err
	}
	if len(entries) == 0 {
		return ModelRoutePlan{}, false, nil
	}

	credentials, err := s.catalogRouteCredentialIndex(context.Background(), entries)
	if err != nil {
		return ModelRoutePlan{}, true, err
	}
	routeGroup := strings.TrimSpace(req.RouteGroup)
	apiKinds := compactModelRouteRequestAPIKinds(req)
	type catalogRouteCandidate struct {
		route     ModelRoute
		priority  int
		bindingID uint
	}
	candidates := make([]catalogRouteCandidate, 0, len(entries))
	for _, entry := range entries {
		def := catalogEntryDef(entry)
		if !catalogEntryMatchesRouteRequest(entry, def, req, capability) {
			continue
		}
		bindings := catalogEntryBindingsForFilter(entry.RouteBindings, routeGroup, apiKinds, credentials)
		bindings = catalogRouteBindingsForStructuredIntent(bindings, req, capability)
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
			runtimeModelID := entry.ID
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
			route := s.enrichModelRouteProviderFacts(ModelRoute{
				ModelID:            strings.TrimSpace(entry.PublicModelID),
				RuntimeModelID:     runtimeModelID,
				CatalogEntryID:     entry.ID,
				RouteBindingID:     binding.ID,
				CredentialID:       credentialID,
				SourceType:         strings.TrimSpace(binding.SourceType),
				RouteGroup:         strings.TrimSpace(binding.RouteGroup),
				ProviderID:         catalogRouteProviderID(&binding),
				AdapterType:        strings.TrimSpace(binding.AdapterType),
				ProviderModelID:    catalogRouteProviderModelID(entry, &binding),
				Capability:         capability,
				APIKind:            firstMatchingModelAPIKind(catalogRouteBindingSupportedAPIKinds(&binding, credentials), apiKinds),
				Operation:          strings.TrimSpace(req.Operation),
				EndpointBaseURL:    strings.TrimSpace(binding.EndpointBaseURL),
				EndpointPathPrefix: strings.TrimSpace(binding.EndpointPathPrefix),
				EndpointMode:       normalizeRouteEndpointMode(binding.EndpointMode),
				SelectionReason:    reason,
			})
			candidates = append(candidates, catalogRouteCandidate{
				route:     route,
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
		if isStructuredCapabilityFamily(capability) && strings.TrimSpace(req.Operation) != "" {
			return ModelRoutePlan{}, true, fmt.Errorf("missing_route_capability:%s for model %q and capability %s", strings.TrimSpace(req.Operation), requested, capability)
		}
		if routeGroup != "" {
			return ModelRoutePlan{}, true, fmt.Errorf("model %q is not available for route group %q and capability %s", requested, routeGroup, capability)
		}
		if len(apiKinds) > 0 {
			return ModelRoutePlan{}, true, fmt.Errorf("model %q is not available for api kind %q and capability %s", requested, strings.Join(apiKinds, ","), capability)
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

func (s *AIService) resolveRouteBindingModelRoutePlan(req ModelRouteRequest, capability string) (ModelRoutePlan, bool, error) {
	if !s.db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return ModelRoutePlan{}, false, nil
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := s.db.
		Preload("CatalogEntry").
		Where("id = ? AND is_enabled = true AND deleted_at IS NULL", req.RouteBindingID).
		First(&binding).Error; err != nil {
		return ModelRoutePlan{}, true, err
	}
	if binding.CatalogEntry == nil || binding.CatalogEntry.ID == 0 {
		return ModelRoutePlan{}, true, fmt.Errorf("route binding id=%d has no catalog entry", req.RouteBindingID)
	}
	credentials, err := s.catalogRouteCredentialIndex(context.Background(), []persistencemodel.AIModelCatalogEntry{{
		RouteBindings: []persistencemodel.AIModelRouteBinding{binding},
	}})
	if err != nil {
		return ModelRoutePlan{}, true, err
	}
	apiKinds := compactModelRouteRequestAPIKinds(req)
	if len(apiKinds) > 0 && !catalogRouteBindingMatchesAPIKinds(binding, apiKinds, credentials) {
		return ModelRoutePlan{}, true, fmt.Errorf("route binding id=%d does not support api kind %q", req.RouteBindingID, strings.Join(apiKinds, ","))
	}
	entry := *binding.CatalogEntry
	if !entry.IsEnabled {
		return ModelRoutePlan{}, true, fmt.Errorf("catalog entry id=%d is disabled", entry.ID)
	}
	def := catalogEntryDef(entry)
	if !catalogEntryMatchesRouteRequest(entry, def, req, capability) {
		return ModelRoutePlan{}, true, fmt.Errorf("missing_model_capability:%s for model %q and capability %s", strings.TrimSpace(req.Operation), entry.PublicModelID, capability)
	}
	if ok, _ := catalogRouteBindingMatchesStructuredIntent(binding, req, capability); !ok {
		return ModelRoutePlan{}, true, fmt.Errorf("missing_route_capability:%s for route binding id=%d", strings.TrimSpace(req.Operation), req.RouteBindingID)
	}
	runtimeModelID := entry.ID
	credentialID := uint(0)
	if binding.CredentialID != nil {
		credentialID = *binding.CredentialID
	}
	route := s.enrichModelRouteProviderFacts(ModelRoute{
		ModelID:            strings.TrimSpace(entry.PublicModelID),
		RuntimeModelID:     runtimeModelID,
		CatalogEntryID:     entry.ID,
		RouteBindingID:     binding.ID,
		CredentialID:       credentialID,
		SourceType:         strings.TrimSpace(binding.SourceType),
		RouteGroup:         strings.TrimSpace(binding.RouteGroup),
		ProviderID:         catalogRouteProviderID(&binding),
		AdapterType:        strings.TrimSpace(binding.AdapterType),
		ProviderModelID:    catalogRouteProviderModelID(entry, &binding),
		Capability:         capability,
		APIKind:            firstMatchingModelAPIKind(catalogRouteBindingSupportedAPIKinds(&binding, credentials), apiKinds),
		Operation:          strings.TrimSpace(req.Operation),
		EndpointBaseURL:    strings.TrimSpace(binding.EndpointBaseURL),
		EndpointPathPrefix: strings.TrimSpace(binding.EndpointPathPrefix),
		EndpointMode:       normalizeRouteEndpointMode(binding.EndpointMode),
		SelectionReason:    "route_binding_id",
	})
	return ModelRoutePlan{
		ModelID:         route.ModelID,
		Capability:      capability,
		Routes:          []ModelRoute{route},
		SelectionReason: route.SelectionReason,
	}, true, nil
}

type catalogRouteRuntime struct {
	entry       persistencemodel.AIModelCatalogEntry
	model       catalogRuntimeModel
	def         *ModelDef
	provider    Provider
	adapterType string
}

type catalogRouteDefinition struct {
	entry persistencemodel.AIModelCatalogEntry
	model catalogRuntimeModel
	def   *ModelDef
}

type catalogRuntimeModel struct {
	ID              uint
	ProviderModelID string
	DisplayName     string
	ShortName       string
	Capabilities    string
	AcceptsImage    bool
	MaxInputImages  int
	MaxInputVideos  int
	InputImageField string
	SupportedParams string
}

func (s *AIService) catalogRouteDefinition(ctx context.Context, route ModelRoute, capability string) (catalogRouteDefinition, bool, error) {
	if route.CatalogEntryID == 0 && route.RouteBindingID == 0 {
		return catalogRouteDefinition{}, false, nil
	}
	if route.CatalogEntryID == 0 {
		return catalogRouteDefinition{}, true, fmt.Errorf("catalog entry id is required for route binding id=%d", route.RouteBindingID)
	}
	if strings.TrimSpace(route.SourceType) == "" {
		return catalogRouteDefinition{}, true, fmt.Errorf("route source type is required for catalog entry id=%d", route.CatalogEntryID)
	}
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return catalogRouteDefinition{}, true, fmt.Errorf("model catalog table is required for catalog route")
	}
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, route.CatalogEntryID).Error; err != nil {
		return catalogRouteDefinition{}, true, err
	}
	def := catalogEntryDefForRoute(entry, route)
	if !modelHasCapability(def, capability) {
		return catalogRouteDefinition{}, true, fmt.Errorf("model %q does not support %s", entry.PublicModelID, capability)
	}
	return catalogRouteDefinition{
		entry: entry,
		model: catalogRuntimeModelFromEntry(entry, route.RuntimeModelID),
		def:   def,
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
	definition.model.ProviderModelID = strings.TrimSpace(route.ProviderModelID)
	if strings.TrimSpace(route.SourceType) == persistencemodel.ModelRouteSourceLocalProvider {
		if s.registry == nil {
			return catalogRouteRuntime{}, true, fmt.Errorf("ai provider registry is not configured")
		}
		cred, err := s.localProviderCredentialForRoute(ctx, route)
		if err != nil {
			return catalogRouteRuntime{}, true, err
		}
		adapterType := routeAdapterType(route, cred.AdapterType)
		cred = s.applyRouteEndpointToCredential(ctx, route, cred)
		provider, err := s.registry.buildProvider(cred, definition.def)
		if err != nil {
			return catalogRouteRuntime{}, true, err
		}
		return catalogRouteRuntime{
			entry:       definition.entry,
			model:       definition.model,
			def:         definition.def,
			provider:    provider,
			adapterType: adapterType,
		}, true, nil
	}
	provider, adapterType, handled, err := s.editionProviderForCatalogRoute(ctx, userID, route, capability)
	if handled || err != nil {
		if err != nil {
			return catalogRouteRuntime{}, true, err
		}
		return catalogRouteRuntime{
			entry:       definition.entry,
			model:       definition.model,
			def:         definition.def,
			provider:    provider,
			adapterType: adapterType,
		}, true, nil
	}
	return catalogRouteRuntime{}, true, fmt.Errorf("unsupported catalog route source type %q", strings.TrimSpace(route.SourceType))
}

func catalogRuntimeModelFromEntry(entry persistencemodel.AIModelCatalogEntry, id uint) catalogRuntimeModel {
	if id == 0 {
		id = entry.ID
	}
	return catalogRuntimeModel{
		ID:              id,
		ProviderModelID: strings.TrimSpace(entry.PublicModelID),
		DisplayName:     strings.TrimSpace(entry.DisplayName),
		ShortName:       strings.TrimSpace(entry.ShortName),
		Capabilities:    strings.TrimSpace(entry.Capabilities),
		AcceptsImage:    entry.AcceptsImage,
		MaxInputImages:  entry.MaxInputImages,
		MaxInputVideos:  entry.MaxInputVideos,
		InputImageField: strings.TrimSpace(entry.InputImageField),
		SupportedParams: strings.TrimSpace(entry.SupportedParams),
	}
}

func catalogRouteProviderModelID(entry persistencemodel.AIModelCatalogEntry, binding *persistencemodel.AIModelRouteBinding) string {
	if binding != nil {
		if providerModelID := strings.TrimSpace(binding.ProviderModelID); providerModelID != "" {
			return providerModelID
		}
	}
	return catalogEntryModelDefID(entry)
}

func catalogRouteProviderID(binding *persistencemodel.AIModelRouteBinding) string {
	if binding == nil {
		return ""
	}
	if providerID := strings.TrimSpace(binding.ProviderID); providerID != "" {
		return providerID
	}
	switch strings.TrimSpace(binding.SourceType) {
	case persistencemodel.ModelRouteSourceRelayGateway:
		return persistencemodel.ModelRouteSourceRelayGateway
	case persistencemodel.ModelRouteSourceLocalProvider:
		if binding.CredentialID != nil && *binding.CredentialID != 0 {
			return fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, *binding.CredentialID)
		}
	}
	return strings.TrimSpace(binding.SourceType)
}

func (s *AIService) enrichModelRouteProviderFacts(route ModelRoute) ModelRoute {
	route.ProviderID = strings.TrimSpace(route.ProviderID)
	if route.ProviderID == "" || route.ProviderID == persistencemodel.ModelRouteSourceRelayGateway {
		return route
	}
	if s != nil && s.db != nil && s.db.Migrator().HasTable(&persistencemodel.AIProvider{}) {
		var provider persistencemodel.AIProvider
		if err := s.db.
			Select("provider_kind", "adapter_key").
			Where("provider_id = ? AND deleted_at IS NULL", route.ProviderID).
			First(&provider).Error; err == nil {
			if route.ProviderKind == "" {
				route.ProviderKind = strings.TrimSpace(provider.ProviderKind)
			}
			if route.AdapterKey == "" {
				route.AdapterKey = strings.TrimSpace(provider.AdapterKey)
			}
			return route
		}
	}
	if kind, _, ok := strings.Cut(route.ProviderID, ":"); ok {
		if route.ProviderKind == "" {
			route.ProviderKind = strings.TrimSpace(kind)
		}
		if route.AdapterKey == "" {
			route.AdapterKey = providerTemplateDefaultAdapterKey(kind)
		}
	}
	return route
}

func providerTemplateDefaultAdapterKey(providerKind string) string {
	providerKind = strings.TrimSpace(providerKind)
	if providerKind == "" {
		return ""
	}
	for _, template := range ProviderTemplates() {
		if strings.TrimSpace(template.ProviderKind) == providerKind {
			return strings.TrimSpace(template.DefaultAdapterKey)
		}
	}
	return ""
}

func (s *AIService) localProviderCredentialForRoute(ctx context.Context, route ModelRoute) (persistencemodel.AICredential, error) {
	credentialID := route.CredentialID
	if credentialID == 0 {
		parsed, ok := localProviderCredentialIDFromProviderID(route.ProviderID)
		if ok {
			credentialID = parsed
		}
	}
	if credentialID == 0 {
		parsed, err := s.legacyCredentialIDForProvider(ctx, route.ProviderID)
		if err != nil {
			return persistencemodel.AICredential{}, err
		}
		credentialID = parsed
	}
	if credentialID == 0 {
		return persistencemodel.AICredential{}, fmt.Errorf("provider_id is required for local provider catalog route")
	}
	var cred persistencemodel.AICredential
	if err := s.db.WithContext(ctx).Where("id = ? AND is_enabled = true", credentialID).First(&cred).Error; err != nil {
		return persistencemodel.AICredential{}, fmt.Errorf("provider %q not found or disabled", strings.TrimSpace(route.ProviderID))
	}
	if adapterType := strings.TrimSpace(route.AdapterType); adapterType != "" {
		cred.AdapterType = adapterType
	}
	return cred, nil
}

func (s *AIService) applyRouteEndpointToCredential(ctx context.Context, route ModelRoute, cred persistencemodel.AICredential) persistencemodel.AICredential {
	config := routeEndpointConfigFromRoute(route)
	if !routeEndpointHasConfig(config) && route.RouteBindingID != 0 && s != nil && s.db != nil && s.db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		var binding persistencemodel.AIModelRouteBinding
		if err := s.db.WithContext(ctx).
			Select("endpoint_base_url", "endpoint_path_prefix", "endpoint_mode").
			Where("id = ? AND deleted_at IS NULL", route.RouteBindingID).
			First(&binding).Error; err == nil {
			config = routeEndpointConfigFromBinding(binding)
		}
	}
	if !routeEndpointHasConfig(config) {
		return cred
	}
	baseURL := strings.TrimSpace(cred.BaseURL)
	if baseURL == "" {
		if def := GetAdapterDef(routeAdapterType(route, cred.AdapterType)); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}
	if next := effectiveRouteBaseURL(baseURL, config); strings.TrimSpace(next) != "" {
		cred.BaseURL = next
	}
	return cred
}

func routeAdapterType(route ModelRoute, fallback string) string {
	if adapterType := strings.TrimSpace(route.AdapterType); adapterType != "" {
		return adapterType
	}
	if fallback = strings.TrimSpace(fallback); fallback != "" {
		return fallback
	}
	if adapterKey := strings.TrimSpace(route.AdapterKey); adapterKey != "" {
		return adapterKey
	}
	return strings.TrimSpace(route.SourceType)
}

func (s *AIService) legacyCredentialIDForProvider(ctx context.Context, providerID string) (uint, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" || s == nil || s.db == nil ||
		!s.db.Migrator().HasTable(&persistencemodel.AIProvider{}) ||
		!s.db.Migrator().HasTable(&persistencemodel.AIProviderCredential{}) {
		return 0, nil
	}
	var provider persistencemodel.AIProvider
	if err := s.db.WithContext(ctx).
		Where("provider_id = ? AND is_enabled = true", providerID).
		First(&provider).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, fmt.Errorf("provider %q not found or disabled", providerID)
		}
		return 0, err
	}
	var providerCredential persistencemodel.AIProviderCredential
	if err := s.db.WithContext(ctx).
		Where("provider_id = ? AND status = ?", providerID, persistencemodel.AIProviderCredentialStatusActive).
		Order("is_primary DESC, priority ASC, id ASC").
		First(&providerCredential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, fmt.Errorf("provider %q has no active credential", providerID)
		}
		return 0, err
	}
	var plainConfig struct {
		LegacyCredentialID uint `json:"legacy_credential_id"`
	}
	if err := json.Unmarshal([]byte(providerCredential.PlainConfigJSON), &plainConfig); err != nil {
		return 0, fmt.Errorf("provider %q credential config is invalid: %w", providerID, err)
	}
	if plainConfig.LegacyCredentialID == 0 {
		return 0, fmt.Errorf("provider %q is not linked to a legacy credential yet", providerID)
	}
	return plainConfig.LegacyCredentialID, nil
}

func localProviderCredentialIDFromProviderID(providerID string) (uint, bool) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return 0, false
	}
	if value, ok := strings.CutPrefix(providerID, persistencemodel.ModelRouteSourceLocalProvider+":"); ok {
		return parseProviderCredentialID(value)
	}
	return 0, false
}

func parseProviderCredentialID(value string) (uint, bool) {
	parsed, err := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed == 0 {
		return 0, false
	}
	return uint(parsed), true
}

func catalogEntryModelDefID(entry persistencemodel.AIModelCatalogEntry) string {
	return strings.TrimSpace(entry.PublicModelID)
}

func (model catalogRuntimeModel) usageProfile() modelUsageProfile {
	return modelUsageProfile{}
}

func (s *AIService) ResolveModel(ctx context.Context, request providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:        request.ModelID,
		CatalogEntryID: request.CatalogEntryID,
		Capability:     request.Capability,
		Operation:      request.Operation,
		RouteGroup:     providerRouteGroupFromContext(ctx),
	})
	if err != nil {
		return providercontract.AIModelBinding{}, err
	}
	binding := providercontract.AIModelBinding{
		ModelID:         route.ModelID,
		CatalogEntryID:  route.CatalogEntryID,
		ProviderID:      route.ProviderID,
		ProviderModelID: route.ProviderModelID,
		AdapterType:     strings.TrimSpace(route.AdapterType),
		Capability:      request.Capability,
		Operation:       strings.TrimSpace(request.Operation),
		SelectionReason: route.SelectionReason,
	}
	if route.CatalogEntryID != 0 {
		if strings.TrimSpace(route.SourceType) == persistencemodel.ModelRouteSourceLocalProvider {
			cred, err := s.localProviderCredentialForRoute(ctx, route)
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return providercontract.AIModelBinding{}, err
			}
			if err == nil {
				if binding.AdapterType == "" {
					binding.AdapterType = cred.AdapterType
				}
				binding.ProviderName = cred.DisplayName
			}
		}
		if binding.AdapterType == "" {
			binding.AdapterType = route.SourceType
		}
		if binding.ProviderName == "" && route.RouteGroup != "" {
			binding.ProviderName = route.RouteGroup
		}
		return binding, nil
	}
	return binding, nil
}

func modelInputsToContract(input ModelInputs) providercontract.AIModelInputRequirements {
	return providercontract.AIModelInputRequirements{
		Image: providercontract.AIModelInputRequirement{Min: input.Image.Min, Max: input.Image.Max},
		Video: providercontract.AIModelInputRequirement{Min: input.Video.Min, Max: input.Video.Max},
	}
}

func applyListIntentDescriptorMetadata(descriptor *providercontract.AIModelDescriptor, rawCapabilityJSON string, capabilities []string, operation string, refs []RouteReferenceAssetIntent, resolveIntent bool) {
	if descriptor == nil {
		return
	}
	operation = strings.TrimSpace(operation)
	if operation != "" {
		descriptor.InferredOperation = operation
		descriptor.ResolverOperations = []string{operation}
		return
	}
	if !resolveIntent {
		return
	}
	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if !isStructuredCapabilityFamily(capability) {
			continue
		}
		operations := capabilityJSONSupportedInferredOperations(rawCapabilityJSON, capability, refs)
		if len(operations) == 0 {
			continue
		}
		descriptor.ResolverOperations = mergeCapabilities(descriptor.ResolverOperations, operations)
		if descriptor.InferredOperation == "" {
			descriptor.InferredOperation = operations[0]
		}
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

func paramDefsByOperationToContractMaps(paramsByOperation map[string][]ParamDef) map[string][]map[string]any {
	if len(paramsByOperation) == 0 {
		return nil
	}
	out := make(map[string][]map[string]any, len(paramsByOperation))
	for operation, params := range paramsByOperation {
		operation = strings.TrimSpace(operation)
		if operation == "" {
			continue
		}
		items := paramDefsToContractMaps(params)
		if items == nil {
			items = []map[string]any{}
		}
		out[operation] = items
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func paramsSchemaByOperation(paramsByOperation map[string][]ParamDef) map[string]map[string]any {
	if len(paramsByOperation) == 0 {
		return nil
	}
	out := make(map[string]map[string]any, len(paramsByOperation))
	for operation, params := range paramsByOperation {
		operation = strings.TrimSpace(operation)
		if operation == "" {
			continue
		}
		out[operation] = ParamsSchema(params)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func operationKeysFromParamDefsByOperation(paramsByOperation map[string][]ParamDef) []string {
	if len(paramsByOperation) == 0 {
		return nil
	}
	keys := make([]string, 0, len(paramsByOperation))
	for operation := range paramsByOperation {
		if operation = strings.TrimSpace(operation); operation != "" {
			keys = append(keys, operation)
		}
	}
	sort.Strings(keys)
	return keys
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

func capabilityFamilyForTargetOutput(value string) string {
	switch strings.TrimSpace(value) {
	case "image":
		return CapabilityFamilyImageGeneration
	case "video":
		return CapabilityFamilyVideoGeneration
	case "audio":
		return CapabilityFamilyAudioGeneration
	case "text":
		return CapabilityFamilyTextGeneration
	default:
		return ""
	}
}

func compactModelCatalogAPIKinds(filter providercontract.AIModelListFilter) []string {
	items := append([]string{}, filter.APIKinds...)
	if strings.TrimSpace(filter.APIKind) != "" {
		items = append(items, filter.APIKind)
	}
	return NormalizeModelAPIKinds(items)
}

func compactModelRouteRequestAPIKinds(req ModelRouteRequest) []string {
	items := append([]string{}, req.APIKinds...)
	if strings.TrimSpace(req.APIKind) != "" {
		items = append(items, req.APIKind)
	}
	return NormalizeModelAPIKinds(items)
}

func allModelCatalogCapabilities() []string {
	return []string{
		CapabilityFamilyTextGeneration,
		CapabilityReasoning,
		CapabilityFamilyImageGeneration,
		CapabilityFamilyImageGeneration,
		CapabilityFamilyVideoGeneration,
		CapabilityFamilyVideoGeneration,
		CapabilityFamilyVideoGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyAudioGeneration,
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
