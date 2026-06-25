package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type ModelCatalogEntryInput struct {
	ModelTemplateKey string `json:"model_template_key"`
	TemplateVersion  string `json:"template_version"`
	PublicModelID    string `json:"public_model_id"`
	DisplayName      string `json:"display_name"`
	ShortName        string `json:"short_name"`
	IsEnabled        *bool  `json:"is_enabled"`
	Capabilities     string `json:"capabilities"`
	AcceptsImage     bool   `json:"accepts_image"`
	MaxInputImages   int    `json:"max_input_images"`
	MaxInputVideos   int    `json:"max_input_videos"`
	ImageEditField   string `json:"image_edit_field"`
	SupportedParams  string `json:"supported_params"`
	ParamLimitsJSON  string `json:"param_limits_json"`
}

type ModelRouteBindingInput struct {
	ComboTemplateKey string `json:"combo_template_key"`
	TemplateVersion  string `json:"template_version"`
	RouteGroup       string `json:"route_group"`
	ProviderID       string `json:"provider_id"`
	AdapterType      string `json:"adapter_type"`
	ProviderModelID  string `json:"provider_model_id"`
	APIKinds         string `json:"api_kinds"`
	IsEnabled        *bool  `json:"is_enabled"`
	Priority         int    `json:"priority"`
	CapacityWeight   int    `json:"capacity_weight"`
	MaxConcurrency   int    `json:"max_concurrency"`
}

type EnableComboTemplateInput struct {
	ProviderID    string `json:"provider_id"`
	PublicModelID string `json:"public_model_id"`
	RouteGroup    string `json:"route_group"`
	IsEnabled     *bool  `json:"is_enabled"`
}

type EnableComboTemplateResult struct {
	ComboTemplate       infraai.ComboTemplate                `json:"combo_template"`
	Provider            persistencemodel.AIProvider          `json:"provider"`
	CatalogEntry        persistencemodel.AIModelCatalogEntry `json:"catalog_entry"`
	RouteBinding        persistencemodel.AIModelRouteBinding `json:"route_binding"`
	CreatedCatalogEntry bool                                 `json:"created_catalog_entry"`
	CreatedRouteBinding bool                                 `json:"created_route_binding"`
	Diagnostics         []string                             `json:"diagnostics"`
}

func (s *Service) ListModelCatalogTemplates(ctx context.Context, lab string) []infraai.CatalogTemplate {
	_ = ctx
	return infraai.CatalogTemplatesByLab(lab)
}

func (s *Service) ListModelCatalogEntries(ctx context.Context) ([]persistencemodel.AIModelCatalogEntry, error) {
	var entries []persistencemodel.AIModelCatalogEntry
	err := s.db.WithContext(ctx).
		Preload("RouteBindings").
		Order("public_model_id ASC").
		Find(&entries).Error
	for entryIndex := range entries {
		for bindingIndex := range entries[entryIndex].RouteBindings {
			binding := &entries[entryIndex].RouteBindings[bindingIndex]
			if strings.TrimSpace(binding.ProviderID) == "" && binding.CredentialID != nil && *binding.CredentialID != 0 {
				if providerID := s.preferredProviderIDForLegacyCredential(ctx, *binding.CredentialID); providerID != "" {
					binding.ProviderID = providerID
				}
			}
			normalizeModelRouteBindingProviderID(binding)
		}
	}
	return entries, err
}

func (s *Service) CreateModelCatalogEntry(ctx context.Context, input ModelCatalogEntryInput) (persistencemodel.AIModelCatalogEntry, error) {
	entry := modelCatalogEntryFromInput(input)
	if strings.TrimSpace(entry.PublicModelID) == "" {
		return entry, ErrInvalidModelCatalog
	}
	if entry.DisplayName == "" {
		entry.DisplayName = entry.PublicModelID
	}
	if entry.Capabilities == "" {
		entry.Capabilities = infraai.CapabilityText
	}
	if err := validateModelCatalogEntry(&entry); err != nil {
		return entry, err
	}
	if err := s.ensureUniqueModelCatalogEntry(ctx, 0, entry.PublicModelID); err != nil {
		return entry, err
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		return entry, err
	}
	return entry, nil
}

func (s *Service) UpdateModelCatalogEntry(ctx context.Context, id string, input ModelCatalogEntryInput) (persistencemodel.AIModelCatalogEntry, error) {
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, id).Error; err != nil {
		return entry, err
	}
	next := modelCatalogEntryFromInput(input)
	next.ID = entry.ID
	next.CreatedAt = entry.CreatedAt
	if next.PublicModelID == "" {
		next.PublicModelID = entry.PublicModelID
	}
	if next.ModelTemplateKey == "" {
		next.ModelTemplateKey = entry.ModelTemplateKey
	}
	if next.TemplateVersion == "" {
		next.TemplateVersion = entry.TemplateVersion
	}
	if next.ParamLimitsJSON == "" {
		next.ParamLimitsJSON = entry.ParamLimitsJSON
	}
	if next.Capabilities == "" {
		next.Capabilities = entry.Capabilities
	}
	if next.DisplayName == "" {
		next.DisplayName = next.PublicModelID
	}
	if err := validateModelCatalogEntry(&next); err != nil {
		return next, err
	}
	if err := s.ensureUniqueModelCatalogEntry(ctx, next.ID, next.PublicModelID); err != nil {
		return next, err
	}
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return next, err
	}
	return next, nil
}

func (s *Service) DeleteModelCatalogEntry(ctx context.Context, id string) error {
	entryID, err := parseUintID(id)
	if err != nil {
		return ErrNotFound
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var entry persistencemodel.AIModelCatalogEntry
		if err := tx.First(&entry, entryID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if err := tx.Where("catalog_entry_id = ?", entry.ID).Delete(&persistencemodel.AIModelRouteBinding{}).Error; err != nil {
			return err
		}
		return tx.Delete(&entry).Error
	})
}

func (s *Service) CreateModelRouteBinding(ctx context.Context, catalogEntryID string, input ModelRouteBindingInput) (persistencemodel.AIModelRouteBinding, error) {
	entryID, err := parseUintID(catalogEntryID)
	if err != nil {
		return persistencemodel.AIModelRouteBinding{}, err
	}
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, entryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return persistencemodel.AIModelRouteBinding{}, ErrNotFound
		}
		return persistencemodel.AIModelRouteBinding{}, err
	}
	input = normalizeEditionModelRouteBindingInput(input)
	binding := modelRouteBindingFromInput(entryID, input)
	normalizeModelRouteBindingProviderID(&binding)
	if err := s.normalizeModelRouteBindingAdapter(ctx, &binding); err != nil {
		return binding, err
	}
	if err := normalizeModelRouteBindingAPIKinds(&binding); err != nil {
		return binding, err
	}
	if strings.TrimSpace(binding.SourceType) == "" {
		return binding, ErrInvalidModelCatalog
	}
	if err := validateModelRouteBinding(binding); err != nil {
		return binding, err
	}
	if err := s.validateRouteBindingProvider(ctx, binding); err != nil {
		return binding, err
	}
	normalizeModelRouteBindingCapacity(&binding)
	if err := s.ensureUniqueModelRouteBinding(ctx, binding.CatalogEntryID, 0, binding.RouteGroup, binding.ProviderID, binding.ProviderModelID); err != nil {
		return binding, err
	}
	if err := s.db.WithContext(ctx).Create(&binding).Error; err != nil {
		return binding, err
	}
	return binding, nil
}

func (s *Service) UpdateModelRouteBinding(ctx context.Context, id string, input ModelRouteBindingInput) (persistencemodel.AIModelRouteBinding, error) {
	var binding persistencemodel.AIModelRouteBinding
	if err := s.db.WithContext(ctx).First(&binding, id).Error; err != nil {
		return binding, err
	}
	input = normalizeEditionModelRouteBindingInput(input)
	next := modelRouteBindingFromInput(binding.CatalogEntryID, input)
	normalizeModelRouteBindingProviderID(&next)
	if strings.TrimSpace(next.AdapterType) == "" && strings.TrimSpace(next.ProviderID) == strings.TrimSpace(binding.ProviderID) {
		next.AdapterType = binding.AdapterType
	}
	if err := s.normalizeModelRouteBindingAdapter(ctx, &next); err != nil {
		return next, err
	}
	if err := normalizeModelRouteBindingAPIKinds(&next); err != nil {
		return next, err
	}
	next.ID = binding.ID
	next.CreatedAt = binding.CreatedAt
	if next.ComboTemplateKey == "" {
		next.ComboTemplateKey = binding.ComboTemplateKey
	}
	if next.TemplateVersion == "" {
		next.TemplateVersion = binding.TemplateVersion
	}
	if next.SourceType == "" {
		next.SourceType = binding.SourceType
	}
	if err := validateModelRouteBinding(next); err != nil {
		return next, err
	}
	if err := s.validateRouteBindingProvider(ctx, next); err != nil {
		return next, err
	}
	normalizeModelRouteBindingCapacity(&next)
	if err := s.ensureUniqueModelRouteBinding(ctx, next.CatalogEntryID, next.ID, next.RouteGroup, next.ProviderID, next.ProviderModelID); err != nil {
		return next, err
	}
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return next, err
	}
	return next, nil
}

func (s *Service) ensureUniqueModelRouteBinding(ctx context.Context, catalogEntryID uint, excludeBindingID uint, routeGroup string, providerID string, providerModelID string) error {
	q := s.db.WithContext(ctx).Model(&persistencemodel.AIModelRouteBinding{}).
		Where("catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ?", catalogEntryID, strings.TrimSpace(routeGroup), strings.TrimSpace(providerID), strings.TrimSpace(providerModelID))
	if excludeBindingID != 0 {
		q = q.Where("id <> ?", excludeBindingID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: route binding already exists for provider %q, provider_model_id %q, and group %q", ErrInvalidModelCatalog, strings.TrimSpace(providerID), strings.TrimSpace(providerModelID), strings.TrimSpace(routeGroup))
	}
	return nil
}

func (s *Service) ensureUniqueModelCatalogEntry(ctx context.Context, excludeEntryID uint, publicModelID string) error {
	q := s.db.WithContext(ctx).Model(&persistencemodel.AIModelCatalogEntry{}).
		Where("public_model_id = ?", strings.TrimSpace(publicModelID))
	if excludeEntryID != 0 {
		q = q.Where("id <> ?", excludeEntryID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: catalog entry already exists for public model id %q", ErrInvalidModelCatalog, strings.TrimSpace(publicModelID))
	}
	return nil
}

func (s *Service) DeleteModelRouteBinding(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Delete(&persistencemodel.AIModelRouteBinding{}, id).Error
}

func (s *Service) EnableComboTemplate(ctx context.Context, comboTemplateKey string, input EnableComboTemplateInput) (EnableComboTemplateResult, error) {
	combo, ok := comboTemplateByKey(comboTemplateKey)
	if !ok {
		return EnableComboTemplateResult{}, fmt.Errorf("%w: combo template %q not found", ErrInvalidModelCatalog, strings.TrimSpace(comboTemplateKey))
	}
	template, ok := catalogTemplateByID(combo.ModelTemplateKey)
	if !ok {
		return EnableComboTemplateResult{}, fmt.Errorf("%w: model template %q not found", ErrInvalidModelCatalog, combo.ModelTemplateKey)
	}
	publicModelID := strings.TrimSpace(input.PublicModelID)
	if publicModelID == "" {
		publicModelID = combo.DefaultPublicModelID
	}
	if publicModelID == "" {
		publicModelID = template.DefaultPublicModelID
	}
	routeGroup := strings.TrimSpace(input.RouteGroup)
	if routeGroup == "" {
		routeGroup = combo.RouteGroup
	}
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	result := EnableComboTemplateResult{ComboTemplate: combo}
	if err := s.syncProvidersFromLegacyCredentials(ctx); err != nil {
		return result, err
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		scoped := *s
		scoped.db = tx
		provider, err := scoped.resolveProviderForCombo(ctx, combo, input.ProviderID)
		if err != nil {
			return err
		}
		result.Provider = provider

		var entry persistencemodel.AIModelCatalogEntry
		if err := tx.Where("public_model_id = ?", publicModelID).First(&entry).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			entry = persistencemodel.AIModelCatalogEntry{
				ModelTemplateKey: template.ID,
				TemplateVersion:  modelCatalogTemplateVersion(template),
				PublicModelID:    publicModelID,
				DisplayName:      template.DisplayName,
				ShortName:        publicModelID,
				IsEnabled:        true,
				Capabilities:     strings.Join(template.Capabilities, ","),
				AcceptsImage:     template.AcceptsImageInput,
				MaxInputImages:   template.MaxInputImages,
				MaxInputVideos:   template.MaxInputVideos,
				ImageEditField:   template.ImageEditField,
				SupportedParams:  paramDefsJSON(template.SupportedParams),
			}
			if strings.TrimSpace(entry.DisplayName) == "" {
				entry.DisplayName = publicModelID
			}
			if err := validateModelCatalogEntry(&entry); err != nil {
				return err
			}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
			result.CreatedCatalogEntry = true
		}
		if strings.TrimSpace(entry.ModelTemplateKey) == "" || strings.TrimSpace(entry.TemplateVersion) == "" {
			updates := map[string]any{}
			if strings.TrimSpace(entry.ModelTemplateKey) == "" {
				entry.ModelTemplateKey = template.ID
				updates["model_template_key"] = entry.ModelTemplateKey
			}
			if strings.TrimSpace(entry.TemplateVersion) == "" {
				entry.TemplateVersion = modelCatalogTemplateVersion(template)
				updates["template_version"] = entry.TemplateVersion
			}
			if len(updates) > 0 {
				if err := tx.Model(&entry).Updates(updates).Error; err != nil {
					return err
				}
			}
		}
		result.CatalogEntry = entry

		var binding persistencemodel.AIModelRouteBinding
		if err := tx.Where(
			"catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ?",
			entry.ID,
			routeGroup,
			provider.ProviderID,
			combo.ProviderModelID,
		).First(&binding).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			binding, err = scoped.CreateModelRouteBinding(ctx, strconv.FormatUint(uint64(entry.ID), 10), ModelRouteBindingInput{
				ComboTemplateKey: combo.ComboTemplateKey,
				TemplateVersion:  combo.Version,
				RouteGroup:       routeGroup,
				ProviderID:       provider.ProviderID,
				AdapterType:      template.AdapterType,
				ProviderModelID:  combo.ProviderModelID,
				IsEnabled:        &enabled,
				Priority:         combo.Priority,
				CapacityWeight:   combo.CapacityWeight,
			})
			if err != nil {
				return err
			}
			result.CreatedRouteBinding = true
		}
		if strings.TrimSpace(binding.ComboTemplateKey) == "" || strings.TrimSpace(binding.TemplateVersion) == "" {
			updates := map[string]any{}
			if strings.TrimSpace(binding.ComboTemplateKey) == "" {
				binding.ComboTemplateKey = combo.ComboTemplateKey
				updates["combo_template_key"] = binding.ComboTemplateKey
			}
			if strings.TrimSpace(binding.TemplateVersion) == "" {
				binding.TemplateVersion = combo.Version
				updates["template_version"] = binding.TemplateVersion
			}
			if len(updates) > 0 {
				if err := tx.Model(&binding).Updates(updates).Error; err != nil {
					return err
				}
			}
		}
		result.RouteBinding = binding
		return nil
	})
	return result, err
}

func (s *Service) resolveProviderForCombo(ctx context.Context, combo infraai.ComboTemplate, providerID string) (persistencemodel.AIProvider, error) {
	if !s.providerMirrorTablesReady() {
		return persistencemodel.AIProvider{}, fmt.Errorf("%w: provider table is not ready", ErrInvalidModelCatalog)
	}
	providerID = strings.TrimSpace(providerID)
	query := s.db.WithContext(ctx).Where("is_enabled = true")
	if providerID != "" {
		query = query.Where("provider_id = ?", providerID)
	} else if strings.TrimSpace(combo.ProviderType) != "" {
		query = query.Where("provider_type = ? AND profile = ?", strings.TrimSpace(combo.ProviderType), strings.TrimSpace(combo.Profile))
	} else {
		query = query.Where("provider_kind = ?", combo.ProviderKind)
	}
	var provider persistencemodel.AIProvider
	if err := query.Order("provider_kind ASC, display_name ASC, id ASC").First(&provider).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if providerID != "" {
				return provider, fmt.Errorf("%w: provider %q is not found or disabled", ErrInvalidModelCatalog, providerID)
			}
			return provider, fmt.Errorf("%w: no enabled provider for %q", ErrInvalidModelCatalog, comboProviderLabel(combo))
		}
		return provider, err
	}
	if strings.TrimSpace(combo.ProviderType) != "" {
		if strings.TrimSpace(provider.ProviderType) != strings.TrimSpace(combo.ProviderType) || strings.TrimSpace(provider.Profile) != strings.TrimSpace(combo.Profile) {
			return provider, fmt.Errorf("%w: provider %q is %q, want %q", ErrInvalidModelCatalog, provider.ProviderID, providerTypeProfileLabel(provider.ProviderType, provider.Profile), comboProviderLabel(combo))
		}
		return provider, nil
	}
	if strings.TrimSpace(provider.ProviderKind) != strings.TrimSpace(combo.ProviderKind) {
		return provider, fmt.Errorf("%w: provider %q is kind %q, want %q", ErrInvalidModelCatalog, provider.ProviderID, provider.ProviderKind, combo.ProviderKind)
	}
	return provider, nil
}

func comboProviderLabel(combo infraai.ComboTemplate) string {
	if strings.TrimSpace(combo.ProviderType) != "" {
		return providerTypeProfileLabel(combo.ProviderType, combo.Profile)
	}
	return strings.TrimSpace(combo.ProviderKind)
}

func providerTypeProfileLabel(providerType, profile string) string {
	providerType = strings.TrimSpace(providerType)
	profile = strings.TrimSpace(profile)
	if profile == "" {
		return providerType
	}
	return providerType + "/" + profile
}

func comboTemplateByKey(key string) (infraai.ComboTemplate, bool) {
	key = strings.TrimSpace(key)
	for _, template := range infraai.ComboTemplates() {
		if template.ComboTemplateKey == key {
			return template, true
		}
	}
	return infraai.ComboTemplate{}, false
}

func catalogTemplateByID(id string) (infraai.CatalogTemplate, bool) {
	id = strings.TrimSpace(id)
	for _, template := range infraai.CatalogTemplates() {
		if template.ID == id {
			return template, true
		}
	}
	return infraai.CatalogTemplate{}, false
}

func catalogTemplateForCatalogEntry(entry persistencemodel.AIModelCatalogEntry) (infraai.CatalogTemplate, bool) {
	candidates := map[string]bool{}
	for _, value := range []string{
		entry.PublicModelID,
		entry.ShortName,
	} {
		if value = strings.TrimSpace(value); value != "" {
			candidates[value] = true
		}
	}
	if len(candidates) == 0 {
		return infraai.CatalogTemplate{}, false
	}
	for _, template := range infraai.CatalogTemplates() {
		for _, value := range []string{
			template.ID,
			template.ModelID,
			template.DefaultPublicModelID,
		} {
			if candidates[strings.TrimSpace(value)] {
				return template, true
			}
		}
	}
	return infraai.CatalogTemplate{}, false
}

func paramDefsJSON(params []infraai.ParamDef) string {
	if len(params) == 0 {
		return ""
	}
	raw, err := json.Marshal(params)
	if err != nil {
		return ""
	}
	return string(raw)
}

func modelCatalogTemplateVersion(template infraai.CatalogTemplate) string {
	_ = template
	return "builtin.v1"
}

func modelCatalogEntryFromInput(input ModelCatalogEntryInput) persistencemodel.AIModelCatalogEntry {
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	return persistencemodel.AIModelCatalogEntry{
		ModelTemplateKey: strings.TrimSpace(input.ModelTemplateKey),
		TemplateVersion:  strings.TrimSpace(input.TemplateVersion),
		PublicModelID:    strings.TrimSpace(input.PublicModelID),
		DisplayName:      strings.TrimSpace(input.DisplayName),
		ShortName:        strings.TrimSpace(input.ShortName),
		IsEnabled:        enabled,
		Capabilities:     strings.TrimSpace(input.Capabilities),
		AcceptsImage:     input.AcceptsImage,
		MaxInputImages:   input.MaxInputImages,
		MaxInputVideos:   input.MaxInputVideos,
		ImageEditField:   strings.TrimSpace(input.ImageEditField),
		SupportedParams:  strings.TrimSpace(input.SupportedParams),
		ParamLimitsJSON:  strings.TrimSpace(input.ParamLimitsJSON),
	}
}

func validateModelCatalogEntry(entry *persistencemodel.AIModelCatalogEntry) error {
	capabilities, err := normalizeModelCatalogCapabilities(entry.Capabilities)
	if err != nil {
		return err
	}
	entry.Capabilities = capabilities
	if err := validateInputLimit("max_input_images", entry.MaxInputImages); err != nil {
		return err
	}
	if err := validateInputLimit("max_input_videos", entry.MaxInputVideos); err != nil {
		return err
	}
	if err := normalizeModelCatalogEntrySupportedParams(entry); err != nil {
		return err
	}
	if value := strings.TrimSpace(entry.ParamLimitsJSON); value != "" && !json.Valid([]byte(value)) {
		return fmt.Errorf("%w: param_limits_json must be valid JSON", ErrInvalidModelCatalog)
	}
	return nil
}

func normalizeModelCatalogEntrySupportedParams(entry *persistencemodel.AIModelCatalogEntry) error {
	if template, ok := catalogTemplateForCatalogEntry(*entry); ok {
		baseParams := template.SupportedParams
		if len(baseParams) == 0 {
			baseParams = infraai.DefaultParamsForAdapter(template.AdapterType, template.Capabilities)
		}
		if err := infraai.ValidateModelParamConfigWithBaseParams(baseParams, entry.SupportedParams); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
		}
		params, _ := infraai.ResolveEffectiveParamsWithBaseParams(baseParams, entry.SupportedParams)
		entry.SupportedParams = paramDefsJSON(params)
		return nil
	}
	if err := infraai.ValidateModelParamConfigWithBaseParams(nil, entry.SupportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
	}
	return nil
}

func normalizeModelCatalogCapabilities(value string) (string, error) {
	allowed := map[string]bool{
		infraai.CapabilityText:         true,
		infraai.CapabilityReasoning:    true,
		infraai.CapabilityImage:        true,
		infraai.CapabilityImageEdit:    true,
		infraai.CapabilityVideo:        true,
		infraai.CapabilityVideoI2V:     true,
		infraai.CapabilityVideoV2V:     true,
		infraai.CapabilityAudio:        true,
		infraai.CapabilityAudioTTS:     true,
		infraai.CapabilityAudioSTT:     true,
		infraai.CapabilityAudioMusic:   true,
		infraai.CapabilityAudioSFX:     true,
		infraai.CapabilitySubAlign:     true,
		infraai.CapabilitySubTranslate: true,
	}
	seen := make(map[string]bool)
	out := make([]string, 0)
	for _, capability := range infraai.SplitCapabilities(value) {
		if !allowed[capability] {
			return "", fmt.Errorf("%w: capability %q is not supported", ErrInvalidModelCatalog, capability)
		}
		if seen[capability] {
			continue
		}
		seen[capability] = true
		out = append(out, capability)
	}
	if len(out) == 0 {
		out = append(out, infraai.CapabilityText)
	}
	return strings.Join(out, ","), nil
}

func validateModelRouteBinding(binding persistencemodel.AIModelRouteBinding) error {
	if binding.SourceType == persistencemodel.ModelRouteSourceNewAPI && !supportsNewAPIRouteBindings() {
		return fmt.Errorf("%w: new_api route bindings require the commercial edition", ErrInvalidModelCatalog)
	}
	if binding.SourceType == persistencemodel.ModelRouteSourceNewAPI && strings.TrimSpace(binding.RouteGroup) == "" {
		return fmt.Errorf("%w: route_group is required for new_api route bindings", ErrInvalidModelCatalog)
	}
	if strings.TrimSpace(binding.ProviderID) == "" {
		return fmt.Errorf("%w: provider_id is required for route bindings", ErrInvalidModelCatalog)
	}
	if strings.TrimSpace(binding.AdapterType) == "" {
		return fmt.Errorf("%w: adapter_type is required for route bindings", ErrInvalidModelCatalog)
	}
	if strings.TrimSpace(binding.ProviderModelID) == "" {
		return fmt.Errorf("%w: provider_model_id is required for route bindings", ErrInvalidModelCatalog)
	}
	return validateCapacityConfig(binding.CapacityWeight, binding.MaxConcurrency)
}

func (s *Service) validateRouteBindingProvider(ctx context.Context, binding persistencemodel.AIModelRouteBinding) error {
	providerID := strings.TrimSpace(binding.ProviderID)
	if providerID == "" || binding.SourceType == persistencemodel.ModelRouteSourceNewAPI || !s.providerMirrorTablesReady() {
		return nil
	}
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.AIProvider{}).
		Where("provider_id = ? AND deleted_at IS NULL", providerID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("%w: provider_id %q does not exist", ErrInvalidModelCatalog, providerID)
	}
	return nil
}

func normalizeModelRouteBindingCapacity(binding *persistencemodel.AIModelRouteBinding) {
	binding.CapacityWeight = normalizeCapacityWeight(binding.CapacityWeight)
}

func normalizeModelRouteBindingProviderID(binding *persistencemodel.AIModelRouteBinding) {
	binding.SourceType = strings.TrimSpace(binding.SourceType)
	binding.RouteGroup = strings.TrimSpace(binding.RouteGroup)
	binding.ProviderID = strings.TrimSpace(binding.ProviderID)
	binding.AdapterType = strings.TrimSpace(binding.AdapterType)
	binding.ProviderModelID = strings.TrimSpace(binding.ProviderModelID)
	if binding.SourceType == "" {
		binding.SourceType = sourceTypeFromRouteProviderID(binding.ProviderID)
	}
	if binding.ProviderID == "" {
		switch binding.SourceType {
		case persistencemodel.ModelRouteSourceNewAPI:
			binding.ProviderID = persistencemodel.ModelRouteSourceNewAPI
		case persistencemodel.ModelRouteSourceLocalProvider:
			if binding.CredentialID != nil && *binding.CredentialID != 0 {
				binding.ProviderID = fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, *binding.CredentialID)
			}
		}
	}
	if binding.SourceType == persistencemodel.ModelRouteSourceLocalProvider && binding.CredentialID == nil {
		if credentialID, ok := localProviderCredentialIDFromProviderID(binding.ProviderID); ok {
			binding.CredentialID = &credentialID
		}
	}
}

func (s *Service) normalizeModelRouteBindingAdapter(ctx context.Context, binding *persistencemodel.AIModelRouteBinding) error {
	binding.AdapterType = strings.TrimSpace(binding.AdapterType)
	if binding.AdapterType == "" {
		binding.AdapterType = strings.TrimSpace(s.defaultAdapterTypeForRouteBinding(ctx, *binding))
	}
	if binding.AdapterType == "" {
		return fmt.Errorf("%w: adapter_type is required for route bindings", ErrInvalidModelCatalog)
	}
	if infraai.GetAdapterDef(binding.AdapterType) == nil {
		return fmt.Errorf("%w: adapter_type %q is not supported", ErrInvalidModelCatalog, binding.AdapterType)
	}
	return nil
}

func (s *Service) defaultAdapterTypeForRouteBinding(ctx context.Context, binding persistencemodel.AIModelRouteBinding) string {
	providerID := strings.TrimSpace(binding.ProviderID)
	if providerID == persistencemodel.ModelRouteSourceNewAPI || binding.SourceType == persistencemodel.ModelRouteSourceNewAPI {
		return infraai.AdapterOpenAICompat
	}
	if s.providerMirrorTablesReady() && providerID != "" {
		var provider persistencemodel.AIProvider
		if err := s.db.WithContext(ctx).
			Where("provider_id = ? AND deleted_at IS NULL", providerID).
			First(&provider).Error; err == nil {
			if strings.TrimSpace(provider.DefaultAdapterType) != "" {
				return strings.TrimSpace(provider.DefaultAdapterType)
			}
			if strings.TrimSpace(provider.AdapterKey) != "" {
				return strings.TrimSpace(provider.AdapterKey)
			}
		}
	}
	credentialID := uint(0)
	if binding.CredentialID != nil {
		credentialID = *binding.CredentialID
	}
	if credentialID == 0 {
		if parsed, ok := localProviderCredentialIDFromProviderID(providerID); ok {
			credentialID = parsed
		}
	}
	if credentialID != 0 {
		var credential persistencemodel.AICredential
		if err := s.db.WithContext(ctx).
			Where("id = ? AND deleted_at IS NULL", credentialID).
			First(&credential).Error; err == nil {
			return credential.AdapterType
		}
	}
	if binding.SourceType == persistencemodel.ModelRouteSourceLocalProvider {
		return infraai.AdapterOpenAICompat
	}
	return ""
}

func normalizeModelRouteBindingAPIKinds(binding *persistencemodel.AIModelRouteBinding) error {
	raw := strings.TrimSpace(binding.APIKinds)
	if raw == "" {
		binding.APIKinds = ""
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		kind := strings.TrimSpace(part)
		if kind == "" {
			continue
		}
		if !infraai.ValidModelAPIKind(kind) {
			return fmt.Errorf("%w: api_kind %q is not supported", ErrInvalidModelCatalog, kind)
		}
		if seen[kind] {
			continue
		}
		seen[kind] = true
		out = append(out, kind)
	}
	binding.APIKinds = strings.Join(out, ",")
	return nil
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

func sourceTypeFromRouteProviderID(providerID string) string {
	providerID = strings.TrimSpace(providerID)
	switch {
	case providerID == persistencemodel.ModelRouteSourceNewAPI:
		return persistencemodel.ModelRouteSourceNewAPI
	case strings.HasPrefix(providerID, persistencemodel.ModelRouteSourceLocalProvider+":"):
		return persistencemodel.ModelRouteSourceLocalProvider
	case providerID != "":
		return persistencemodel.ModelRouteSourceLocalProvider
	default:
		return ""
	}
}

func parseProviderCredentialID(value string) (uint, bool) {
	parsed, err := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed == 0 {
		return 0, false
	}
	return uint(parsed), true
}

func modelRouteBindingFromInput(catalogEntryID uint, input ModelRouteBindingInput) persistencemodel.AIModelRouteBinding {
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	return persistencemodel.AIModelRouteBinding{
		CatalogEntryID:   catalogEntryID,
		ComboTemplateKey: strings.TrimSpace(input.ComboTemplateKey),
		TemplateVersion:  strings.TrimSpace(input.TemplateVersion),
		RouteGroup:       strings.TrimSpace(input.RouteGroup),
		ProviderID:       strings.TrimSpace(input.ProviderID),
		AdapterType:      strings.TrimSpace(input.AdapterType),
		ProviderModelID:  strings.TrimSpace(input.ProviderModelID),
		APIKinds:         strings.TrimSpace(input.APIKinds),
		IsEnabled:        enabled,
		Priority:         input.Priority,
		CapacityWeight:   input.CapacityWeight,
		MaxConcurrency:   input.MaxConcurrency,
	}
}
