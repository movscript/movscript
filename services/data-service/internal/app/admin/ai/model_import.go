package ai

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type ModelImportProviderInput struct {
	ProviderID    string            `json:"provider_id"`
	ProviderKind  string            `json:"provider_kind"`
	DisplayName   string            `json:"display_name"`
	BaseURLPrefix string            `json:"base_url_prefix"`
	APIKey        string            `json:"api_key"`
	Credentials   map[string]string `json:"credentials"`
}

type ModelImportPreviewInput struct {
	Provider   ModelImportProviderInput `json:"provider"`
	RouteGroup string                   `json:"route_group"`
}

type ModelImportApplyInput struct {
	Provider           ModelImportProviderInput `json:"provider"`
	RouteGroup         string                   `json:"route_group"`
	Models             []ModelImportModelInput  `json:"models"`
	RequireTestSuccess bool                     `json:"require_test_success"`
	IsEnabled          *bool                    `json:"is_enabled"`
}

type ModelImportModelInput struct {
	ProviderModelID string   `json:"provider_model_id"`
	PublicModelID   string   `json:"public_model_id"`
	DisplayName     string   `json:"display_name"`
	Capabilities    []string `json:"capabilities"`
	TemplateID      string   `json:"template_id"`
}

type ModelImportPreviewResult struct {
	ProviderKind string                   `json:"provider_kind"`
	DisplayName  string                   `json:"display_name"`
	BaseURL      string                   `json:"base_url"`
	RouteGroup   string                   `json:"route_group"`
	Models       []ModelImportModelPlan   `json:"models"`
	Summary      ModelImportResultSummary `json:"summary"`
}

type ModelImportApplyResult struct {
	Provider   persistencemodel.AIProvider `json:"provider"`
	RouteGroup string                      `json:"route_group"`
	Items      []ModelImportApplyItem      `json:"items"`
	Summary    ModelImportResultSummary    `json:"summary"`
}

type ModelImportModelPlan struct {
	ProviderModelID string   `json:"provider_model_id"`
	PublicModelID   string   `json:"public_model_id"`
	DisplayName     string   `json:"display_name"`
	Capabilities    []string `json:"capabilities"`
	TemplateID      string   `json:"template_id,omitempty"`
	TemplateVersion string   `json:"template_version,omitempty"`
	AdapterType     string   `json:"adapter_type"`
	Status          string   `json:"status"`
	CatalogEntryID  uint     `json:"catalog_entry_id,omitempty"`
	ExistingRouteID uint     `json:"existing_route_id,omitempty"`
	Recommended     bool     `json:"recommended"`
	Diagnostics     []string `json:"diagnostics,omitempty"`
}

type ModelImportApplyItem struct {
	ModelImportModelPlan
	RouteBindingID      uint `json:"route_binding_id,omitempty"`
	CreatedCatalogEntry bool `json:"created_catalog_entry"`
	CreatedRouteBinding bool `json:"created_route_binding"`
	ReusedCatalogEntry  bool `json:"reused_catalog_entry"`
	SkippedRouteBinding bool `json:"skipped_route_binding"`
}

type ModelImportResultSummary struct {
	Total                 int `json:"total"`
	Recommended           int `json:"recommended"`
	CreatedCatalogEntries int `json:"created_catalog_entries"`
	ReusedCatalogEntries  int `json:"reused_catalog_entries"`
	CreatedRouteBindings  int `json:"created_route_bindings"`
	SkippedRouteBindings  int `json:"skipped_route_bindings"`
}

const (
	modelImportStatusNew           = "new"
	modelImportStatusCatalogExists = "catalog_exists"
	modelImportStatusRouteExists   = "route_exists"
)

func (s *Service) PreviewModelImport(ctx context.Context, input ModelImportPreviewInput) (ModelImportPreviewResult, error) {
	providerInput := normalizeModelImportProviderInput(input.Provider)
	ids, err := fetchOpenAICompatModelIDs(ctx, providerInput)
	if err != nil {
		return ModelImportPreviewResult{}, err
	}
	plans, err := s.modelImportPlans(ctx, ids, providerInput.ProviderID, normalizeModelImportRouteGroup(input.RouteGroup))
	if err != nil {
		return ModelImportPreviewResult{}, err
	}
	return ModelImportPreviewResult{
		ProviderKind: providerInput.ProviderKind,
		DisplayName:  providerInput.DisplayName,
		BaseURL:      providerInput.BaseURLPrefix,
		RouteGroup:   normalizeModelImportRouteGroup(input.RouteGroup),
		Models:       plans,
		Summary:      summarizeModelImportPlans(plans),
	}, nil
}

func (s *Service) ApplyModelImport(ctx context.Context, input ModelImportApplyInput) (ModelImportApplyResult, error) {
	providerInput := normalizeModelImportProviderInput(input.Provider)
	if len(input.Models) == 0 {
		return ModelImportApplyResult{}, fmt.Errorf("%w: at least one model is required", ErrInvalidModelCatalog)
	}
	routeGroup := normalizeModelImportRouteGroup(input.RouteGroup)
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	result := ModelImportApplyResult{RouteGroup: routeGroup}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		scoped := *s
		scoped.db = tx
		scoped.repo = newRepository(tx)

		provider, err := scoped.resolveOrCreateModelImportProvider(ctx, providerInput, input.RequireTestSuccess)
		if err != nil {
			return err
		}
		result.Provider = provider

		for _, item := range input.Models {
			applied, err := scoped.applyModelImportItem(ctx, provider, routeGroup, enabled, item)
			if err != nil {
				return err
			}
			result.Items = append(result.Items, applied)
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	result.Summary = summarizeModelImportApplyItems(result.Items)
	return result, nil
}

func (s *Service) resolveOrCreateModelImportProvider(ctx context.Context, input ModelImportProviderInput, requireTestSuccess bool) (persistencemodel.AIProvider, error) {
	if strings.TrimSpace(input.ProviderID) != "" {
		provider, err := s.getProviderByProviderID(ctx, input.ProviderID)
		if err != nil {
			return provider, err
		}
		if !provider.IsEnabled {
			return provider, fmt.Errorf("%w: provider %q is disabled", ErrInvalidProviderConfig, provider.ProviderID)
		}
		return provider, nil
	}
	return s.CreateProvider(ctx, CreateProviderInput{
		ProviderKind:       input.ProviderKind,
		DisplayName:        input.DisplayName,
		BaseURLPrefix:      input.BaseURLPrefix,
		Credentials:        input.Credentials,
		RequireTestSuccess: requireTestSuccess,
	})
}

func (s *Service) applyModelImportItem(ctx context.Context, provider persistencemodel.AIProvider, routeGroup string, enabled bool, input ModelImportModelInput) (ModelImportApplyItem, error) {
	model := normalizeModelImportModelInput(input)
	if model.ProviderModelID == "" {
		return ModelImportApplyItem{}, fmt.Errorf("%w: provider_model_id is required", ErrInvalidModelCatalog)
	}
	if model.PublicModelID == "" {
		model.PublicModelID = model.ProviderModelID
	}
	plan := modelImportPlanForModel(model.ProviderModelID)
	plan.PublicModelID = model.PublicModelID
	if model.DisplayName != "" {
		plan.DisplayName = model.DisplayName
	}
	if len(model.Capabilities) > 0 {
		plan.Capabilities = model.Capabilities
		plan.TemplateID = ""
		plan.TemplateVersion = ""
	}
	if model.TemplateID != "" {
		if template, ok := catalogTemplateByID(model.TemplateID); ok {
			plan = modelImportPlanFromTemplate(model.ProviderModelID, template)
			plan.PublicModelID = firstNonEmpty(model.PublicModelID, plan.PublicModelID)
			if model.DisplayName != "" {
				plan.DisplayName = model.DisplayName
			}
		}
	}

	item := ModelImportApplyItem{ModelImportModelPlan: plan}
	entry, createdEntry, err := s.findOrCreateImportedCatalogEntry(ctx, plan)
	if err != nil {
		return item, err
	}
	item.CatalogEntryID = entry.ID
	item.CreatedCatalogEntry = createdEntry
	item.ReusedCatalogEntry = !createdEntry

	binding, createdBinding, err := s.findOrCreateImportedRouteBinding(ctx, entry.ID, provider, routeGroup, model.ProviderModelID, plan, enabled)
	if err != nil {
		return item, err
	}
	item.RouteBindingID = binding.ID
	item.ExistingRouteID = binding.ID
	item.CreatedRouteBinding = createdBinding
	item.SkippedRouteBinding = !createdBinding
	if !createdBinding {
		item.Status = modelImportStatusRouteExists
	} else if createdEntry {
		item.Status = modelImportStatusNew
	} else {
		item.Status = modelImportStatusCatalogExists
	}
	return item, nil
}

func (s *Service) findOrCreateImportedCatalogEntry(ctx context.Context, plan ModelImportModelPlan) (persistencemodel.AIModelCatalogEntry, bool, error) {
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).Where("public_model_id = ?", plan.PublicModelID).First(&entry).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return entry, false, err
		}
		entry = persistencemodel.AIModelCatalogEntry{
			ModelTemplateKey: strings.TrimSpace(plan.TemplateID),
			TemplateVersion:  strings.TrimSpace(plan.TemplateVersion),
			PublicModelID:    strings.TrimSpace(plan.PublicModelID),
			DisplayName:      firstNonEmpty(plan.DisplayName, plan.PublicModelID),
			ShortName:        strings.TrimSpace(plan.PublicModelID),
			IsEnabled:        true,
			Capabilities:     strings.Join(plan.Capabilities, ","),
			SupportedParams:  modelImportSupportedParams(plan.TemplateID),
		}
		if template, ok := catalogTemplateByID(plan.TemplateID); ok {
			entry.AcceptsImage = template.AcceptsImageInput
			entry.MaxInputImages = template.MaxInputImages
			entry.MaxInputVideos = template.MaxInputVideos
			entry.ImageEditField = template.ImageEditField
		}
		if err := validateModelCatalogEntry(&entry); err != nil {
			return entry, false, err
		}
		if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
			return entry, false, err
		}
		return entry, true, nil
	}
	return entry, false, nil
}

func (s *Service) findOrCreateImportedRouteBinding(ctx context.Context, entryID uint, provider persistencemodel.AIProvider, routeGroup string, providerModelID string, plan ModelImportModelPlan, enabled bool) (persistencemodel.AIModelRouteBinding, bool, error) {
	var binding persistencemodel.AIModelRouteBinding
	if err := s.db.WithContext(ctx).Where(
		"catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ?",
		entryID,
		routeGroup,
		provider.ProviderID,
		providerModelID,
	).First(&binding).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, false, err
		}
		adapterType := strings.TrimSpace(provider.DefaultAdapterType)
		if adapterType == "" {
			adapterType = strings.TrimSpace(provider.AdapterKey)
		}
		if adapterType == "" {
			adapterType = infraai.AdapterOpenAICompat
		}
		binding, err = s.CreateModelRouteBinding(ctx, strconv.FormatUint(uint64(entryID), 10), ModelRouteBindingInput{
			TemplateVersion: modelImportTemplateVersion(plan.TemplateID),
			RouteGroup:      routeGroup,
			ProviderID:      provider.ProviderID,
			AdapterType:     adapterType,
			ProviderModelID: providerModelID,
			IsEnabled:       &enabled,
			Priority:        0,
			CapacityWeight:  1,
		})
		if err != nil {
			return binding, false, err
		}
		return binding, true, nil
	}
	return binding, false, nil
}

func (s *Service) modelImportPlans(ctx context.Context, providerModelIDs []string, providerID string, routeGroup string) ([]ModelImportModelPlan, error) {
	plans := make([]ModelImportModelPlan, 0, len(providerModelIDs))
	for _, id := range providerModelIDs {
		plan := modelImportPlanForModel(id)
		if providerID != "" {
			if err := s.annotateModelImportExistingState(ctx, &plan, providerID, routeGroup); err != nil {
				return nil, err
			}
		} else if err := s.annotateModelImportCatalogState(ctx, &plan); err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	sort.SliceStable(plans, func(i, j int) bool {
		return plans[i].ProviderModelID < plans[j].ProviderModelID
	})
	return plans, nil
}

func (s *Service) annotateModelImportCatalogState(ctx context.Context, plan *ModelImportModelPlan) error {
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).Where("public_model_id = ?", plan.PublicModelID).First(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			plan.Status = modelImportStatusNew
			plan.Recommended = true
			return nil
		}
		return err
	}
	plan.Status = modelImportStatusCatalogExists
	plan.CatalogEntryID = entry.ID
	plan.Recommended = true
	return nil
}

func (s *Service) annotateModelImportExistingState(ctx context.Context, plan *ModelImportModelPlan, providerID string, routeGroup string) error {
	if err := s.annotateModelImportCatalogState(ctx, plan); err != nil {
		return err
	}
	if plan.CatalogEntryID == 0 {
		return nil
	}
	var binding persistencemodel.AIModelRouteBinding
	if err := s.db.WithContext(ctx).Where(
		"catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ?",
		plan.CatalogEntryID,
		routeGroup,
		strings.TrimSpace(providerID),
		plan.ProviderModelID,
	).First(&binding).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	plan.Status = modelImportStatusRouteExists
	plan.ExistingRouteID = binding.ID
	plan.Recommended = false
	return nil
}

func fetchOpenAICompatModelIDs(ctx context.Context, input ModelImportProviderInput) ([]string, error) {
	baseURL := strings.TrimSpace(input.BaseURLPrefix)
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	provider := infraai.NewOpenAIAdapter(baseURL, strings.TrimSpace(input.Credentials["api_key"]))
	ids, err := provider.FetchModels(ctx)
	if err != nil {
		return nil, err
	}
	return normalizeRemoteModelIDs(ids), nil
}

func normalizeRemoteModelIDs(ids []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func normalizeModelImportProviderInput(input ModelImportProviderInput) ModelImportProviderInput {
	input.ProviderID = strings.TrimSpace(input.ProviderID)
	input.ProviderKind = strings.TrimSpace(input.ProviderKind)
	if input.ProviderKind == "" {
		input.ProviderKind = persistencemodel.AIProviderKindOpenAICompatGateway
	}
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	if input.DisplayName == "" {
		input.DisplayName = "OpenAI compatible provider"
	}
	input.BaseURLPrefix = strings.TrimRight(strings.TrimSpace(input.BaseURLPrefix), "/")
	if input.Credentials == nil {
		input.Credentials = map[string]string{}
	}
	if strings.TrimSpace(input.APIKey) != "" {
		input.Credentials["api_key"] = strings.TrimSpace(input.APIKey)
	}
	if input.BaseURLPrefix != "" {
		input.Credentials["base_url"] = input.BaseURLPrefix
	}
	return input
}

func normalizeModelImportModelInput(input ModelImportModelInput) ModelImportModelInput {
	input.ProviderModelID = strings.TrimSpace(input.ProviderModelID)
	input.PublicModelID = strings.TrimSpace(input.PublicModelID)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.TemplateID = strings.TrimSpace(input.TemplateID)
	input.Capabilities = normalizeModelImportCapabilities(input.Capabilities)
	return input
}

func normalizeModelImportCapabilities(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
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

func normalizeModelImportRouteGroup(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "default"
	}
	return value
}

func modelImportPlanForModel(providerModelID string) ModelImportModelPlan {
	providerModelID = strings.TrimSpace(providerModelID)
	for _, template := range infraai.CatalogTemplates() {
		if strings.TrimSpace(template.ModelID) == providerModelID ||
			strings.TrimSpace(template.DefaultPublicModelID) == providerModelID ||
			strings.TrimSpace(template.ID) == providerModelID {
			return modelImportPlanFromTemplate(providerModelID, template)
		}
	}
	return ModelImportModelPlan{
		ProviderModelID: providerModelID,
		PublicModelID:   providerModelID,
		DisplayName:     providerModelID,
		Capabilities:    []string{infraai.CapabilityText},
		AdapterType:     infraai.AdapterOpenAICompat,
		Status:          modelImportStatusNew,
		Recommended:     true,
		Diagnostics:     []string{"No built-in model template matched; imported as a generic text model."},
	}
}

func modelImportPlanFromTemplate(providerModelID string, template infraai.CatalogTemplate) ModelImportModelPlan {
	return ModelImportModelPlan{
		ProviderModelID: providerModelID,
		PublicModelID:   firstNonEmpty(template.DefaultPublicModelID, providerModelID),
		DisplayName:     firstNonEmpty(template.DisplayName, template.DefaultPublicModelID, providerModelID),
		Capabilities:    append([]string(nil), template.Capabilities...),
		TemplateID:      template.ID,
		TemplateVersion: modelCatalogTemplateVersion(template),
		AdapterType:     template.AdapterType,
		Status:          modelImportStatusNew,
		Recommended:     true,
	}
}

func modelImportSupportedParams(templateID string) string {
	if template, ok := catalogTemplateByID(templateID); ok {
		return paramDefsJSON(template.SupportedParams)
	}
	return ""
}

func modelImportTemplateVersion(templateID string) string {
	if templateID == "" {
		return ""
	}
	if template, ok := catalogTemplateByID(templateID); ok {
		return modelCatalogTemplateVersion(template)
	}
	return ""
}

func summarizeModelImportPlans(plans []ModelImportModelPlan) ModelImportResultSummary {
	summary := ModelImportResultSummary{Total: len(plans)}
	for _, plan := range plans {
		if plan.Recommended {
			summary.Recommended++
		}
	}
	return summary
}

func summarizeModelImportApplyItems(items []ModelImportApplyItem) ModelImportResultSummary {
	summary := ModelImportResultSummary{Total: len(items)}
	for _, item := range items {
		if item.Recommended {
			summary.Recommended++
		}
		if item.CreatedCatalogEntry {
			summary.CreatedCatalogEntries++
		}
		if item.ReusedCatalogEntry {
			summary.ReusedCatalogEntries++
		}
		if item.CreatedRouteBinding {
			summary.CreatedRouteBindings++
		}
		if item.SkippedRouteBinding {
			summary.SkippedRouteBindings++
		}
	}
	return summary
}
