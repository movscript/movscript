package ai

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type ModelCatalogEntryInput struct {
	PublicModelID      string  `json:"public_model_id"`
	DisplayName        string  `json:"display_name"`
	ShortName          string  `json:"short_name"`
	IsEnabled          *bool   `json:"is_enabled"`
	Capabilities       string  `json:"capabilities"`
	PricingMode        string  `json:"pricing_mode"`
	AcceptsImage       bool    `json:"accepts_image"`
	MaxInputImages     int     `json:"max_input_images"`
	MaxInputVideos     int     `json:"max_input_videos"`
	ImageEditField     string  `json:"image_edit_field"`
	SupportedParams    string  `json:"supported_params"`
	CreditsInputPer1M  float64 `json:"credits_input_per_1m"`
	CreditsOutputPer1M float64 `json:"credits_output_per_1m"`
	CreditsPerImage    float64 `json:"credits_per_image"`
	CreditsPerSecond   float64 `json:"credits_per_second"`
	CreditsPerCall     float64 `json:"credits_per_call"`
}

type ModelRouteBindingInput struct {
	SourceType      string `json:"source_type"`
	RouteGroup      string `json:"route_group"`
	ProviderID      string `json:"provider_id"`
	ProviderModelID string `json:"provider_model_id"`
	APIKinds        string `json:"api_kinds"`
	IsEnabled       *bool  `json:"is_enabled"`
	Priority        int    `json:"priority"`
	CapacityWeight  int    `json:"capacity_weight"`
	MaxConcurrency  int    `json:"max_concurrency"`
}

func (s *Service) ListModelCatalogEntries(ctx context.Context) ([]persistencemodel.AIModelCatalogEntry, error) {
	var entries []persistencemodel.AIModelCatalogEntry
	err := s.db.WithContext(ctx).
		Preload("RouteBindings").
		Order("public_model_id ASC").
		Find(&entries).Error
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
	if err := normalizeModelRouteBindingAPIKinds(&binding); err != nil {
		return binding, err
	}
	if strings.TrimSpace(binding.SourceType) == "" {
		return binding, ErrInvalidModelCatalog
	}
	if err := validateModelRouteBinding(binding); err != nil {
		return binding, err
	}
	normalizeModelRouteBindingCapacity(&binding)
	if err := s.ensureUniqueModelRouteBinding(ctx, binding.CatalogEntryID, 0, binding.SourceType, binding.RouteGroup, binding.ProviderID); err != nil {
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
	if err := normalizeModelRouteBindingAPIKinds(&next); err != nil {
		return next, err
	}
	next.ID = binding.ID
	next.CreatedAt = binding.CreatedAt
	if next.SourceType == "" {
		next.SourceType = binding.SourceType
	}
	if err := validateModelRouteBinding(next); err != nil {
		return next, err
	}
	normalizeModelRouteBindingCapacity(&next)
	if err := s.ensureUniqueModelRouteBinding(ctx, next.CatalogEntryID, next.ID, next.SourceType, next.RouteGroup, next.ProviderID); err != nil {
		return next, err
	}
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return next, err
	}
	return next, nil
}

func (s *Service) ensureUniqueModelRouteBinding(ctx context.Context, catalogEntryID uint, excludeBindingID uint, sourceType string, routeGroup string, providerID string) error {
	q := s.db.WithContext(ctx).Model(&persistencemodel.AIModelRouteBinding{}).
		Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND provider_id = ?", catalogEntryID, strings.TrimSpace(sourceType), strings.TrimSpace(routeGroup), strings.TrimSpace(providerID))
	if excludeBindingID != 0 {
		q = q.Where("id <> ?", excludeBindingID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("%w: route binding already exists for source %q, group %q, and provider %q", ErrInvalidModelCatalog, strings.TrimSpace(sourceType), strings.TrimSpace(routeGroup), strings.TrimSpace(providerID))
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

func modelCatalogEntryFromInput(input ModelCatalogEntryInput) persistencemodel.AIModelCatalogEntry {
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	return persistencemodel.AIModelCatalogEntry{
		PublicModelID:      strings.TrimSpace(input.PublicModelID),
		DisplayName:        strings.TrimSpace(input.DisplayName),
		ShortName:          strings.TrimSpace(input.ShortName),
		IsEnabled:          enabled,
		Capabilities:       strings.TrimSpace(input.Capabilities),
		PricingMode:        strings.TrimSpace(input.PricingMode),
		AcceptsImage:       input.AcceptsImage,
		MaxInputImages:     input.MaxInputImages,
		MaxInputVideos:     input.MaxInputVideos,
		ImageEditField:     strings.TrimSpace(input.ImageEditField),
		SupportedParams:    strings.TrimSpace(input.SupportedParams),
		CreditsInputPer1M:  input.CreditsInputPer1M,
		CreditsOutputPer1M: input.CreditsOutputPer1M,
		CreditsPerImage:    input.CreditsPerImage,
		CreditsPerSecond:   input.CreditsPerSecond,
		CreditsPerCall:     input.CreditsPerCall,
	}
}

func validateModelCatalogEntry(entry *persistencemodel.AIModelCatalogEntry) error {
	capabilities, err := normalizeModelCatalogCapabilities(entry.Capabilities)
	if err != nil {
		return err
	}
	entry.Capabilities = capabilities
	if entry.PricingMode != "" && !validModelCatalogPricingMode(entry.PricingMode) {
		return fmt.Errorf("%w: pricing_mode %q is not supported", ErrInvalidModelCatalog, entry.PricingMode)
	}
	if err := validateInputLimit("max_input_images", entry.MaxInputImages); err != nil {
		return err
	}
	if err := validateInputLimit("max_input_videos", entry.MaxInputVideos); err != nil {
		return err
	}
	for field, value := range map[string]float64{
		"credits_input_per_1m":  entry.CreditsInputPer1M,
		"credits_output_per_1m": entry.CreditsOutputPer1M,
		"credits_per_image":     entry.CreditsPerImage,
		"credits_per_second":    entry.CreditsPerSecond,
		"credits_per_call":      entry.CreditsPerCall,
	} {
		if value < 0 {
			return fmt.Errorf("%w: %s must be non-negative", ErrInvalidModelCatalog, field)
		}
	}
	if err := infraai.ValidateModelParamConfig(infraai.AdapterOpenAICompat, infraai.SplitCapabilities(capabilities), entry.SupportedParams); err != nil {
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

func validModelCatalogPricingMode(value string) bool {
	switch infraai.PricingMode(value) {
	case infraai.PricingPerToken, infraai.PricingPerImage, infraai.PricingPerSecond, infraai.PricingPerCall:
		return true
	default:
		return false
	}
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
	if strings.TrimSpace(binding.ProviderModelID) == "" {
		return fmt.Errorf("%w: provider_model_id is required for route bindings", ErrInvalidModelCatalog)
	}
	return validateCapacityConfig(binding.CapacityWeight, binding.MaxConcurrency)
}

func normalizeModelRouteBindingCapacity(binding *persistencemodel.AIModelRouteBinding) {
	binding.CapacityWeight = normalizeCapacityWeight(binding.CapacityWeight)
}

func normalizeModelRouteBindingProviderID(binding *persistencemodel.AIModelRouteBinding) {
	binding.SourceType = strings.TrimSpace(binding.SourceType)
	binding.RouteGroup = strings.TrimSpace(binding.RouteGroup)
	binding.ProviderID = strings.TrimSpace(binding.ProviderID)
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
		CatalogEntryID:  catalogEntryID,
		SourceType:      strings.TrimSpace(input.SourceType),
		RouteGroup:      strings.TrimSpace(input.RouteGroup),
		ProviderID:      strings.TrimSpace(input.ProviderID),
		ProviderModelID: strings.TrimSpace(input.ProviderModelID),
		APIKinds:        strings.TrimSpace(input.APIKinds),
		IsEnabled:       enabled,
		Priority:        input.Priority,
		CapacityWeight:  input.CapacityWeight,
		MaxConcurrency:  input.MaxConcurrency,
	}
}
