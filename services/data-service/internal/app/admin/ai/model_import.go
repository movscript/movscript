package ai

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
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
	Provider   Provider                 `json:"provider"`
	RouteGroup string                   `json:"route_group"`
	Items      []ModelImportApplyItem   `json:"items"`
	Summary    ModelImportResultSummary `json:"summary"`
}

type ModelImportModelPlan struct {
	ProviderModelID string   `json:"provider_model_id"`
	PublicModelID   string   `json:"public_model_id"`
	DisplayName     string   `json:"display_name"`
	Capabilities    []string `json:"capabilities"`
	TemplateID      string   `json:"template_id,omitempty"`
	TemplateVersion string   `json:"template_version,omitempty"`
	TemplateStatus  string   `json:"template_source_status,omitempty"`
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
	for i := range plans {
		applyModelImportProviderBoundary(&plans[i], modelImportProviderCategoryForKind(providerInput.ProviderKind))
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
		result.Provider = providerFromModel(provider)

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
	return s.createProviderModel(ctx, CreateProviderInput{
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
	if skip, diagnostic := modelImportPlanSkipsRouteForProvider(plan, provider); skip {
		item.SkippedRouteBinding = true
		item.Recommended = false
		if createdEntry {
			item.Status = modelImportStatusNew
		} else {
			item.Status = modelImportStatusCatalogExists
		}
		item.Diagnostics = append(item.Diagnostics, diagnostic)
		return item, nil
	}

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

func modelImportPlanSkipsRoute(plan ModelImportModelPlan) bool {
	return strings.TrimSpace(plan.TemplateID) != "" && strings.TrimSpace(plan.TemplateStatus) == "template_only"
}

func modelImportPlanSkipsRouteForProvider(plan ModelImportModelPlan, provider persistencemodel.AIProvider) (bool, string) {
	if modelImportPlanSkipsRoute(plan) {
		return true, "Route binding was skipped because the matched template is not runtime-ready."
	}
	if modelImportPlanRequiresLocalProvider(plan) && strings.TrimSpace(provider.ProviderCategory) != persistencemodel.AIProviderCategoryLocalEndpoint {
		return true, "Route binding was skipped because this model uses a local runtime adapter and must be bound to a local endpoint provider."
	}
	return false, ""
}

func applyModelImportProviderBoundary(plan *ModelImportModelPlan, providerCategory string) {
	if plan == nil || !plan.Recommended {
		return
	}
	if modelImportPlanRequiresLocalProvider(*plan) && strings.TrimSpace(providerCategory) != persistencemodel.AIProviderCategoryLocalEndpoint {
		plan.Recommended = false
		plan.Diagnostics = append(plan.Diagnostics, "Matched a local runtime template; bind it through the local audio runtime provider instead of a remote gateway.")
	}
}

func modelImportPlanRequiresLocalProvider(plan ModelImportModelPlan) bool {
	return strings.TrimSpace(plan.TemplateID) != "" && strings.TrimSpace(plan.AdapterType) == infraai.AdapterLocal
}

func modelImportProviderCategoryForKind(providerKind string) string {
	if template, ok := providerTemplateByKind(providerKind); ok {
		return strings.TrimSpace(template.ProviderCategory)
	}
	return ""
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
		binding, err = s.createModelRouteBindingModel(ctx, strconv.FormatUint(uint64(entryID), 10), ModelRouteBindingInput{
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
			plan.Recommended = !modelImportPlanSkipsRoute(*plan)
			return nil
		}
		return err
	}
	plan.Status = modelImportStatusCatalogExists
	plan.CatalogEntryID = entry.ID
	plan.Recommended = !modelImportPlanSkipsRoute(*plan)
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
	input.BaseURLPrefix = strings.TrimRight(strings.TrimSpace(input.BaseURLPrefix), "/")
	input.ProviderKind = inferModelImportGatewayProviderKind(input.ProviderKind, input.BaseURLPrefix)
	if input.DisplayName == "" {
		if template, ok := providerTemplateByKind(input.ProviderKind); ok && strings.TrimSpace(template.DisplayName) != "" {
			input.DisplayName = strings.TrimSpace(template.DisplayName)
		} else {
			input.DisplayName = "中转站"
		}
	}
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

func inferModelImportGatewayProviderKind(providerKind string, baseURLPrefix string) string {
	providerKind = strings.TrimSpace(providerKind)
	baseURLPrefix = strings.TrimSpace(baseURLPrefix)
	if providerKind != "" && providerKind != persistencemodel.AIProviderKindOpenAICompatGateway {
		return providerKind
	}
	if baseURLPrefix == "" {
		return providerKind
	}
	parsed, err := url.Parse(baseURLPrefix)
	if err != nil {
		return providerKind
	}
	host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
	switch {
	case host == "api.apiyi.com" || host == "apiyi.com" || strings.HasSuffix(host, ".apiyi.com"):
		return "apiyi_gateway"
	default:
		return providerKind
	}
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
	if template, ok := modelImportTemplateForProviderModelID(providerModelID); ok {
		return modelImportPlanFromTemplate(providerModelID, template)
	}
	if capabilities := inferModelImportCapabilities(providerModelID); len(capabilities) > 0 {
		plan := ModelImportModelPlan{
			ProviderModelID: providerModelID,
			PublicModelID:   providerModelID,
			DisplayName:     providerModelID,
			Capabilities:    capabilities,
			AdapterType:     infraai.AdapterOpenAICompat,
			Status:          modelImportStatusNew,
			Recommended:     true,
		}
		if capabilitiesEqual(capabilities, []string{infraai.CapabilityText}) {
			plan.Diagnostics = []string{"No built-in model template matched; imported as a generic text model."}
		} else {
			plan.Diagnostics = []string{"No built-in model template matched; capabilities were inferred from the provider model id. Review before applying."}
		}
		return plan
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

func modelImportTemplateForProviderModelID(providerModelID string) (infraai.CatalogTemplate, bool) {
	exactCandidate := normalizeModelImportTemplateID(providerModelID)
	for _, template := range infraai.CatalogTemplates() {
		for _, value := range []string{
			template.ModelID,
			template.DefaultPublicModelID,
			template.ID,
		} {
			if normalizeModelImportTemplateID(value) == exactCandidate {
				return template, true
			}
		}
	}
	candidates := modelImportTemplateMatchCandidates(providerModelID)
	for _, template := range infraai.CatalogTemplates() {
		for _, value := range []string{
			template.ModelID,
			template.DefaultPublicModelID,
			template.ID,
		} {
			if candidates[normalizeModelImportTemplateID(value)] {
				return template, true
			}
		}
	}
	return infraai.CatalogTemplate{}, false
}

func modelImportRuntimeReadyTemplateForProviderModelID(providerModelID string) (infraai.CatalogTemplate, bool) {
	template, ok := modelImportTemplateForProviderModelID(providerModelID)
	if !ok || !modelImportTemplateIsRuntimeReady(template) {
		return infraai.CatalogTemplate{}, false
	}
	return template, true
}

func modelImportTemplateIsRuntimeReady(template infraai.CatalogTemplate) bool {
	return strings.TrimSpace(template.SourceStatus) != "template_only"
}

func modelImportTemplateMatchCandidates(providerModelID string) map[string]bool {
	raw := strings.TrimSpace(providerModelID)
	candidates := map[string]bool{}
	add := func(value string) {
		value = normalizeModelImportTemplateID(value)
		if value != "" {
			candidates[value] = true
		}
	}
	add(raw)
	base := normalizeModelImportTemplateID(raw)
	for {
		next := stripModelImportVariantSuffix(base)
		if next == "" || next == base {
			break
		}
		add(next)
		base = next
	}
	return candidates
}

var modelImportDateSuffixPattern = regexp.MustCompile(`-(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{8})$`)
var modelImportCompactDateSuffixPattern = regexp.MustCompile(`-(20\d{2})(0[1-9]|1[0-2])([0-3]\d)$`)
var modelImportShortDateSuffixPattern = regexp.MustCompile(`-\d{6}$`)

func stripModelImportVariantSuffix(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, suffix := range []string{
		"-chat-latest",
		"-latest",
		"-thinking",
		"-nothinking",
		"-customtools",
		"-high",
		"-medium",
		"-low",
		"-xhigh",
		"-all",
		"-vip",
		"-pro",
		"-fast",
		"-instant",
		"-4k",
		"-2k",
		"-1k",
	} {
		if strings.HasSuffix(value, suffix) && len(value) > len(suffix) {
			return strings.TrimSuffix(value, suffix)
		}
	}
	if next := modelImportDateSuffixPattern.ReplaceAllString(value, ""); next != value {
		return next
	}
	if next := modelImportCompactDateSuffixPattern.ReplaceAllString(value, ""); next != value {
		return next
	}
	if next := modelImportShortDateSuffixPattern.ReplaceAllString(value, ""); next != value {
		return next
	}
	return value
}

func normalizeModelImportTemplateID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "models/")
	value = strings.ReplaceAll(value, "_", "-")
	return value
}

func inferModelImportCapabilities(providerModelID string) []string {
	id := normalizeModelImportTemplateID(providerModelID)
	switch {
	case id == "":
		return []string{infraai.CapabilityText}
	case strings.Contains(id, "transcribe") || strings.Contains(id, "whisper") ||
		strings.Contains(id, "-asr") || strings.HasSuffix(id, "asr") ||
		strings.Contains(id, "-stt") || strings.Contains(id, "speech-to-text") ||
		strings.Contains(id, "chirp"):
		return []string{infraai.CapabilityAudioSTT}
	case strings.Contains(id, "tts") || strings.Contains(id, "text-to-speech") ||
		strings.Contains(id, "cosyvoice") || strings.HasPrefix(id, "speech-"):
		return []string{infraai.CapabilityAudioTTS}
	case strings.Contains(id, "audio-preview") || strings.Contains(id, "omni") || strings.Contains(id, "mimo"):
		return []string{infraai.CapabilityAudioChat}
	case strings.Contains(id, "lyria") || strings.Contains(id, "music") ||
		strings.Contains(id, "mureka") || strings.Contains(id, "suno") || strings.Contains(id, "udio"):
		return []string{infraai.CapabilityAudioMusic}
	case strings.Contains(id, "sound-effect") || strings.Contains(id, "sound-effects") ||
		strings.Contains(id, "-sfx") || strings.Contains(id, "text-to-sound"):
		return []string{infraai.CapabilityAudioSFX}
	case strings.Contains(id, "voice-clone") || strings.Contains(id, "voiceclone"):
		return []string{infraai.CapabilityVoiceClone}
	case strings.Contains(id, "voice-design") || strings.Contains(id, "voice-designing"):
		return []string{infraai.CapabilityVoiceDesign}
	case strings.Contains(id, "seedance") || strings.HasPrefix(id, "veo-") ||
		strings.Contains(id, "-video") || strings.Contains(id, "hailuo"):
		return []string{infraai.CapabilityVideo}
	case strings.Contains(id, "gpt-image") || strings.Contains(id, "chatgpt-image") ||
		strings.Contains(id, "imagen") || strings.Contains(id, "seedream") ||
		strings.Contains(id, "qwen-image") || strings.Contains(id, "-image"):
		if strings.Contains(id, "gpt-image") || strings.Contains(id, "chatgpt-image") || strings.Contains(id, "gemini") {
			return []string{infraai.CapabilityImage, infraai.CapabilityImageEdit}
		}
		return []string{infraai.CapabilityImage}
	default:
		if modelImportLooksReasoningCapable(id) {
			return []string{infraai.CapabilityText, infraai.CapabilityReasoning}
		}
		return []string{infraai.CapabilityText}
	}
}

func modelImportLooksReasoningCapable(id string) bool {
	return strings.Contains(id, "reasoner") ||
		strings.Contains(id, "thinking") ||
		strings.Contains(id, "deepseek-r1") ||
		strings.Contains(id, "qwq") ||
		strings.Contains(id, "qvq") ||
		strings.HasPrefix(id, "o1") ||
		strings.HasPrefix(id, "o3") ||
		strings.HasPrefix(id, "o4") ||
		strings.HasPrefix(id, "gpt-5") ||
		strings.HasPrefix(id, "glm-5") ||
		strings.HasPrefix(id, "glm-4.5") ||
		strings.Contains(id, "qwen3")
}

func capabilitiesEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func modelImportPlanFromTemplate(providerModelID string, template infraai.CatalogTemplate) ModelImportModelPlan {
	plan := ModelImportModelPlan{
		ProviderModelID: providerModelID,
		PublicModelID:   firstNonEmpty(template.DefaultPublicModelID, providerModelID),
		DisplayName:     firstNonEmpty(template.DisplayName, template.DefaultPublicModelID, providerModelID),
		Capabilities:    append([]string(nil), template.Capabilities...),
		TemplateID:      template.ID,
		TemplateVersion: modelCatalogTemplateVersion(template),
		TemplateStatus:  template.SourceStatus,
		AdapterType:     template.AdapterType,
		Status:          modelImportStatusNew,
		Recommended:     true,
	}
	if !modelImportTemplateIsRuntimeReady(template) {
		plan.Recommended = false
		plan.Diagnostics = []string{"Matched a built-in discovery template, but its runtime adapter is not implemented yet. Keep it unselected unless you are binding a custom provider route intentionally."}
	}
	return plan
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
