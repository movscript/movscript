package settings

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

const SystemHealthThresholdsKey = "system_health_thresholds"
const GenerationToolsSettingsKey = "generation_tools_settings"
const ProviderAssetSettingsKey = "provider_asset_settings"
const ResourceAccessSettingsKey = "resource_access_settings"
const UsagePolicySettingsKey = "usage_policy_settings"
const OrgGenerationToolsSettingsKeyPrefix = "generation_tools_settings:org:"

var ErrInvalidSystemHealthThresholds = errors.New("invalid system health thresholds")
var ErrInvalidGenerationToolsSettings = errors.New("invalid generation tools settings")
var ErrInvalidProviderAssetSettings = errors.New("invalid provider asset settings")
var ErrInvalidResourceAccessSettings = errors.New("invalid resource access settings")
var ErrResourceAccessProfileNotFound = errors.New("resource access profile not found")
var ErrInvalidUsagePolicySettings = errors.New("invalid usage policy settings")

type Service struct {
	repo          repository
	encryptionKey []byte
}

func NewService(db *gorm.DB, encryptionKeyHex ...string) *Service {
	var key []byte
	if len(encryptionKeyHex) > 0 {
		key, _ = hex.DecodeString(encryptionKeyHex[0])
	}
	return &Service{repo: &gormRepository{db: db}, encryptionKey: key}
}

type SystemHealthThresholds struct {
	ErrorRateWarn        float64 `json:"error_rate_warn"`
	ErrorRateCritical    float64 `json:"error_rate_critical"`
	FailedJobsWarn       int64   `json:"failed_jobs_warn"`
	FailedJobsCritical   int64   `json:"failed_jobs_critical"`
	SlowRequestsWarn     int64   `json:"slow_requests_warn"`
	SlowRequestsCritical int64   `json:"slow_requests_critical"`
}

type GenerationToolsSettings struct {
	Servers          []GenerationToolServer `json:"servers"`
	DefaultServerID  string                 `json:"default_server_id,omitempty"`
	DefaultServerIDs map[string]string      `json:"default_server_ids,omitempty"`
	AllowLocal       bool                   `json:"allow_local"`
}

type GenerationToolServer struct {
	ID          string   `json:"id"`
	Scope       string   `json:"scope"`
	Type        string   `json:"type"`
	Name        string   `json:"name"`
	Enabled     bool     `json:"enabled"`
	BaseURL     string   `json:"base_url"`
	TimeoutMS   int      `json:"timeout_ms"`
	Priority    int      `json:"priority"`
	AuthKind    string   `json:"auth_kind"`
	Username    string   `json:"username,omitempty"`
	Password    string   `json:"password,omitempty"`
	PasswordSet bool     `json:"password_set"`
	Token       string   `json:"token,omitempty"`
	TokenSet    bool     `json:"token_set"`
	Tags        []string `json:"tags,omitempty"`
}

type generationToolsSettingsStored struct {
	Servers          []GenerationToolServer `json:"servers"`
	DefaultServerID  string                 `json:"default_server_id,omitempty"`
	DefaultServerIDs map[string]string      `json:"default_server_ids,omitempty"`
	AllowLocal       bool                   `json:"allow_local"`
}

type ProviderAssetSettings struct {
	ArkOpenAPIBaseURL  string                             `json:"ark_openapi_base_url,omitempty"`
	ArkRegion          string                             `json:"ark_region,omitempty"`
	ArkAccessKeyID     string                             `json:"ark_access_key_id,omitempty"`
	ArkSecretAccessKey string                             `json:"ark_secret_access_key,omitempty"`
	ArkSecretKeySet    bool                               `json:"ark_secret_key_set"`
	ArkAssetGroups     map[string]ProviderAssetGroupState `json:"ark_asset_groups,omitempty"`
}

type providerAssetSettingsStored struct {
	// Legacy resource-public-access fields. New writes use ResourceAccessSettings;
	// these remain only so old admin setting JSON can be decoded safely.
	PublicBaseURL      string                             `json:"public_base_url,omitempty"`
	SigningSecret      string                             `json:"signing_secret,omitempty"`
	ArkOpenAPIBaseURL  string                             `json:"ark_openapi_base_url,omitempty"`
	ArkRegion          string                             `json:"ark_region,omitempty"`
	ArkAccessKeyID     string                             `json:"ark_access_key_id,omitempty"`
	ArkSecretAccessKey string                             `json:"ark_secret_access_key,omitempty"`
	ArkAssetGroupID    string                             `json:"ark_asset_group_id,omitempty"`
	ArkAssetGroups     map[string]ProviderAssetGroupState `json:"ark_asset_groups,omitempty"`
}

type ResourceAccessSettings struct {
	Profiles         []ResourceAccessProfile `json:"profiles"`
	DefaultProfileID string                  `json:"default_profile_id,omitempty"`
}

type ResourceAccessProfile struct {
	ID               string `json:"id"`
	Name             string `json:"name,omitempty"`
	Enabled          bool   `json:"enabled"`
	Mode             string `json:"mode"`
	PublicBaseURL    string `json:"public_base_url,omitempty"`
	InternalBaseURL  string `json:"internal_base_url,omitempty"`
	SigningEnabled   bool   `json:"signing_enabled"`
	SigningSecret    string `json:"signing_secret,omitempty"`
	SigningSecretSet bool   `json:"signing_secret_set"`
	ExpiresSeconds   int    `json:"expires_seconds,omitempty"`
	HealthCheckPath  string `json:"health_check_path,omitempty"`
}

type resourceAccessSettingsStored struct {
	Profiles         []ResourceAccessProfile `json:"profiles"`
	DefaultProfileID string                  `json:"default_profile_id,omitempty"`
}

type UsagePolicySettings struct {
	Mode                      string                     `json:"mode"`
	DefaultUsageCreditLimit   float64                    `json:"default_usage_credit_limit,omitempty"`
	DefaultMonthlyCreditLimit float64                    `json:"default_monthly_credit_limit,omitempty"`
	DefaultDailyCreditLimit   float64                    `json:"default_daily_credit_limit,omitempty"`
	AlertThresholds           []float64                  `json:"alert_thresholds,omitempty"`
	Gateway                   UsagePolicyGatewaySettings `json:"gateway,omitempty"`
	Notes                     string                     `json:"notes,omitempty"`
}

type UsagePolicyGatewaySettings struct {
	MaxRequestsPerMinute    int     `json:"max_requests_per_minute,omitempty"`
	MaxConcurrentRequests   int     `json:"max_concurrent_requests,omitempty"`
	MaxEstimatedCostPerCall float64 `json:"max_estimated_cost_per_call,omitempty"`
}

type ProviderAssetGroupState struct {
	ID          string `json:"id"`
	Name        string `json:"name,omitempty"`
	Scope       string `json:"scope,omitempty"`
	ProjectName string `json:"project_name,omitempty"`
	SettingID   string `json:"setting_id,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

func DefaultSystemHealthThresholds() SystemHealthThresholds {
	return SystemHealthThresholds{
		ErrorRateWarn:        5,
		ErrorRateCritical:    20,
		FailedJobsWarn:       1,
		FailedJobsCritical:   10,
		SlowRequestsWarn:     5,
		SlowRequestsCritical: 20,
	}
}

func DefaultGenerationToolsSettings() GenerationToolsSettings {
	return GenerationToolsSettings{
		Servers:    []GenerationToolServer{},
		AllowLocal: true,
	}
}

func DefaultProviderAssetSettings() ProviderAssetSettings {
	return ProviderAssetSettings{
		ArkOpenAPIBaseURL: "https://ark.cn-beijing.volcengineapi.com",
		ArkRegion:         "cn-beijing",
	}
}

func DefaultResourceAccessSettings() ResourceAccessSettings {
	return ResourceAccessSettings{
		Profiles: []ResourceAccessProfile{},
	}
}

func DefaultUsagePolicySettings() UsagePolicySettings {
	return UsagePolicySettings{
		Mode:            "off",
		AlertThresholds: []float64{80, 100},
	}
}

func OrgGenerationToolsSettingsKey(orgID uint) string {
	return fmt.Sprintf("%s%d", OrgGenerationToolsSettingsKeyPrefix, orgID)
}

func (s *Service) GenerationToolsSettings(ctx context.Context) (GenerationToolsSettings, error) {
	return s.generationToolsSettings(ctx, GenerationToolsSettingsKey, "admin")
}

func (s *Service) OrgGenerationToolsSettings(ctx context.Context, orgID uint) (GenerationToolsSettings, error) {
	return s.generationToolsSettings(ctx, OrgGenerationToolsSettingsKey(orgID), "org")
}

func (s *Service) generationToolsSettings(ctx context.Context, key string, scope string) (GenerationToolsSettings, error) {
	settings := DefaultGenerationToolsSettings()
	record, err := s.repo.Get(ctx, key)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	var stored generationToolsSettingsStored
	if err := json.Unmarshal([]byte(record.ValueJSON), &stored); err != nil {
		return settings, nil
	}
	settings.AllowLocal = stored.AllowLocal
	settings.Servers = normalizeGenerationToolServers(stored.Servers, scope)
	settings.DefaultServerID = normalizeDefaultGenerationToolServerID(stored.DefaultServerID, settings.Servers)
	settings.DefaultServerIDs = normalizeDefaultGenerationToolServerIDs(stored.DefaultServerIDs, settings.DefaultServerID, settings.Servers)
	for i := range settings.Servers {
		if settings.Servers[i].Password != "" && len(s.encryptionKey) > 0 {
			if plain, err := crypto.Decrypt(settings.Servers[i].Password, s.encryptionKey); err == nil {
				settings.Servers[i].Password = plain
			}
		}
		if settings.Servers[i].Token != "" && len(s.encryptionKey) > 0 {
			if plain, err := crypto.Decrypt(settings.Servers[i].Token, s.encryptionKey); err == nil {
				settings.Servers[i].Token = plain
			}
		}
		settings.Servers[i].PasswordSet = settings.Servers[i].Password != ""
		settings.Servers[i].TokenSet = settings.Servers[i].Token != ""
	}
	return settings, nil
}

func (s *Service) PublicGenerationToolsSettings(ctx context.Context) (GenerationToolsSettings, error) {
	return s.publicGenerationToolsSettings(ctx, GenerationToolsSettingsKey, "admin")
}

func (s *Service) PublicOrgGenerationToolsSettings(ctx context.Context, orgID uint) (GenerationToolsSettings, error) {
	return s.publicGenerationToolsSettings(ctx, OrgGenerationToolsSettingsKey(orgID), "org")
}

func (s *Service) publicGenerationToolsSettings(ctx context.Context, key string, scope string) (GenerationToolsSettings, error) {
	settings, err := s.generationToolsSettings(ctx, key, scope)
	if err != nil {
		return settings, err
	}
	for i := range settings.Servers {
		settings.Servers[i].Password = ""
		settings.Servers[i].Token = ""
	}
	return settings, nil
}

func (s *Service) UpdateGenerationToolsSettings(ctx context.Context, settings GenerationToolsSettings) (GenerationToolsSettings, error) {
	return s.updateGenerationToolsSettings(ctx, GenerationToolsSettingsKey, "admin", settings)
}

func (s *Service) ProviderAssetSettings(ctx context.Context) (ProviderAssetSettings, error) {
	settings := DefaultProviderAssetSettings()
	record, err := s.repo.Get(ctx, ProviderAssetSettingsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	var stored providerAssetSettingsStored
	if err := json.Unmarshal([]byte(record.ValueJSON), &stored); err != nil {
		return settings, nil
	}
	settings.ArkOpenAPIBaseURL = normalizeProviderAssetOpenAPIBaseURL(stored.ArkOpenAPIBaseURL)
	settings.ArkRegion = normalizeProviderAssetArkRegion(stored.ArkRegion)
	settings.ArkAccessKeyID = strings.TrimSpace(stored.ArkAccessKeyID)
	settings.ArkSecretAccessKey = strings.TrimSpace(stored.ArkSecretAccessKey)
	settings.ArkAssetGroups = normalizeProviderAssetGroups(stored.ArkAssetGroups)
	if legacyGroupID := strings.TrimSpace(stored.ArkAssetGroupID); legacyGroupID != "" {
		if settings.ArkAssetGroups == nil {
			settings.ArkAssetGroups = map[string]ProviderAssetGroupState{}
		}
		if _, exists := settings.ArkAssetGroups["global"]; !exists {
			settings.ArkAssetGroups["global"] = ProviderAssetGroupState{
				ID:    legacyGroupID,
				Name:  "MovScript global AIGC assets",
				Scope: "global",
			}
		}
	}
	if settings.ArkSecretAccessKey != "" && len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(settings.ArkSecretAccessKey, s.encryptionKey); err == nil {
			settings.ArkSecretAccessKey = plain
		}
	}
	settings.ArkSecretKeySet = settings.ArkSecretAccessKey != ""
	return settings, nil
}

func (s *Service) PublicProviderAssetSettings(ctx context.Context) (ProviderAssetSettings, error) {
	settings, err := s.ProviderAssetSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.ArkSecretAccessKey = ""
	return settings, nil
}

func (s *Service) ResourceAccessSettings(ctx context.Context) (ResourceAccessSettings, error) {
	settings := DefaultResourceAccessSettings()
	record, err := s.repo.Get(ctx, ResourceAccessSettingsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	var stored resourceAccessSettingsStored
	if err := json.Unmarshal([]byte(record.ValueJSON), &stored); err != nil {
		return settings, nil
	}
	settings.Profiles = normalizeResourceAccessProfiles(stored.Profiles)
	settings.DefaultProfileID = normalizeResourceAccessDefaultProfileID(stored.DefaultProfileID, settings.Profiles)
	for i := range settings.Profiles {
		if settings.Profiles[i].SigningSecret != "" && len(s.encryptionKey) > 0 {
			if plain, err := crypto.Decrypt(settings.Profiles[i].SigningSecret, s.encryptionKey); err == nil {
				settings.Profiles[i].SigningSecret = plain
			}
		}
		settings.Profiles[i].SigningSecretSet = settings.Profiles[i].SigningSecret != ""
	}
	return settings, nil
}

func (s *Service) PublicResourceAccessSettings(ctx context.Context) (ResourceAccessSettings, error) {
	settings, err := s.ResourceAccessSettings(ctx)
	if err != nil {
		return settings, err
	}
	for i := range settings.Profiles {
		settings.Profiles[i].SigningSecret = ""
	}
	return settings, nil
}

func (s *Service) UpdateResourceAccessSettings(ctx context.Context, settings ResourceAccessSettings) (ResourceAccessSettings, error) {
	current, err := s.ResourceAccessSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.Profiles = preserveResourceAccessSecrets(normalizeResourceAccessProfiles(settings.Profiles), current.Profiles)
	settings.DefaultProfileID = normalizeResourceAccessDefaultProfileID(settings.DefaultProfileID, settings.Profiles)
	if err := validateResourceAccessSettings(settings); err != nil {
		return settings, err
	}
	stored := resourceAccessSettingsStored{
		Profiles:         append([]ResourceAccessProfile(nil), settings.Profiles...),
		DefaultProfileID: settings.DefaultProfileID,
	}
	for i := range stored.Profiles {
		if stored.Profiles[i].SigningSecret != "" && len(s.encryptionKey) > 0 {
			encrypted, err := crypto.Encrypt(stored.Profiles[i].SigningSecret, s.encryptionKey)
			if err != nil {
				return settings, err
			}
			stored.Profiles[i].SigningSecret = encrypted
		}
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: ResourceAccessSettingsKey, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	for i := range settings.Profiles {
		settings.Profiles[i].SigningSecretSet = settings.Profiles[i].SigningSecret != ""
		settings.Profiles[i].SigningSecret = ""
	}
	return settings, nil
}

func (s *Service) UpsertResourceAccessProfile(ctx context.Context, profileID string, profile ResourceAccessProfile, defaultProfileID string) (ResourceAccessSettings, error) {
	settings, err := s.ResourceAccessSettings(ctx)
	if err != nil {
		return settings, err
	}
	profile.ID = normalizeResourceAccessProfileID(firstNonEmpty(profileID, profile.ID))
	if profile.ID == "" {
		return settings, ErrInvalidResourceAccessSettings
	}
	replaced := false
	for i := range settings.Profiles {
		if settings.Profiles[i].ID == profile.ID {
			settings.Profiles[i] = profile
			replaced = true
			break
		}
	}
	if !replaced {
		settings.Profiles = append(settings.Profiles, profile)
	}
	if strings.TrimSpace(defaultProfileID) != "" {
		settings.DefaultProfileID = defaultProfileID
	}
	return s.UpdateResourceAccessSettings(ctx, settings)
}

func (s *Service) DeleteResourceAccessProfile(ctx context.Context, profileID string) (ResourceAccessSettings, error) {
	settings, err := s.ResourceAccessSettings(ctx)
	if err != nil {
		return settings, err
	}
	profileID = normalizeResourceAccessProfileID(profileID)
	if profileID == "" {
		return settings, ErrResourceAccessProfileNotFound
	}
	next := make([]ResourceAccessProfile, 0, len(settings.Profiles))
	removed := false
	for _, profile := range settings.Profiles {
		if profile.ID == profileID {
			removed = true
			continue
		}
		next = append(next, profile)
	}
	if !removed {
		return settings, ErrResourceAccessProfileNotFound
	}
	settings.Profiles = next
	if settings.DefaultProfileID == profileID {
		settings.DefaultProfileID = ""
	}
	return s.UpdateResourceAccessSettings(ctx, settings)
}

func NormalizeResourceAccessProfileID(value string) string {
	return normalizeResourceAccessProfileID(value)
}

func (s *Service) UsagePolicySettings(ctx context.Context) (UsagePolicySettings, error) {
	settings := DefaultUsagePolicySettings()
	record, err := s.repo.Get(ctx, UsagePolicySettingsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	if err := json.Unmarshal([]byte(record.ValueJSON), &settings); err != nil {
		return DefaultUsagePolicySettings(), nil
	}
	return normalizeUsagePolicySettings(settings), nil
}

func (s *Service) UpdateUsagePolicySettings(ctx context.Context, settings UsagePolicySettings) (UsagePolicySettings, error) {
	settings = normalizeUsagePolicySettings(settings)
	if err := validateUsagePolicySettings(settings); err != nil {
		return settings, err
	}
	raw, err := json.Marshal(settings)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: UsagePolicySettingsKey, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	return settings, nil
}

func (s *Service) UpdateProviderAssetSettings(ctx context.Context, settings ProviderAssetSettings) (ProviderAssetSettings, error) {
	current, err := s.ProviderAssetSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.ArkOpenAPIBaseURL = normalizeProviderAssetOpenAPIBaseURL(settings.ArkOpenAPIBaseURL)
	settings.ArkRegion = normalizeProviderAssetArkRegion(settings.ArkRegion)
	settings.ArkAccessKeyID = strings.TrimSpace(settings.ArkAccessKeyID)
	settings.ArkSecretAccessKey = strings.TrimSpace(settings.ArkSecretAccessKey)
	if settings.ArkSecretAccessKey == "" && current.ArkSecretAccessKey != "" {
		settings.ArkSecretAccessKey = current.ArkSecretAccessKey
	}
	settings.ArkAssetGroups = normalizeProviderAssetGroups(current.ArkAssetGroups)
	if err := validateProviderAssetSettings(settings); err != nil {
		return settings, err
	}
	stored := providerAssetSettingsStored{
		ArkOpenAPIBaseURL:  settings.ArkOpenAPIBaseURL,
		ArkRegion:          settings.ArkRegion,
		ArkAccessKeyID:     settings.ArkAccessKeyID,
		ArkSecretAccessKey: settings.ArkSecretAccessKey,
		ArkAssetGroups:     settings.ArkAssetGroups,
	}
	if stored.ArkSecretAccessKey != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(stored.ArkSecretAccessKey, s.encryptionKey)
		if err != nil {
			return settings, err
		}
		stored.ArkSecretAccessKey = encrypted
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: ProviderAssetSettingsKey, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	settings.ArkSecretKeySet = settings.ArkSecretAccessKey != ""
	settings.ArkSecretAccessKey = ""
	return settings, nil
}

func (s *Service) UpsertProviderAssetGroup(ctx context.Context, scope string, group ProviderAssetGroupState) (ProviderAssetSettings, error) {
	current, err := s.ProviderAssetSettings(ctx)
	if err != nil {
		return current, err
	}
	scope = normalizeProviderAssetGroupScope(scope)
	group.ID = strings.TrimSpace(group.ID)
	if group.ID == "" {
		return current, ErrInvalidProviderAssetSettings
	}
	group.Scope = scope
	group.Name = strings.TrimSpace(group.Name)
	group.ProjectName = strings.TrimSpace(group.ProjectName)
	group.SettingID = strings.TrimSpace(group.SettingID)
	now := time.Now().UTC().Format(time.RFC3339)
	if group.CreatedAt == "" {
		if existing, ok := current.ArkAssetGroups[scope]; ok {
			group.CreatedAt = existing.CreatedAt
		}
	}
	if group.CreatedAt == "" {
		group.CreatedAt = now
	}
	group.UpdatedAt = now
	if current.ArkAssetGroups == nil {
		current.ArkAssetGroups = map[string]ProviderAssetGroupState{}
	}
	current.ArkAssetGroups[scope] = group
	return s.saveProviderAssetSettings(ctx, current)
}

func (s *Service) saveProviderAssetSettings(ctx context.Context, settings ProviderAssetSettings) (ProviderAssetSettings, error) {
	stored := providerAssetSettingsStored{
		ArkOpenAPIBaseURL:  settings.ArkOpenAPIBaseURL,
		ArkRegion:          settings.ArkRegion,
		ArkAccessKeyID:     settings.ArkAccessKeyID,
		ArkSecretAccessKey: settings.ArkSecretAccessKey,
		ArkAssetGroups:     settings.ArkAssetGroups,
	}
	if stored.ArkSecretAccessKey != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(stored.ArkSecretAccessKey, s.encryptionKey)
		if err != nil {
			return settings, err
		}
		stored.ArkSecretAccessKey = encrypted
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: ProviderAssetSettingsKey, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	settings.ArkSecretKeySet = settings.ArkSecretAccessKey != ""
	settings.ArkSecretAccessKey = ""
	return settings, nil
}

func (s *Service) UpdateOrgGenerationToolsSettings(ctx context.Context, orgID uint, settings GenerationToolsSettings) (GenerationToolsSettings, error) {
	return s.updateGenerationToolsSettings(ctx, OrgGenerationToolsSettingsKey(orgID), "org", settings)
}

func (s *Service) updateGenerationToolsSettings(ctx context.Context, key string, scope string, settings GenerationToolsSettings) (GenerationToolsSettings, error) {
	current, err := s.generationToolsSettings(ctx, key, scope)
	if err != nil {
		return settings, err
	}
	settings.Servers = normalizeGenerationToolServers(settings.Servers, scope)
	settings.DefaultServerID = normalizeDefaultGenerationToolServerID(settings.DefaultServerID, settings.Servers)
	settings.DefaultServerIDs = normalizeDefaultGenerationToolServerIDs(settings.DefaultServerIDs, settings.DefaultServerID, settings.Servers)
	settings = preserveGenerationToolSecrets(settings, current)
	if err := validateGenerationToolsSettings(settings); err != nil {
		return settings, err
	}
	stored := generationToolsSettingsStored{
		Servers:          append([]GenerationToolServer(nil), settings.Servers...),
		DefaultServerID:  settings.DefaultServerID,
		DefaultServerIDs: settings.DefaultServerIDs,
		AllowLocal:       settings.AllowLocal,
	}
	for i := range stored.Servers {
		if stored.Servers[i].Password != "" && len(s.encryptionKey) > 0 {
			encrypted, err := crypto.Encrypt(stored.Servers[i].Password, s.encryptionKey)
			if err != nil {
				return settings, err
			}
			stored.Servers[i].Password = encrypted
		}
		if stored.Servers[i].Token != "" && len(s.encryptionKey) > 0 {
			encrypted, err := crypto.Encrypt(stored.Servers[i].Token, s.encryptionKey)
			if err != nil {
				return settings, err
			}
			stored.Servers[i].Token = encrypted
		}
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: key, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	for i := range settings.Servers {
		settings.Servers[i].PasswordSet = settings.Servers[i].Password != ""
		settings.Servers[i].Password = ""
		settings.Servers[i].TokenSet = settings.Servers[i].Token != ""
		settings.Servers[i].Token = ""
	}
	return settings, nil
}

func (s *Service) SystemHealthThresholds(ctx context.Context) (SystemHealthThresholds, error) {
	thresholds := DefaultSystemHealthThresholds()
	setting, err := s.repo.Get(ctx, SystemHealthThresholdsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return thresholds, nil
		}
		return thresholds, err
	}
	if err := json.Unmarshal([]byte(setting.ValueJSON), &thresholds); err != nil {
		return DefaultSystemHealthThresholds(), nil
	}
	return normalizeSystemHealthThresholds(thresholds), nil
}

func (s *Service) UpdateSystemHealthThresholds(ctx context.Context, thresholds SystemHealthThresholds) (SystemHealthThresholds, error) {
	thresholds = normalizeSystemHealthThresholds(thresholds)
	if err := validateSystemHealthThresholds(thresholds); err != nil {
		return thresholds, err
	}
	raw, err := json.Marshal(thresholds)
	if err != nil {
		return thresholds, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: SystemHealthThresholdsKey, ValueJSON: string(raw)}); err != nil {
		return thresholds, err
	}
	return thresholds, nil
}

func normalizeSystemHealthThresholds(thresholds SystemHealthThresholds) SystemHealthThresholds {
	defaults := DefaultSystemHealthThresholds()
	if thresholds.ErrorRateWarn == 0 {
		thresholds.ErrorRateWarn = defaults.ErrorRateWarn
	}
	if thresholds.ErrorRateCritical == 0 {
		thresholds.ErrorRateCritical = defaults.ErrorRateCritical
	}
	if thresholds.FailedJobsWarn == 0 {
		thresholds.FailedJobsWarn = defaults.FailedJobsWarn
	}
	if thresholds.FailedJobsCritical == 0 {
		thresholds.FailedJobsCritical = defaults.FailedJobsCritical
	}
	if thresholds.SlowRequestsWarn == 0 {
		thresholds.SlowRequestsWarn = defaults.SlowRequestsWarn
	}
	if thresholds.SlowRequestsCritical == 0 {
		thresholds.SlowRequestsCritical = defaults.SlowRequestsCritical
	}
	return thresholds
}

func validateSystemHealthThresholds(thresholds SystemHealthThresholds) error {
	if math.IsNaN(thresholds.ErrorRateWarn) || math.IsNaN(thresholds.ErrorRateCritical) ||
		math.IsInf(thresholds.ErrorRateWarn, 0) || math.IsInf(thresholds.ErrorRateCritical, 0) {
		return ErrInvalidSystemHealthThresholds
	}
	if thresholds.ErrorRateWarn < 0 || thresholds.ErrorRateWarn > 100 ||
		thresholds.ErrorRateCritical < thresholds.ErrorRateWarn || thresholds.ErrorRateCritical > 100 {
		return ErrInvalidSystemHealthThresholds
	}
	if thresholds.FailedJobsWarn < 0 || thresholds.FailedJobsCritical < thresholds.FailedJobsWarn ||
		thresholds.SlowRequestsWarn < 0 || thresholds.SlowRequestsCritical < thresholds.SlowRequestsWarn {
		return ErrInvalidSystemHealthThresholds
	}
	return nil
}

func normalizeUsagePolicySettings(settings UsagePolicySettings) UsagePolicySettings {
	mode := strings.TrimSpace(settings.Mode)
	switch mode {
	case "off", "observe", "enforce":
		settings.Mode = mode
	default:
		settings.Mode = "off"
	}
	settings.Notes = strings.TrimSpace(settings.Notes)
	settings.AlertThresholds = normalizeUsagePolicyAlertThresholds(settings.AlertThresholds)
	return settings
}

func normalizeUsagePolicyAlertThresholds(values []float64) []float64 {
	if len(values) == 0 {
		return []float64{80, 100}
	}
	out := make([]float64, 0, len(values))
	seen := map[float64]struct{}{}
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func validateUsagePolicySettings(settings UsagePolicySettings) error {
	if settings.Mode != "off" && settings.Mode != "observe" && settings.Mode != "enforce" {
		return ErrInvalidUsagePolicySettings
	}
	floatValues := []float64{
		settings.DefaultUsageCreditLimit,
		settings.DefaultMonthlyCreditLimit,
		settings.DefaultDailyCreditLimit,
		settings.Gateway.MaxEstimatedCostPerCall,
	}
	for _, value := range floatValues {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return ErrInvalidUsagePolicySettings
		}
	}
	if settings.Gateway.MaxRequestsPerMinute < 0 || settings.Gateway.MaxConcurrentRequests < 0 {
		return ErrInvalidUsagePolicySettings
	}
	for _, threshold := range settings.AlertThresholds {
		if math.IsNaN(threshold) || math.IsInf(threshold, 0) || threshold < 0 || threshold > 100 {
			return ErrInvalidUsagePolicySettings
		}
	}
	return nil
}

func normalizeGenerationToolServers(servers []GenerationToolServer, scope string) []GenerationToolServer {
	scope = strings.TrimSpace(scope)
	if scope != "org" {
		scope = "admin"
	}
	out := make([]GenerationToolServer, 0, len(servers))
	seen := map[string]bool{}
	for i, server := range servers {
		out = append(out, normalizeGenerationToolServer(server, scope, i, seen))
	}
	return out
}

func normalizeGenerationToolServer(server GenerationToolServer, scope string, index int, seen map[string]bool) GenerationToolServer {
	server.Scope = scope
	server.Type = strings.TrimSpace(strings.ToLower(server.Type))
	if server.Type == "" {
		server.Type = "comfyui"
	}
	server.Name = strings.TrimSpace(server.Name)
	if server.Name == "" {
		if server.Type == "webui" {
			server.Name = "Stable Diffusion WebUI"
		} else {
			server.Name = "ComfyUI"
		}
	}
	server.ID = strings.TrimSpace(server.ID)
	if server.ID == "" || seen[server.ID] {
		serverType := server.Type
		if serverType != "webui" {
			serverType = "comfyui"
		}
		server.ID = generationToolServerID(scope, serverType, index)
	}
	seen[server.ID] = true
	server.BaseURL = strings.TrimRight(strings.TrimSpace(server.BaseURL), "/")
	server.Username = strings.TrimSpace(server.Username)
	if server.TimeoutMS == 0 {
		server.TimeoutMS = 120000
	}
	if server.AuthKind == "" {
		server.AuthKind = "none"
	} else {
		server.AuthKind = strings.TrimSpace(strings.ToLower(server.AuthKind))
	}
	server.Tags = normalizeGenerationToolTags(server.Tags)
	server.PasswordSet = server.Password != ""
	server.TokenSet = server.Token != ""
	return server
}

func normalizeGenerationToolTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	out := make([]string, 0, len(tags))
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func normalizeDefaultGenerationToolServerID(id string, servers []GenerationToolServer) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	for _, server := range servers {
		if server.ID == id && server.Enabled {
			return id
		}
	}
	return ""
}

func normalizeDefaultGenerationToolServerIDs(defaults map[string]string, legacyDefaultID string, servers []GenerationToolServer) map[string]string {
	out := map[string]string{}
	for _, serverType := range []string{"comfyui", "webui"} {
		id := strings.TrimSpace(defaults[serverType])
		if id != "" && generationToolServerIDIsEnabledForType(id, serverType, servers) {
			out[serverType] = id
		}
	}
	legacyDefaultID = strings.TrimSpace(legacyDefaultID)
	if legacyDefaultID != "" {
		for _, server := range servers {
			if server.ID == legacyDefaultID && server.Enabled {
				if _, exists := out[server.Type]; !exists {
					out[server.Type] = server.ID
				}
				break
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func generationToolServerIDIsEnabledForType(id string, serverType string, servers []GenerationToolServer) bool {
	for _, server := range servers {
		if server.ID == id && server.Type == serverType && server.Enabled {
			return true
		}
	}
	return false
}

func generationToolServerID(scope string, serverType string, index int) string {
	return fmt.Sprintf("%s-%s-%d", scope, serverType, index+1)
}

func preserveGenerationToolSecrets(settings GenerationToolsSettings, current GenerationToolsSettings) GenerationToolsSettings {
	currentByID := make(map[string]GenerationToolServer, len(current.Servers))
	for _, server := range current.Servers {
		currentByID[server.ID] = server
	}
	for i := range settings.Servers {
		switch settings.Servers[i].AuthKind {
		case "basic":
			settings.Servers[i].Token = ""
		case "bearer":
			settings.Servers[i].Password = ""
		default:
			settings.Servers[i].Password = ""
			settings.Servers[i].Token = ""
			continue
		}
		currentServer, ok := currentByID[settings.Servers[i].ID]
		if !ok {
			continue
		}
		if settings.Servers[i].AuthKind == "basic" && currentServer.AuthKind == "basic" && settings.Servers[i].Password == "" {
			settings.Servers[i].Password = currentServer.Password
		}
		if settings.Servers[i].AuthKind == "bearer" && currentServer.AuthKind == "bearer" && settings.Servers[i].Token == "" {
			settings.Servers[i].Token = currentServer.Token
		}
	}
	return settings
}

func validateGenerationToolsSettings(settings GenerationToolsSettings) error {
	for _, server := range settings.Servers {
		if server.Type != "comfyui" && server.Type != "webui" {
			return ErrInvalidGenerationToolsSettings
		}
		if server.AuthKind != "none" && server.AuthKind != "basic" && server.AuthKind != "bearer" {
			return ErrInvalidGenerationToolsSettings
		}
		if server.TimeoutMS < 1000 || server.TimeoutMS > 600000 {
			return ErrInvalidGenerationToolsSettings
		}
		if server.Enabled && !isValidHTTPBaseURL(server.BaseURL) {
			return ErrInvalidGenerationToolsSettings
		}
		if server.AuthKind == "basic" && server.Username == "" && server.Password != "" {
			return ErrInvalidGenerationToolsSettings
		}
	}
	return nil
}

func normalizeProviderAssetOpenAPIBaseURL(value string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(value), "/")
	if baseURL == "" {
		return "https://ark.cn-beijing.volcengineapi.com"
	}
	return baseURL
}

func normalizeProviderAssetArkRegion(value string) string {
	region := strings.TrimSpace(value)
	if region == "" {
		return "cn-beijing"
	}
	return region
}

func normalizeProviderAssetGroups(value map[string]ProviderAssetGroupState) map[string]ProviderAssetGroupState {
	if len(value) == 0 {
		return nil
	}
	out := make(map[string]ProviderAssetGroupState, len(value))
	for scope, group := range value {
		scope = normalizeProviderAssetGroupScope(scope)
		group.ID = strings.TrimSpace(group.ID)
		if group.ID == "" {
			continue
		}
		group.Name = strings.TrimSpace(group.Name)
		group.Scope = scope
		group.ProjectName = strings.TrimSpace(group.ProjectName)
		group.SettingID = strings.TrimSpace(group.SettingID)
		group.CreatedAt = strings.TrimSpace(group.CreatedAt)
		group.UpdatedAt = strings.TrimSpace(group.UpdatedAt)
		out[scope] = group
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeProviderAssetGroupScope(scope string) string {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return "global"
	}
	return scope
}

func normalizeResourceAccessProfiles(values []ResourceAccessProfile) []ResourceAccessProfile {
	out := make([]ResourceAccessProfile, 0, len(values))
	seen := map[string]struct{}{}
	for _, profile := range values {
		profile.ID = normalizeResourceAccessProfileID(profile.ID)
		if profile.ID == "" {
			continue
		}
		if _, exists := seen[profile.ID]; exists {
			continue
		}
		seen[profile.ID] = struct{}{}
		profile.Name = strings.TrimSpace(profile.Name)
		profile.Mode = normalizeResourceAccessMode(profile.Mode)
		profile.PublicBaseURL = strings.TrimRight(strings.TrimSpace(profile.PublicBaseURL), "/")
		profile.InternalBaseURL = strings.TrimRight(strings.TrimSpace(profile.InternalBaseURL), "/")
		profile.SigningSecret = strings.TrimSpace(profile.SigningSecret)
		profile.SigningSecretSet = profile.SigningSecret != ""
		if profile.ExpiresSeconds <= 0 {
			profile.ExpiresSeconds = 3600
		}
		if profile.ExpiresSeconds < 60 {
			profile.ExpiresSeconds = 60
		}
		profile.HealthCheckPath = normalizeResourceAccessHealthPath(profile.HealthCheckPath)
		out = append(out, profile)
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func normalizeResourceAccessProfileID(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, " ", "-")
	value = strings.ToLower(value)
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-_")
}

func normalizeResourceAccessMode(value string) string {
	switch strings.TrimSpace(value) {
	case "public_tunnel", "public_backend", "object_relay", "provider_files", "provider_asset_uri":
		return strings.TrimSpace(value)
	default:
		return "public_tunnel"
	}
}

func normalizeResourceAccessHealthPath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "/api/v1/resource-access/health"
	}
	if !strings.HasPrefix(value, "/") {
		value = "/" + value
	}
	return value
}

func normalizeResourceAccessDefaultProfileID(value string, profiles []ResourceAccessProfile) string {
	value = normalizeResourceAccessProfileID(value)
	for _, profile := range profiles {
		if profile.ID == value {
			return value
		}
	}
	for _, profile := range profiles {
		if profile.Enabled {
			return profile.ID
		}
	}
	if len(profiles) > 0 {
		return profiles[0].ID
	}
	return ""
}

func preserveResourceAccessSecrets(next []ResourceAccessProfile, current []ResourceAccessProfile) []ResourceAccessProfile {
	secrets := map[string]string{}
	for _, profile := range current {
		if profile.SigningSecret != "" {
			secrets[profile.ID] = profile.SigningSecret
		}
	}
	for i := range next {
		if next[i].SigningSecret == "" && secrets[next[i].ID] != "" {
			next[i].SigningSecret = secrets[next[i].ID]
			next[i].SigningSecretSet = true
		}
	}
	return next
}

func isValidHTTPBaseURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}

func validateProviderAssetSettings(settings ProviderAssetSettings) error {
	if !isValidHTTPBaseURL(settings.ArkOpenAPIBaseURL) {
		return ErrInvalidProviderAssetSettings
	}
	return nil
}

func validateResourceAccessSettings(settings ResourceAccessSettings) error {
	for _, profile := range settings.Profiles {
		switch profile.Mode {
		case "public_tunnel", "public_backend", "object_relay":
			if profile.PublicBaseURL == "" || !isValidHTTPBaseURL(profile.PublicBaseURL) {
				return ErrInvalidResourceAccessSettings
			}
		case "provider_files", "provider_asset_uri":
		default:
			return ErrInvalidResourceAccessSettings
		}
		if profile.InternalBaseURL != "" && !isValidHTTPBaseURL(profile.InternalBaseURL) {
			return ErrInvalidResourceAccessSettings
		}
		if profile.SigningEnabled && strings.TrimSpace(profile.SigningSecret) == "" {
			return ErrInvalidResourceAccessSettings
		}
	}
	return nil
}
