package ai

import (
	"context"
	"fmt"
	"sort"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

const (
	ModelRouteDiagnosticStatusSelected = "selected"
	ModelRouteDiagnosticStatusAccepted = "accepted"
	ModelRouteDiagnosticStatusRejected = "rejected"
)

type ModelRouteDiagnosis struct {
	ModelID         string                          `json:"model_id,omitempty"`
	CatalogEntryID  uint                            `json:"catalog_entry_id,omitempty"`
	Capability      string                          `json:"capability"`
	Operation       string                          `json:"operation,omitempty"`
	RouteGroup      string                          `json:"route_group,omitempty"`
	SelectedRouteID uint                            `json:"selected_route_id,omitempty"`
	SelectedRoute   *ModelRouteDiagnosticCandidate  `json:"selected_route,omitempty"`
	Candidates      []ModelRouteDiagnosticCandidate `json:"candidates"`
}

type ModelRouteDiagnosticCandidate struct {
	CatalogEntryID    uint                          `json:"catalog_entry_id"`
	PublicModelID     string                        `json:"public_model_id"`
	RouteBindingID    uint                          `json:"route_binding_id,omitempty"`
	Status            string                        `json:"status"`
	Reasons           []string                      `json:"reasons,omitempty"`
	SourceType        string                        `json:"source_type,omitempty"`
	RouteGroup        string                        `json:"route_group,omitempty"`
	ProviderID        string                        `json:"provider_id,omitempty"`
	AdapterType       string                        `json:"adapter_type,omitempty"`
	ProviderModelID   string                        `json:"provider_model_id,omitempty"`
	APIKinds          []string                      `json:"api_kinds,omitempty"`
	Priority          int                           `json:"priority"`
	CapacityWeight    int                           `json:"capacity_weight"`
	MaxConcurrency    int                           `json:"max_concurrency,omitempty"`
	EffectiveEndpoint *ModelRouteDiagnosticEndpoint `json:"effective_endpoint,omitempty"`
	ResourceAccess    *ModelRouteResourceAccess     `json:"resource_access,omitempty"`
}

type ModelRouteDiagnosticEndpoint struct {
	BaseURL          string `json:"base_url,omitempty"`
	PathPrefix       string `json:"path_prefix,omitempty"`
	Mode             string `json:"mode,omitempty"`
	OperationProfile string `json:"operation_profile,omitempty"`
	EffectiveBaseURL string `json:"effective_base_url,omitempty"`
}

type ModelRouteResourceAccess struct {
	Required   bool     `json:"required"`
	Transport  string   `json:"transport,omitempty"`
	InputMedia []string `json:"input_media,omitempty"`
	DependsOn  string   `json:"depends_on,omitempty"`
}

func (s *AIService) DiagnoseModelRoute(ctx context.Context, req ModelRouteRequest) (ModelRouteDiagnosis, error) {
	capability := strings.TrimSpace(req.Capability)
	if capability == "" {
		return ModelRouteDiagnosis{}, fmt.Errorf("model capability is required")
	}
	diagnosis := ModelRouteDiagnosis{
		ModelID:        strings.TrimSpace(req.ModelID),
		CatalogEntryID: req.CatalogEntryID,
		Capability:     capability,
		Operation:      strings.TrimSpace(req.Operation),
		RouteGroup:     strings.TrimSpace(req.RouteGroup),
	}
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return diagnosis, fmt.Errorf("model catalog table is required")
	}

	entries, err := s.diagnosticCatalogEntries(ctx, req)
	if err != nil {
		return diagnosis, err
	}
	if len(entries) == 0 {
		return diagnosis, nil
	}
	credentials, err := s.catalogRouteCredentialIndex(ctx, entries)
	if err != nil {
		return diagnosis, err
	}
	apiKinds := compactModelRouteRequestAPIKinds(req)
	for _, entry := range entries {
		entryReasons := diagnosticCatalogEntryReasons(entry, req, capability)
		if len(entry.RouteBindings) == 0 {
			diagnosis.Candidates = append(diagnosis.Candidates, ModelRouteDiagnosticCandidate{
				CatalogEntryID: entry.ID,
				PublicModelID:  strings.TrimSpace(entry.PublicModelID),
				Status:         ModelRouteDiagnosticStatusRejected,
				Reasons:        append(entryReasons, "missing_route_binding"),
			})
			continue
		}
		for _, binding := range entry.RouteBindings {
			candidate := s.diagnosticRouteCandidate(entry, binding, credentials, req, capability, apiKinds, entryReasons)
			diagnosis.Candidates = append(diagnosis.Candidates, candidate)
		}
	}
	sort.SliceStable(diagnosis.Candidates, func(i, j int) bool {
		left := diagnosis.Candidates[i]
		right := diagnosis.Candidates[j]
		leftAccepted := len(left.Reasons) == 0
		rightAccepted := len(right.Reasons) == 0
		if leftAccepted != rightAccepted {
			return leftAccepted
		}
		if left.Priority != right.Priority {
			return left.Priority > right.Priority
		}
		return left.RouteBindingID < right.RouteBindingID
	})
	for index := range diagnosis.Candidates {
		if len(diagnosis.Candidates[index].Reasons) > 0 {
			diagnosis.Candidates[index].Status = ModelRouteDiagnosticStatusRejected
			continue
		}
		if diagnosis.SelectedRouteID == 0 {
			diagnosis.Candidates[index].Status = ModelRouteDiagnosticStatusSelected
			diagnosis.SelectedRouteID = diagnosis.Candidates[index].RouteBindingID
			selected := diagnosis.Candidates[index]
			diagnosis.SelectedRoute = &selected
			continue
		}
		diagnosis.Candidates[index].Status = ModelRouteDiagnosticStatusAccepted
	}
	return diagnosis, nil
}

func (s *AIService) diagnosticCatalogEntries(ctx context.Context, req ModelRouteRequest) ([]persistencemodel.AIModelCatalogEntry, error) {
	if req.RouteBindingID != 0 {
		var binding persistencemodel.AIModelRouteBinding
		if err := s.db.WithContext(ctx).
			Preload("CatalogEntry").
			Where("id = ? AND deleted_at IS NULL", req.RouteBindingID).
			First(&binding).Error; err != nil {
			return nil, err
		}
		if binding.CatalogEntry == nil || binding.CatalogEntry.ID == 0 {
			return nil, fmt.Errorf("route binding id=%d has no catalog entry", req.RouteBindingID)
		}
		entry := *binding.CatalogEntry
		entry.RouteBindings = []persistencemodel.AIModelRouteBinding{binding}
		return []persistencemodel.AIModelCatalogEntry{entry}, nil
	}
	query := s.db.WithContext(ctx).
		Preload("RouteBindings", "deleted_at IS NULL").
		Where("deleted_at IS NULL")
	modelID := strings.TrimSpace(req.ModelID)
	if modelID != "" {
		query = query.Where("public_model_id = ?", modelID)
	} else if req.CatalogEntryID != 0 {
		query = query.Where("id = ?", req.CatalogEntryID)
	} else {
		return nil, fmt.Errorf("model_id is required")
	}
	var entries []persistencemodel.AIModelCatalogEntry
	if err := query.Order("public_model_id ASC").Find(&entries).Error; err != nil {
		return nil, err
	}
	return entries, nil
}

func diagnosticCatalogEntryReasons(entry persistencemodel.AIModelCatalogEntry, req ModelRouteRequest, capability string) []string {
	reasons := make([]string, 0, 2)
	if !entry.IsEnabled {
		reasons = append(reasons, "catalog_entry_disabled")
	}
	def := catalogEntryDef(entry)
	if isStructuredCapabilityFamily(capability) {
		if ok, reason := capabilityJSONSupportsIntent(entry.ModelCapabilitiesJSON, capability, req.Operation, req.ReferenceAssets); !ok {
			reasons = append(reasons, "missing_model_capability:"+reason)
		}
		return reasons
	}
	if !modelHasCapability(def, capability) {
		reasons = append(reasons, "missing_model_capability:"+capability)
	}
	return reasons
}

func (s *AIService) diagnosticRouteCandidate(
	entry persistencemodel.AIModelCatalogEntry,
	binding persistencemodel.AIModelRouteBinding,
	credentials map[uint]persistencemodel.AICredential,
	req ModelRouteRequest,
	capability string,
	apiKinds []string,
	entryReasons []string,
) ModelRouteDiagnosticCandidate {
	reasons := append([]string(nil), entryReasons...)
	if !binding.IsEnabled {
		reasons = append(reasons, "route_disabled")
	}
	if routeGroup := strings.TrimSpace(req.RouteGroup); routeGroup != "" && strings.TrimSpace(binding.RouteGroup) != routeGroup {
		reasons = append(reasons, "route_group_mismatch:"+routeGroup)
	}
	supportedAPIKinds := catalogRouteBindingSupportedAPIKinds(&binding, credentials)
	if len(apiKinds) > 0 && !catalogRouteBindingMatchesAPIKinds(binding, apiKinds, credentials) {
		reasons = append(reasons, "api_kind_mismatch:"+strings.Join(apiKinds, ","))
	}
	if ok, reason := catalogRouteBindingMatchesStructuredIntent(binding, req, capability); !ok {
		reasons = append(reasons, "missing_route_capability:"+reason)
	}
	adapterType := strings.TrimSpace(binding.AdapterType)
	if adapterType == "" && binding.CredentialID != nil {
		if credential, ok := credentials[*binding.CredentialID]; ok {
			adapterType = strings.TrimSpace(credential.AdapterType)
		}
	}
	candidate := ModelRouteDiagnosticCandidate{
		CatalogEntryID:  entry.ID,
		PublicModelID:   strings.TrimSpace(entry.PublicModelID),
		RouteBindingID:  binding.ID,
		Status:          ModelRouteDiagnosticStatusRejected,
		Reasons:         compactDiagnosticReasons(reasons),
		SourceType:      strings.TrimSpace(binding.SourceType),
		RouteGroup:      strings.TrimSpace(binding.RouteGroup),
		ProviderID:      catalogRouteProviderID(&binding),
		AdapterType:     adapterType,
		ProviderModelID: catalogRouteProviderModelID(entry, &binding),
		APIKinds:        supportedAPIKinds,
		Priority:        binding.Priority,
		CapacityWeight:  runtimeCandidateCapacityWeight(runtimeModelCandidate{capacityWeight: binding.CapacityWeight}),
		MaxConcurrency:  binding.MaxConcurrency,
	}
	if endpoint := diagnosticRouteEndpoint(binding, credentials); endpoint != nil {
		candidate.EffectiveEndpoint = endpoint
	}
	if resourceAccess := diagnosticRouteResourceAccess(binding.RouteCapabilitiesJSON, capability); resourceAccess != nil {
		candidate.ResourceAccess = resourceAccess
	}
	if len(candidate.Reasons) == 0 {
		candidate.Status = ModelRouteDiagnosticStatusAccepted
	}
	return candidate
}

func diagnosticRouteResourceAccess(routeCapabilitiesJSON string, capability string) *ModelRouteResourceAccess {
	requirements := RouteCapabilityPublicURLRequirements(routeCapabilitiesJSON, capability)
	var inputMedia []string
	if requirements.Image {
		inputMedia = append(inputMedia, "image")
	}
	if requirements.Video {
		inputMedia = append(inputMedia, "video")
	}
	if requirements.Audio {
		inputMedia = append(inputMedia, "audio")
	}
	if len(inputMedia) == 0 {
		return nil
	}
	return &ModelRouteResourceAccess{
		Required:   true,
		Transport:  "public_url",
		InputMedia: inputMedia,
		DependsOn:  "ResourceAccessProfile",
	}
}

func diagnosticRouteEndpoint(binding persistencemodel.AIModelRouteBinding, credentials map[uint]persistencemodel.AICredential) *ModelRouteDiagnosticEndpoint {
	config := routeEndpointConfigFromBinding(binding)
	baseURL := ""
	if binding.CredentialID != nil {
		if credential, ok := credentials[*binding.CredentialID]; ok {
			baseURL = strings.TrimSpace(credential.BaseURL)
		}
	}
	endpoint := ModelRouteDiagnosticEndpoint{
		BaseURL:          strings.TrimSpace(config.BaseURL),
		PathPrefix:       normalizeRouteEndpointPathPrefix(config.PathPrefix),
		Mode:             normalizeRouteEndpointMode(config.Mode),
		OperationProfile: strings.TrimSpace(config.OperationProfile),
		EffectiveBaseURL: effectiveRouteBaseURL(baseURL, config),
	}
	if endpoint.BaseURL == "" && endpoint.PathPrefix == "" && endpoint.OperationProfile == "" && endpoint.EffectiveBaseURL == "" {
		return nil
	}
	return &endpoint
}

func compactDiagnosticReasons(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
