package settings

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"github.com/movscript/movscript/internal/infra/crypto"
	"github.com/movscript/movscript/internal/infra/mail"
	"gorm.io/gorm"
)

const SystemHealthThresholdsKey = "system_health_thresholds"
const AuthSettingsKey = "auth_settings"

var ErrInvalidSystemHealthThresholds = errors.New("invalid system health thresholds")
var ErrInvalidAuthSettings = errors.New("invalid auth settings")

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
	RegistrationEnabled      bool             `json:"registration_enabled"`
	RequireEmailVerification bool             `json:"require_email_verification"`
	Email                    SMTPMailSettings `json:"email"`
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

type authSettingsStored struct {
	RegistrationEnabled      bool             `json:"registration_enabled"`
	RequireEmailVerification bool             `json:"require_email_verification"`
	Email                    SMTPMailSettings `json:"email"`
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
	}
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
	if settings.Email.Password != "" && len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(settings.Email.Password, s.encryptionKey); err == nil {
			settings.Email.Password = plain
		}
	}
	settings.Email.PasswordSet = settings.Email.Password != ""
	return settings, nil
}

func (s *Service) PublicAuthSettings(ctx context.Context) (AuthSettings, error) {
	settings, err := s.AuthSettings(ctx)
	if err != nil {
		return settings, err
	}
	settings.Email.Password = ""
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
	if err := validateAuthSettings(settings); err != nil {
		return settings, err
	}
	stored := authSettingsStored{
		RegistrationEnabled:      settings.RegistrationEnabled,
		RequireEmailVerification: settings.RequireEmailVerification,
		Email:                    settings.Email,
	}
	if stored.Email.Password != "" && len(s.encryptionKey) > 0 {
		encrypted, err := crypto.Encrypt(stored.Email.Password, s.encryptionKey)
		if err != nil {
			return settings, err
		}
		stored.Email.Password = encrypted
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
	return nil
}
