package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type ModelCatalogEntryInput struct {
	ModelTemplateKey      string `json:"model_template_key"`
	TemplateVersion       string `json:"template_version"`
	PublicModelID         string `json:"public_model_id"`
	DisplayName           string `json:"display_name"`
	ShortName             string `json:"short_name"`
	IsEnabled             *bool  `json:"is_enabled"`
	Capabilities          string `json:"capabilities"`
	AcceptsImage          bool   `json:"accepts_image"`
	MaxInputImages        int    `json:"max_input_images"`
	MaxInputVideos        int    `json:"max_input_videos"`
	InputImageField       string `json:"input_image_field"`
	SupportedParams       string `json:"supported_params"`
	ParamLimitsJSON       string `json:"param_limits_json"`
	ModelCapabilitiesJSON string `json:"model_capabilities_json"`
}

type ModelRouteBindingInput struct {
	ComboTemplateKey   string `json:"combo_template_key"`
	TemplateVersion    string `json:"template_version"`
	RouteGroup         string `json:"route_group"`
	ProviderID         string `json:"provider_id"`
	AdapterType        string `json:"adapter_type"`
	ProviderModelID    string `json:"provider_model_id"`
	ProtocolProfile    string `json:"protocol_profile"`
	APIKinds           string `json:"api_kinds"`
	EndpointBaseURL    string `json:"endpoint_base_url"`
	EndpointPathPrefix string `json:"endpoint_path_prefix"`
	EndpointMode       string `json:"endpoint_mode"`
	IsEnabled          *bool  `json:"is_enabled"`
	Priority           int    `json:"priority"`
	CapacityWeight     int    `json:"capacity_weight"`
	MaxConcurrency     int    `json:"max_concurrency"`
}

type EnableComboTemplateInput struct {
	ProviderID    string `json:"provider_id"`
	PublicModelID string `json:"public_model_id"`
	RouteGroup    string `json:"route_group"`
	IsEnabled     *bool  `json:"is_enabled"`
}

type EnableComboTemplateResult struct {
	ComboTemplate       infraai.ComboTemplate `json:"combo_template"`
	Provider            Provider              `json:"provider"`
	CatalogEntry        ModelCatalogEntry     `json:"catalog_entry"`
	RouteBinding        ModelRouteBinding     `json:"route_binding"`
	CreatedCatalogEntry bool                  `json:"created_catalog_entry"`
	CreatedRouteBinding bool                  `json:"created_route_binding"`
	Diagnostics         []string              `json:"diagnostics"`
}

type ModelCatalogTemplate struct {
	ID                    string             `json:"id"`
	Lab                   string             `json:"lab"`
	DefaultPublicModelID  string             `json:"default_public_model_id"`
	ModelID               string             `json:"model_id"`
	DisplayName           string             `json:"display_name"`
	Capabilities          []string           `json:"capabilities"`
	SourceStatus          string             `json:"source_status,omitempty"`
	APIKinds              []string           `json:"api_kinds,omitempty"`
	ModelCapabilitiesJSON string             `json:"model_capabilities_json,omitempty"`
	AcceptsImageInput     bool               `json:"accepts_image_input"`
	MaxInputImages        int                `json:"max_input_images"`
	MaxInputVideos        int                `json:"max_input_videos"`
	InputImageField       string             `json:"input_image_field,omitempty"`
	SupportedParams       []infraai.ParamDef `json:"supported_params,omitempty"`
}

func (s *Service) ListModelCatalogTemplates(ctx context.Context, lab string) []ModelCatalogTemplate {
	_ = ctx
	templates := infraai.CatalogTemplatesByLab(lab)
	out := make([]ModelCatalogTemplate, 0, len(templates))
	for _, template := range templates {
		out = append(out, modelCatalogTemplateFromInfra(template))
	}
	return out
}

func modelCatalogTemplateFromInfra(template infraai.CatalogTemplate) ModelCatalogTemplate {
	return ModelCatalogTemplate{
		ID:                    template.ID,
		Lab:                   template.Lab,
		DefaultPublicModelID:  template.DefaultPublicModelID,
		ModelID:               template.ModelID,
		DisplayName:           template.DisplayName,
		Capabilities:          append([]string(nil), template.Capabilities...),
		SourceStatus:          template.SourceStatus,
		APIKinds:              append([]string(nil), template.APIKinds...),
		ModelCapabilitiesJSON: template.ModelCapabilitiesJSON,
		AcceptsImageInput:     template.AcceptsImageInput,
		MaxInputImages:        template.MaxInputImages,
		MaxInputVideos:        template.MaxInputVideos,
		InputImageField:       template.InputImageField,
		SupportedParams:       append([]infraai.ParamDef(nil), template.SupportedParams...),
	}
}

func (s *Service) ListModelCatalogEntries(ctx context.Context) ([]ModelCatalogEntry, error) {
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
	return modelCatalogEntriesFromModels(entries), err
}

func (s *Service) CreateModelCatalogEntry(ctx context.Context, input ModelCatalogEntryInput) (ModelCatalogEntry, error) {
	entry := modelCatalogEntryFromInput(input)
	if strings.TrimSpace(entry.PublicModelID) == "" {
		return modelCatalogEntryFromModel(entry), ErrInvalidModelCatalog
	}
	applyModelCatalogEntryTemplateDefaults(&entry, "")
	if entry.DisplayName == "" {
		entry.DisplayName = entry.PublicModelID
	}
	if entry.Capabilities == "" {
		entry.Capabilities = infraai.CapabilityFamilyTextGeneration
	}
	if err := validateModelCatalogEntry(&entry); err != nil {
		return modelCatalogEntryFromModel(entry), err
	}
	if err := s.ensureUniqueModelCatalogEntry(ctx, 0, entry.PublicModelID); err != nil {
		return modelCatalogEntryFromModel(entry), err
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		return modelCatalogEntryFromModel(entry), err
	}
	return modelCatalogEntryFromModel(entry), nil
}

func (s *Service) UpdateModelCatalogEntry(ctx context.Context, id string, input ModelCatalogEntryInput) (ModelCatalogEntry, error) {
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, id).Error; err != nil {
		return ModelCatalogEntry{}, err
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
	if next.ModelCapabilitiesJSON == "" {
		next.ModelCapabilitiesJSON = entry.ModelCapabilitiesJSON
	}
	if next.SupportedParams == "" {
		next.SupportedParams = entry.SupportedParams
	}
	if next.Capabilities == "" {
		next.Capabilities = entry.Capabilities
	}
	applyModelCatalogEntryTemplateDefaults(&next, "")
	if next.DisplayName == "" {
		next.DisplayName = next.PublicModelID
	}
	if err := validateModelCatalogEntry(&next); err != nil {
		return modelCatalogEntryFromModel(next), err
	}
	if err := s.ensureUniqueModelCatalogEntry(ctx, next.ID, next.PublicModelID); err != nil {
		return modelCatalogEntryFromModel(next), err
	}
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return modelCatalogEntryFromModel(next), err
	}
	return modelCatalogEntryFromModel(next), nil
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

func (s *Service) CreateModelRouteBinding(ctx context.Context, catalogEntryID string, input ModelRouteBindingInput) (ModelRouteBinding, error) {
	binding, err := s.createModelRouteBindingModel(ctx, catalogEntryID, input)
	return modelRouteBindingFromModel(binding), err
}

func (s *Service) createModelRouteBindingModel(ctx context.Context, catalogEntryID string, input ModelRouteBindingInput) (persistencemodel.AIModelRouteBinding, error) {
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
	input = normalizeDistributionProfileModelRouteBindingInput(input)
	binding := modelRouteBindingFromInput(entryID, input)
	normalizeModelRouteBindingProviderID(&binding)
	if err := s.normalizeModelRouteBindingAdapter(ctx, &binding); err != nil {
		return binding, err
	}
	normalizeModelRouteBindingProtocolProfile(&binding)
	if err := normalizeModelRouteBindingAPIKinds(&binding); err != nil {
		return binding, err
	}
	if strings.TrimSpace(binding.SourceType) == "" {
		return binding, ErrInvalidModelCatalog
	}
	if err := validateModelRouteBinding(binding); err != nil {
		return binding, err
	}
	if err := validateModelRouteBindingCapabilities(entry, binding); err != nil {
		return binding, err
	}
	if err := s.validateRouteBindingProvider(ctx, binding); err != nil {
		return binding, err
	}
	normalizeModelRouteBindingCapacity(&binding)
	if err := s.ensureUniqueModelRouteBinding(ctx, binding.CatalogEntryID, 0, binding.RouteGroup, binding.ProviderID, binding.ProviderModelID, binding.ProtocolProfile); err != nil {
		return binding, err
	}
	if err := s.db.WithContext(ctx).Create(&binding).Error; err != nil {
		return binding, err
	}
	if input.IsEnabled != nil {
		binding.IsEnabled = *input.IsEnabled
		if err := s.db.WithContext(ctx).Model(&binding).Update("is_enabled", binding.IsEnabled).Error; err != nil {
			return binding, err
		}
	}
	return binding, nil
}

func (s *Service) UpdateModelRouteBinding(ctx context.Context, id string, input ModelRouteBindingInput) (ModelRouteBinding, error) {
	var binding persistencemodel.AIModelRouteBinding
	if err := s.db.WithContext(ctx).First(&binding, id).Error; err != nil {
		return ModelRouteBinding{}, err
	}
	input = normalizeDistributionProfileModelRouteBindingInput(input)
	next := modelRouteBindingFromInput(binding.CatalogEntryID, input)
	normalizeModelRouteBindingProviderID(&next)
	if strings.TrimSpace(next.AdapterType) == "" && strings.TrimSpace(next.ProviderID) == strings.TrimSpace(binding.ProviderID) {
		next.AdapterType = binding.AdapterType
	}
	if err := s.normalizeModelRouteBindingAdapter(ctx, &next); err != nil {
		return modelRouteBindingFromModel(next), err
	}
	normalizeModelRouteBindingProtocolProfile(&next)
	if err := normalizeModelRouteBindingAPIKinds(&next); err != nil {
		return modelRouteBindingFromModel(next), err
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
	if next.EndpointMode == "" {
		next.EndpointMode = binding.EndpointMode
	}
	if next.EndpointBaseURL == "" {
		next.EndpointBaseURL = binding.EndpointBaseURL
	}
	if next.EndpointPathPrefix == "" {
		next.EndpointPathPrefix = binding.EndpointPathPrefix
	}
	if err := validateModelRouteBinding(next); err != nil {
		return modelRouteBindingFromModel(next), err
	}
	var entry persistencemodel.AIModelCatalogEntry
	if err := s.db.WithContext(ctx).First(&entry, next.CatalogEntryID).Error; err != nil {
		return modelRouteBindingFromModel(next), err
	}
	if err := validateModelRouteBindingCapabilities(entry, next); err != nil {
		return modelRouteBindingFromModel(next), err
	}
	if err := s.validateRouteBindingProvider(ctx, next); err != nil {
		return modelRouteBindingFromModel(next), err
	}
	normalizeModelRouteBindingCapacity(&next)
	if err := s.ensureUniqueModelRouteBinding(ctx, next.CatalogEntryID, next.ID, next.RouteGroup, next.ProviderID, next.ProviderModelID, next.ProtocolProfile); err != nil {
		return modelRouteBindingFromModel(next), err
	}
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return modelRouteBindingFromModel(next), err
	}
	return modelRouteBindingFromModel(next), nil
}

func (s *Service) ensureUniqueModelRouteBinding(ctx context.Context, catalogEntryID uint, excludeBindingID uint, routeGroup string, providerID string, providerModelID string, protocolProfile string) error {
	q := s.db.WithContext(ctx).Model(&persistencemodel.AIModelRouteBinding{}).
		Where("catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ? AND protocol_profile = ?", catalogEntryID, strings.TrimSpace(routeGroup), strings.TrimSpace(providerID), strings.TrimSpace(providerModelID), strings.TrimSpace(protocolProfile))
	if excludeBindingID != 0 {
		q = q.Where("id <> ?", excludeBindingID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: route binding already exists for provider %q, provider_model_id %q, protocol_profile %q, and group %q", ErrInvalidModelCatalog, strings.TrimSpace(providerID), strings.TrimSpace(providerModelID), strings.TrimSpace(protocolProfile), strings.TrimSpace(routeGroup))
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
		result.Provider = providerFromModel(provider)

		var entry persistencemodel.AIModelCatalogEntry
		if err := tx.Where("public_model_id = ?", publicModelID).First(&entry).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			modelCapabilitiesJSON := strings.TrimSpace(template.ModelCapabilitiesJSON)
			if modelCapabilitiesJSON == "" {
				modelCapabilitiesJSON = legacyModelCapabilitiesAsStructuredJSON(strings.Join(template.Capabilities, ","))
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
				InputImageField:  template.InputImageField,
				SupportedParams: modelOperationParamProfileJSON(
					combo.AdapterType,
					template.Capabilities,
					modelCapabilitiesJSON,
					template.SupportedParams,
				),
				ModelCapabilitiesJSON: modelCapabilitiesJSON,
			}
			if strings.TrimSpace(entry.DisplayName) == "" {
				entry.DisplayName = publicModelID
			}
			if err := validateModelCatalogEntryForAdapter(&entry, combo.AdapterType); err != nil {
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
		result.CatalogEntry = modelCatalogEntryFromModel(entry)

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
			binding, err = scoped.createModelRouteBindingModel(ctx, strconv.FormatUint(uint64(entry.ID), 10), ModelRouteBindingInput{
				ComboTemplateKey: combo.ComboTemplateKey,
				TemplateVersion:  combo.Version,
				RouteGroup:       routeGroup,
				ProviderID:       provider.ProviderID,
				AdapterType:      combo.AdapterType,
				ProviderModelID:  combo.ProviderModelID,
				APIKinds:         strings.Join(infraai.NormalizeModelAPIKinds(combo.APIKinds), ","),
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
		result.RouteBinding = modelRouteBindingFromModel(binding)
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

func applyModelCatalogEntryTemplateDefaults(entry *persistencemodel.AIModelCatalogEntry, adapterType string) {
	if entry == nil {
		return
	}
	template, ok := catalogTemplateForCatalogEntry(*entry)
	if !ok {
		return
	}
	if strings.TrimSpace(entry.ModelTemplateKey) == "" {
		entry.ModelTemplateKey = template.ID
	}
	if strings.TrimSpace(entry.TemplateVersion) == "" {
		entry.TemplateVersion = modelCatalogTemplateVersion(template)
	}
	if strings.TrimSpace(entry.DisplayName) == "" {
		entry.DisplayName = template.DisplayName
	}
	if strings.TrimSpace(entry.Capabilities) == "" {
		entry.Capabilities = strings.Join(template.Capabilities, ",")
	}
	if !entry.AcceptsImage && template.AcceptsImageInput {
		entry.AcceptsImage = true
	}
	if entry.MaxInputImages == 0 {
		entry.MaxInputImages = template.MaxInputImages
	}
	if entry.MaxInputVideos == 0 {
		entry.MaxInputVideos = template.MaxInputVideos
	}
	if strings.TrimSpace(entry.InputImageField) == "" {
		entry.InputImageField = template.InputImageField
	}
	modelCapabilitiesJSON := strings.TrimSpace(entry.ModelCapabilitiesJSON)
	if modelCapabilitiesJSON == "" {
		modelCapabilitiesJSON = strings.TrimSpace(template.ModelCapabilitiesJSON)
		if modelCapabilitiesJSON == "" {
			modelCapabilitiesJSON = legacyModelCapabilitiesAsStructuredJSON(strings.Join(template.Capabilities, ","))
		}
		entry.ModelCapabilitiesJSON = modelCapabilitiesJSON
	}
	if strings.TrimSpace(entry.SupportedParams) == "" {
		resolvedAdapterType := strings.TrimSpace(adapterType)
		if resolvedAdapterType == "" {
			resolvedAdapterType = template.RouteAdapterHint
		}
		entry.SupportedParams = modelOperationParamProfileJSON(
			resolvedAdapterType,
			infraai.SplitCapabilities(entry.Capabilities),
			modelCapabilitiesJSON,
			template.SupportedParams,
		)
	}
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

func modelOperationParamProfileJSON(adapterType string, capabilities []string, modelCapabilitiesJSON string, params []infraai.ParamDef) string {
	params = infraai.NormalizeParamDefsForUI(params)
	if len(params) == 0 {
		return ""
	}
	modelCapabilitiesJSON = strings.TrimSpace(modelCapabilitiesJSON)
	if modelCapabilitiesJSON == "" {
		modelCapabilitiesJSON = legacyModelCapabilitiesAsStructuredJSON(strings.Join(capabilities, ","))
	}
	operationsByCapability, err := parseRouteCapabilityOperations(modelCapabilitiesJSON)
	if err != nil || len(operationsByCapability) == 0 {
		return ""
	}
	templateParams := make(map[string]infraai.ParamDef, len(params))
	for _, param := range params {
		key := strings.TrimSpace(param.Key)
		if key == "" {
			continue
		}
		templateParams[key] = param
	}
	profile := infraai.ModelOperationParamProfile{
		Version:     2,
		ByOperation: map[string]infraai.ModelParamProfile{},
	}
	for capability, operations := range operationsByCapability {
		for operation := range operations {
			operation = strings.TrimSpace(operation)
			if operation == "" {
				continue
			}
			baseParams := infraai.DefaultParamsForAdapterOperation(adapterType, capability, operation)
			allow := make([]string, 0, len(baseParams))
			overrides := map[string]infraai.ParamDef{}
			add := make([]infraai.ParamDef, 0)
			baseParamKeys := map[string]bool{}
			seenTemplateParams := map[string]bool{}
			for _, baseParam := range baseParams {
				key := strings.TrimSpace(baseParam.Key)
				if key == "" {
					continue
				}
				baseParamKeys[key] = true
				if !modelTemplateParamAppliesToOperation(adapterType, capability, operation, key) {
					continue
				}
				param, ok := templateParams[key]
				if !ok {
					continue
				}
				allow = appendUniqueString(allow, key)
				overrides[key] = param
				seenTemplateParams[key] = true
			}
			if capability == infraai.CapabilityFamilyImageGeneration {
				for _, param := range params {
					key := strings.TrimSpace(param.Key)
					if key == "" || seenTemplateParams[key] || baseParamKeys[key] {
						continue
					}
					if !modelTemplateParamAppliesToOperation(adapterType, capability, operation, key) {
						continue
					}
					allow = appendUniqueString(allow, key)
					add = append(add, param)
				}
			}
			if len(allow) == 0 && len(overrides) == 0 && len(add) == 0 {
				continue
			}
			profile.ByOperation[operation] = infraai.ModelParamProfile{
				Allow:    allow,
				Override: overrides,
				Add:      add,
			}
		}
	}
	if len(profile.ByOperation) == 0 {
		return ""
	}
	raw, err := json.Marshal(profile)
	if err != nil {
		return ""
	}
	return string(raw)
}

func modelTemplateParamAppliesToOperation(adapterType, capability, operation, key string) bool {
	if adapterType == infraai.AdapterVolcen &&
		capability == infraai.CapabilityFamilyVideoGeneration &&
		key == "fixed_camera" &&
		operation != infraai.VideoOperationPromptToVideo {
		return false
	}
	return true
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
		ModelTemplateKey:      strings.TrimSpace(input.ModelTemplateKey),
		TemplateVersion:       strings.TrimSpace(input.TemplateVersion),
		PublicModelID:         strings.TrimSpace(input.PublicModelID),
		DisplayName:           strings.TrimSpace(input.DisplayName),
		ShortName:             strings.TrimSpace(input.ShortName),
		IsEnabled:             enabled,
		Capabilities:          strings.TrimSpace(input.Capabilities),
		AcceptsImage:          input.AcceptsImage,
		MaxInputImages:        input.MaxInputImages,
		MaxInputVideos:        input.MaxInputVideos,
		InputImageField:       strings.TrimSpace(input.InputImageField),
		SupportedParams:       strings.TrimSpace(input.SupportedParams),
		ParamLimitsJSON:       strings.TrimSpace(input.ParamLimitsJSON),
		ModelCapabilitiesJSON: strings.TrimSpace(input.ModelCapabilitiesJSON),
	}
}

func validateModelCatalogEntry(entry *persistencemodel.AIModelCatalogEntry) error {
	return validateModelCatalogEntryForAdapter(entry, "")
}

func validateModelCatalogEntryForAdapter(entry *persistencemodel.AIModelCatalogEntry, adapterType string) error {
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
	if err := normalizeModelCatalogEntrySupportedParams(entry, adapterType); err != nil {
		return err
	}
	if value := strings.TrimSpace(entry.ParamLimitsJSON); value != "" && !json.Valid([]byte(value)) {
		return fmt.Errorf("%w: param_limits_json must be valid JSON", ErrInvalidModelCatalog)
	}
	if value := strings.TrimSpace(entry.ModelCapabilitiesJSON); value != "" && !json.Valid([]byte(value)) {
		return fmt.Errorf("%w: model_capabilities_json must be valid JSON", ErrInvalidModelCatalog)
	}
	return nil
}

func normalizeModelCatalogEntrySupportedParams(entry *persistencemodel.AIModelCatalogEntry, adapterType string) error {
	modelCapabilitiesJSON := strings.TrimSpace(entry.ModelCapabilitiesJSON)
	if modelCapabilitiesJSON == "" {
		modelCapabilitiesJSON = legacyModelCapabilitiesAsStructuredJSON(entry.Capabilities)
	}
	if template, ok := catalogTemplateForCatalogEntry(*entry); ok {
		resolvedAdapterType := strings.TrimSpace(adapterType)
		if resolvedAdapterType == "" {
			resolvedAdapterType = template.RouteAdapterHint
		}
		if err := infraai.ValidateModelOperationParamConfig(resolvedAdapterType, infraai.SplitCapabilities(entry.Capabilities), modelCapabilitiesJSON, entry.SupportedParams); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
		}
		return nil
	}
	if err := infraai.ValidateModelOperationParamConfigShape(entry.SupportedParams); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
	}
	return nil
}

func normalizeModelCatalogCapabilities(value string) (string, error) {
	allowed := map[string]bool{
		infraai.CapabilityFamilyTextGeneration:  true,
		infraai.CapabilityReasoning:             true,
		infraai.CapabilityFamilyImageGeneration: true,
		infraai.CapabilityFamilyVideoGeneration: true,
		infraai.CapabilityFamilyAudioGeneration: true,
		infraai.CapabilityFamilyEmbedding:       true,
		infraai.CapabilityFamilyRerank:          true,
		infraai.CapabilityFamilyModeration:      true,
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
		out = append(out, infraai.CapabilityFamilyTextGeneration)
	}
	return strings.Join(out, ","), nil
}

func validateModelRouteBinding(binding persistencemodel.AIModelRouteBinding) error {
	if binding.SourceType == persistencemodel.ModelRouteSourceRelayGateway && !supportsRelayGatewayRouteBindings() {
		return fmt.Errorf("%w: relay gateway route bindings require the external relay gateway profile", ErrInvalidModelCatalog)
	}
	if binding.SourceType == persistencemodel.ModelRouteSourceRelayGateway && strings.TrimSpace(binding.RouteGroup) == "" {
		return fmt.Errorf("%w: route_group is required for relay gateway route bindings", ErrInvalidModelCatalog)
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
	if err := validateModelRouteEndpointFields(binding); err != nil {
		return err
	}
	return validateCapacityConfig(binding.CapacityWeight, binding.MaxConcurrency)
}

func validateModelRouteEndpointFields(binding persistencemodel.AIModelRouteBinding) error {
	switch strings.TrimSpace(binding.EndpointMode) {
	case "", "inherit", "replace_path", "absolute":
	default:
		return fmt.Errorf("%w: endpoint_mode %q is not supported", ErrInvalidModelCatalog, strings.TrimSpace(binding.EndpointMode))
	}
	return nil
}

func validateModelRouteBindingCapabilities(entry persistencemodel.AIModelCatalogEntry, binding persistencemodel.AIModelRouteBinding) error {
	modelRaw := strings.TrimSpace(entry.ModelCapabilitiesJSON)
	if modelRaw == "" {
		modelRaw = legacyModelCapabilitiesAsStructuredJSON(entry.Capabilities)
	}
	modelOps, err := parseRouteCapabilityOperations(modelRaw)
	if err != nil {
		return fmt.Errorf("%w: model_capabilities_json must be valid JSON", ErrInvalidModelCatalog)
	}
	if len(modelOps) == 0 {
		return fmt.Errorf("%w: model_capabilities_json must declare catalog operations before enabling route bindings", ErrInvalidModelCatalog)
	}
	def := infraai.ResolveModelDef(
		strings.TrimSpace(entry.PublicModelID),
		strings.TrimSpace(binding.AdapterType),
		entry.DisplayName,
		entry.Capabilities,
		modelRaw,
		entry.AcceptsImage,
		entry.MaxInputImages,
		entry.MaxInputVideos,
		entry.InputImageField,
		entry.SupportedParams,
	)
	adapterContractRaw := modelRaw
	if strings.TrimSpace(binding.AdapterType) == infraai.AdapterNewAPI {
		var err error
		adapterContractRaw, err = newAPIModelRouteContractJSON(binding, modelOps)
		if err != nil {
			return err
		}
	}
	if err := infraai.AdapterSupportsModelContract(
		binding.AdapterType,
		infraai.SplitCapabilities(entry.Capabilities),
		adapterContractRaw,
		def.SupportedParamsByOperation,
	); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidModelCatalog, err)
	}
	return nil
}

func newAPIModelRouteContractJSON(binding persistencemodel.AIModelRouteBinding, modelOps map[string]map[string]bool) (string, error) {
	if strings.TrimSpace(binding.AdapterType) != infraai.AdapterNewAPI {
		return "", nil
	}
	profile := strings.TrimSpace(binding.ProtocolProfile)
	var explicitProfileDef infraai.NewAPIProtocolProfileDef
	if profile != "" {
		def, err := validateNewAPIProtocolProfileDef(profile)
		if err != nil {
			return "", err
		}
		explicitProfileDef = def
	}
	out := map[string]map[string]any{}
	for capability, ops := range modelOps {
		capability = strings.TrimSpace(capability)
		if capability == "" {
			continue
		}
		profileForCapability := profile
		if profileForCapability == "" {
			profileForCapability = infraai.ResolveNewAPIProtocolProfile(capability, "")
		}
		if profileForCapability == "" {
			continue
		}
		def := explicitProfileDef
		if profile == "" {
			var err error
			def, err = validateNewAPIProtocolProfileDef(profileForCapability)
			if err != nil {
				return "", err
			}
		}
		if strings.TrimSpace(def.CapabilityFamily) != "" && strings.TrimSpace(def.CapabilityFamily) != capability {
			continue
		}
		operations := newAPIProfileOperationIntersection(def, ops)
		if len(operations) == 0 {
			if profile != "" {
				return "", fmt.Errorf("%w: new_api protocol_profile %q does not support any declared operation for capability %q", ErrInvalidModelCatalog, profile, def.CapabilityFamily)
			}
			continue
		}
		out[capability] = map[string]any{"operations": operations}
	}
	if len(out) == 0 {
		if profile != "" {
			if strings.TrimSpace(explicitProfileDef.CapabilityFamily) != "" {
				return "", fmt.Errorf("%w: new_api protocol_profile %q requires capability %q", ErrInvalidModelCatalog, profile, explicitProfileDef.CapabilityFamily)
			}
			return "", fmt.Errorf("%w: new_api protocol_profile %q does not support any declared model operation", ErrInvalidModelCatalog, profile)
		}
		return "", fmt.Errorf("%w: new_api route does not support any declared model operation", ErrInvalidModelCatalog)
	}
	body, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func validateNewAPIProtocolProfileDef(profile string) (infraai.NewAPIProtocolProfileDef, error) {
	def, ok := infraai.NewAPIProtocolProfile(profile)
	if !ok {
		return infraai.NewAPIProtocolProfileDef{}, fmt.Errorf("%w: unknown new_api protocol_profile %q", ErrInvalidModelCatalog, profile)
	}
	if !def.Implemented {
		return infraai.NewAPIProtocolProfileDef{}, fmt.Errorf("%w: new_api protocol_profile %q is known but not implemented yet", ErrInvalidModelCatalog, profile)
	}
	return def, nil
}

func newAPIProfileOperationIntersection(def infraai.NewAPIProtocolProfileDef, modelOps map[string]bool) []string {
	if len(modelOps) == 0 {
		return nil
	}
	out := make([]string, 0)
	if len(def.Operations) == 0 {
		for operation := range modelOps {
			out = appendUniqueString(out, operation)
		}
		sort.Strings(out)
		return out
	}
	for _, operation := range def.Operations {
		operation = strings.TrimSpace(operation)
		if operation != "" && modelOps[operation] {
			out = appendUniqueString(out, operation)
		}
	}
	return out
}

func parseRouteCapabilityOperations(raw string) (map[string]map[string]bool, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var domains map[string]struct {
		Operations     json.RawMessage `json:"operations"`
		OperationSlots map[string]any  `json:"operation_slots"`
	}
	if err := json.Unmarshal([]byte(raw), &domains); err != nil {
		return nil, err
	}
	out := make(map[string]map[string]bool, len(domains))
	for capability, domain := range domains {
		capability = strings.TrimSpace(capability)
		if capability == "" {
			continue
		}
		operations, err := parseRouteCapabilityOperationNames(domain.Operations)
		if err != nil {
			return nil, err
		}
		for operation := range domain.OperationSlots {
			operations = appendUniqueString(operations, operation)
		}
		for _, operation := range operations {
			addRouteCapabilityOperation(out, capability, operation)
		}
	}
	return out, nil
}

func parseRouteCapabilityOperationNames(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var names []string
	if err := json.Unmarshal(raw, &names); err == nil {
		return compactStrings(names), nil
	}
	var defs []struct {
		ID        string `json:"id"`
		Operation string `json:"operation"`
	}
	if err := json.Unmarshal(raw, &defs); err == nil {
		names := make([]string, 0, len(defs))
		for _, def := range defs {
			name := strings.TrimSpace(def.ID)
			if name == "" {
				name = strings.TrimSpace(def.Operation)
			}
			names = appendUniqueString(names, name)
		}
		return names, nil
	}
	var defMap map[string]struct {
		ID        string `json:"id"`
		Operation string `json:"operation"`
	}
	if err := json.Unmarshal(raw, &defMap); err == nil {
		names := make([]string, 0, len(defMap))
		for key, def := range defMap {
			name := strings.TrimSpace(key)
			if name == "" {
				name = strings.TrimSpace(def.ID)
			}
			if name == "" {
				name = strings.TrimSpace(def.Operation)
			}
			names = appendUniqueString(names, name)
		}
		return names, nil
	}
	return nil, fmt.Errorf("invalid operations schema")
}

func addRouteCapabilityOperation(out map[string]map[string]bool, capability, operation string) {
	operation = strings.TrimSpace(operation)
	if operation == "" {
		return
	}
	if out[capability] == nil {
		out[capability] = map[string]bool{}
	}
	out[capability][operation] = true
}

func appendUniqueString(values []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return values
	}
	for _, existing := range values {
		if strings.TrimSpace(existing) == value {
			return values
		}
	}
	return append(values, value)
}

func compactStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = appendUniqueString(out, value)
	}
	return out
}

func legacyModelCapabilitiesAsStructuredJSON(capabilities string) string {
	values := infraai.SplitCapabilities(capabilities)
	has := func(capability string) bool {
		for _, value := range values {
			if strings.TrimSpace(value) == capability {
				return true
			}
		}
		return false
	}
	domains := map[string]map[string][]string{}
	add := func(capability string, operations ...string) {
		if len(operations) == 0 {
			return
		}
		domain := domains[capability]
		if domain == nil {
			domain = map[string][]string{"operations": []string{}}
			domains[capability] = domain
		}
		seen := map[string]bool{}
		for _, existing := range domain["operations"] {
			seen[existing] = true
		}
		for _, operation := range operations {
			operation = strings.TrimSpace(operation)
			if operation == "" || seen[operation] {
				continue
			}
			domain["operations"] = append(domain["operations"], operation)
			seen[operation] = true
		}
	}
	if has(infraai.CapabilityFamilyTextGeneration) || has(infraai.CapabilityReasoning) {
		add(infraai.CapabilityFamilyTextGeneration, "chat", "responses")
	}
	if has(infraai.CapabilityFamilyImageGeneration) {
		add(infraai.CapabilityFamilyImageGeneration, infraai.ImageOperationTextToImage, infraai.ImageOperationReferenceToImage, infraai.ImageOperationEditImage)
	}
	if has(infraai.CapabilityFamilyVideoGeneration) {
		add(infraai.CapabilityFamilyVideoGeneration, infraai.VideoOperationPromptToVideo, infraai.VideoOperationImageToVideo, infraai.VideoOperationFirstFrameToVideo, infraai.VideoOperationFirstLastFrameToVideo, infraai.VideoOperationReferenceToVideo)
	}
	if has(infraai.CapabilityFamilyAudioGeneration) {
		add(infraai.CapabilityFamilyAudioGeneration, infraai.AudioOperationTextToSpeech, infraai.AudioOperationSpeechToText, infraai.AudioOperationSpeechTranslate, infraai.AudioOperationSpeechToSpeech, infraai.AudioOperationVoiceClone, infraai.AudioOperationVoiceDesign, infraai.AudioOperationDubbing, infraai.AudioOperationMusicGeneration, infraai.AudioOperationSoundEffectGeneration, infraai.AudioOperationVoiceIsolation, infraai.AudioOperationForcedAlignment)
	}
	if len(domains) == 0 {
		return ""
	}
	raw, _ := json.Marshal(domains)
	return string(raw)
}

func (s *Service) validateRouteBindingProvider(ctx context.Context, binding persistencemodel.AIModelRouteBinding) error {
	providerID := strings.TrimSpace(binding.ProviderID)
	if providerID == "" || binding.SourceType == persistencemodel.ModelRouteSourceRelayGateway || !s.providerMirrorTablesReady() {
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
	binding.ProtocolProfile = strings.TrimSpace(binding.ProtocolProfile)
	binding.EndpointBaseURL = strings.TrimRight(strings.TrimSpace(binding.EndpointBaseURL), "/")
	binding.EndpointPathPrefix = normalizeRoutePathPrefix(binding.EndpointPathPrefix)
	binding.EndpointMode = strings.TrimSpace(binding.EndpointMode)
	if binding.EndpointMode == "" {
		binding.EndpointMode = "inherit"
	}
	if binding.SourceType == "" {
		binding.SourceType = sourceTypeFromRouteProviderID(binding.ProviderID)
	}
	if binding.ProviderID == "" {
		switch binding.SourceType {
		case persistencemodel.ModelRouteSourceRelayGateway:
			binding.ProviderID = persistencemodel.ModelRouteSourceRelayGateway
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

func normalizeModelRouteBindingProtocolProfile(binding *persistencemodel.AIModelRouteBinding) {
	binding.ProtocolProfile = strings.TrimSpace(binding.ProtocolProfile)
	if strings.TrimSpace(binding.AdapterType) != infraai.AdapterNewAPI {
		binding.ProtocolProfile = ""
	}
}

func normalizeRoutePathPrefix(value string) string {
	value = strings.Trim(strings.TrimSpace(value), "/")
	if value == "" {
		return ""
	}
	return "/" + value
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
	if providerID == persistencemodel.ModelRouteSourceRelayGateway || binding.SourceType == persistencemodel.ModelRouteSourceRelayGateway {
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
	case providerID == persistencemodel.ModelRouteSourceRelayGateway:
		return persistencemodel.ModelRouteSourceRelayGateway
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
		CatalogEntryID:     catalogEntryID,
		ComboTemplateKey:   strings.TrimSpace(input.ComboTemplateKey),
		TemplateVersion:    strings.TrimSpace(input.TemplateVersion),
		RouteGroup:         strings.TrimSpace(input.RouteGroup),
		ProviderID:         strings.TrimSpace(input.ProviderID),
		AdapterType:        strings.TrimSpace(input.AdapterType),
		ProviderModelID:    strings.TrimSpace(input.ProviderModelID),
		ProtocolProfile:    strings.TrimSpace(input.ProtocolProfile),
		APIKinds:           strings.TrimSpace(input.APIKinds),
		EndpointBaseURL:    strings.TrimSpace(input.EndpointBaseURL),
		EndpointPathPrefix: strings.TrimSpace(input.EndpointPathPrefix),
		EndpointMode:       strings.TrimSpace(input.EndpointMode),
		IsEnabled:          enabled,
		Priority:           input.Priority,
		CapacityWeight:     input.CapacityWeight,
		MaxConcurrency:     input.MaxConcurrency,
	}
}
