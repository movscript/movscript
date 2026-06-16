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

	"github.com/movscript/movscript/internal/infra/crypto"
	"github.com/movscript/movscript/internal/infra/mail"
	"gorm.io/gorm"
)

const SystemHealthThresholdsKey = "system_health_thresholds"
const AuthSettingsKey = "auth_settings"
const GenerationToolsSettingsKey = "generation_tools_settings"
const OrgGenerationToolsSettingsKeyPrefix = "generation_tools_settings:org:"

var ErrInvalidSystemHealthThresholds = errors.New("invalid system health thresholds")
var ErrInvalidAuthSettings = errors.New("invalid auth settings")
var ErrInvalidGenerationToolsSettings = errors.New("invalid generation tools settings")

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

type AuthSettings struct {
	RegistrationEnabled      bool              `json:"registration_enabled"`
	RequireEmailVerification bool              `json:"require_email_verification"`
	Email                    SMTPMailSettings  `json:"email"`
	Turnstile                TurnstileSettings `json:"turnstile"`
}

type SMTPMailSettings struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	PasswordSet bool   `json:"password_set"`
	FromEmail   string `json:"from_email"`
	FromName    string `json:"from_name,omitempty"`
	UseTLS      bool   `json:"use_tls"`
	UseStartTLS bool   `json:"use_start_tls"`
}

type TurnstileSettings struct {
	Enabled      bool   `json:"enabled"`
	SiteKey      string `json:"site_key,omitempty"`
	SecretKey    string `json:"secret_key,omitempty"`
	SecretKeySet bool   `json:"secret_key_set"`
}

type authSettingsStored struct {
	RegistrationEnabled      bool              `json:"registration_enabled"`
	RequireEmailVerification bool              `json:"require_email_verification"`
	Email                    SMTPMailSettings  `json:"email"`
	Turnstile                TurnstileSettings `json:"turnstile"`
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

func DefaultAuthSettings() AuthSettings {
	return AuthSettings{
		RegistrationEnabled:      false,
		RequireEmailVerification: true,
		Email: SMTPMailSettings{
			Port:        587,
			FromName:    "Movscript",
			UseStartTLS: true,
		},
		Turnstile: TurnstileSettings{},
	}
}

func DefaultGenerationToolsSettings() GenerationToolsSettings {
	return GenerationToolsSettings{
		Servers:    []GenerationToolServer{},
		AllowLocal: true,
	}
}

func OrgGenerationToolsSettingsKey(orgID uint) string {
	return fmt.Sprintf("%s%d", OrgGenerationToolsSettingsKeyPrefix, orgID)
}

func (s *Service) AuthSettings(ctx context.Context) (AuthSettings, error) {
	settings := DefaultAuthSettings()
	record, err := s.repo.Get(ctx, AuthSettingsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	var stored authSettingsStored
	if err := json.Unmarshal([]byte(record.ValueJSON), &stored); err != nil {
		return settings, nil
	}
	settings.RegistrationEnabled = stored.RegistrationEnabled
	settings.RequireEmailVerification = stored.RequireEmailVerification
	settings.Email = normalizeSMTPMailSettings(stored.Email)
	settings.Turnstile = normalizeTurnstileSettings(stored.Turnstile)
	if settings.Email.Password != "" && len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(settings.Email.Password, s.encryptionKey); err == nil {
			settings.Email.Password = plain
		}
	}
	settings.Email.PasswordSet = settings.Email.Password != ""
	if settings.Turnstile.SecretKey != "" && len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(settings.Turnstile.SecretKey, s.encryptionKey); err == nil {
			settings.Turnstile.SecretKey = plain
		}
	}
	settings.Turnstile.SecretKeySet = settings.Turnstile.SecretKey != ""
	return settings, nil
}

func (s *Service) PublicAuthSettings(ctx context.Context) (AuthSettings, error) {
	settings, err := s.AuthSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.Email.Password = ""
	settings.Turnstile.SecretKey = ""
	return settings, nil
}

func (s *Service) UpdateAuthSettings(ctx context.Context, settings AuthSettings) (AuthSettings, error) {
	current, err := s.AuthSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.Email = normalizeSMTPMailSettings(settings.Email)
	if settings.Email.Password == "" && current.Email.Password != "" {
		settings.Email.Password = current.Email.Password
	}
	settings.Turnstile = normalizeTurnstileSettings(settings.Turnstile)
	if settings.Turnstile.SecretKey == "" && current.Turnstile.SecretKey != "" {
		settings.Turnstile.SecretKey = current.Turnstile.SecretKey
	}
	if err := validateAuthSettings(settings); err != nil {
		return settings, err
	}
	stored := authSettingsStored{
		RegistrationEnabled:      settings.RegistrationEnabled,
		RequireEmailVerification: settings.RequireEmailVerification,
		Email:                    settings.Email,
		Turnstile:                settings.Turnstile,
	}
	if stored.Email.Password != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(stored.Email.Password, s.encryptionKey)
		if err != nil {
			return settings, err
		}
		stored.Email.Password = encrypted
	}
	if stored.Turnstile.SecretKey != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(stored.Turnstile.SecretKey, s.encryptionKey)
		if err != nil {
			return settings, err
		}
		stored.Turnstile.SecretKey = encrypted
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return settings, err
	}
	if err := s.repo.Save(ctx, settingRecord{Key: AuthSettingsKey, ValueJSON: string(raw)}); err != nil {
		return settings, err
	}
	settings.Email.PasswordSet = settings.Email.Password != ""
	settings.Email.Password = ""
	settings.Turnstile.SecretKeySet = settings.Turnstile.SecretKey != ""
	settings.Turnstile.SecretKey = ""
	return settings, nil
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

func (settings AuthSettings) SMTPConfig() mail.SMTPConfig {
	return mail.SMTPConfig{
		Host:        settings.Email.Host,
		Port:        settings.Email.Port,
		Username:    settings.Email.Username,
		Password:    settings.Email.Password,
		FromEmail:   settings.Email.FromEmail,
		FromName:    settings.Email.FromName,
		UseTLS:      settings.Email.UseTLS,
		UseStartTLS: settings.Email.UseStartTLS,
	}
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

func normalizeSMTPMailSettings(settings SMTPMailSettings) SMTPMailSettings {
	settings.Host = strings.TrimSpace(settings.Host)
	settings.Username = strings.TrimSpace(settings.Username)
	settings.FromEmail = strings.TrimSpace(settings.FromEmail)
	settings.FromName = strings.TrimSpace(settings.FromName)
	if settings.Port == 0 {
		settings.Port = 587
	}
	if !settings.UseTLS && !settings.UseStartTLS {
		settings.UseStartTLS = true
	}
	settings.PasswordSet = settings.Password != ""
	return settings
}

func normalizeTurnstileSettings(settings TurnstileSettings) TurnstileSettings {
	settings.SiteKey = strings.TrimSpace(settings.SiteKey)
	settings.SecretKey = strings.TrimSpace(settings.SecretKey)
	settings.SecretKeySet = settings.SecretKey != ""
	return settings
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

func isValidHTTPBaseURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}

func validateAuthSettings(settings AuthSettings) error {
	if settings.RegistrationEnabled {
		if !settings.RequireEmailVerification || !settings.Email.Enabled {
			return ErrInvalidAuthSettings
		}
		if err := mail.ValidateSMTPConfig(settings.SMTPConfig()); err != nil {
			return ErrInvalidAuthSettings
		}
	}
	if settings.Email.Enabled {
		if err := mail.ValidateSMTPConfig(settings.SMTPConfig()); err != nil {
			return ErrInvalidAuthSettings
		}
	}
	if settings.Turnstile.Enabled && (settings.Turnstile.SiteKey == "" || settings.Turnstile.SecretKey == "") {
		return ErrInvalidAuthSettings
	}
	return nil
}
