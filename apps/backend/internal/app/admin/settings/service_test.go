package settings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestSystemHealthThresholdsDefaultUpdateAndValidation(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-settings.db", &persistencemodel.AdminSetting{})
	service := NewService(db)

	defaults, err := service.SystemHealthThresholds(context.Background())
	if err != nil {
		t.Fatalf("SystemHealthThresholds default returned error: %v", err)
	}
	if defaults.ErrorRateWarn != 5 || defaults.FailedJobsWarn != 1 || defaults.SlowRequestsWarn != 5 {
		t.Fatalf("unexpected defaults: %#v", defaults)
	}

	updated, err := service.UpdateSystemHealthThresholds(context.Background(), SystemHealthThresholds{
		ErrorRateWarn:        3,
		ErrorRateCritical:    15,
		FailedJobsWarn:       2,
		FailedJobsCritical:   8,
		SlowRequestsWarn:     4,
		SlowRequestsCritical: 12,
	})
	if err != nil {
		t.Fatalf("UpdateSystemHealthThresholds returned error: %v", err)
	}
	if updated.ErrorRateWarn != 3 || updated.FailedJobsCritical != 8 {
		t.Fatalf("unexpected update response: %#v", updated)
	}
	loaded, err := service.SystemHealthThresholds(context.Background())
	if err != nil {
		t.Fatalf("SystemHealthThresholds loaded returned error: %v", err)
	}
	if loaded != updated {
		t.Fatalf("loaded thresholds = %#v, want %#v", loaded, updated)
	}

	_, err = service.UpdateSystemHealthThresholds(context.Background(), SystemHealthThresholds{
		ErrorRateWarn:     30,
		ErrorRateCritical: 10,
	})
	if !errors.Is(err, ErrInvalidSystemHealthThresholds) {
		t.Fatalf("invalid thresholds error = %v, want ErrInvalidSystemHealthThresholds", err)
	}
}

func TestAuthSettingsDefaultUpdateEncryptionAndMasking(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-auth-settings.db", &persistencemodel.AdminSetting{})
	service := NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

	defaults, err := service.AuthSettings(context.Background())
	if err != nil {
		t.Fatalf("AuthSettings default returned error: %v", err)
	}
	if defaults.RegistrationEnabled || !defaults.RequireEmailVerification || defaults.Email.Port != 587 || !defaults.Email.UseStartTLS {
		t.Fatalf("unexpected auth defaults: %#v", defaults)
	}

	updated, err := service.UpdateAuthSettings(context.Background(), AuthSettings{
		RegistrationEnabled:      true,
		RequireEmailVerification: true,
		Email: SMTPMailSettings{
			Enabled:     true,
			Host:        " smtp.example.com ",
			Port:        587,
			Username:    " mailer ",
			Password:    "smtp-secret",
			FromEmail:   " noreply@example.com ",
			FromName:    " Movscript ",
			UseStartTLS: true,
		},
	})
	if err != nil {
		t.Fatalf("UpdateAuthSettings returned error: %v", err)
	}
	if updated.Email.Password != "" || !updated.Email.PasswordSet {
		t.Fatalf("update response did not mask password: %#v", updated.Email)
	}

	var record persistencemodel.AdminSetting
	if err := db.Where("key = ?", AuthSettingsKey).First(&record).Error; err != nil {
		t.Fatalf("load stored auth settings: %v", err)
	}
	if record.ValueJSON == "" || json.Valid([]byte(record.ValueJSON)) == false {
		t.Fatalf("stored auth settings are not valid json: %q", record.ValueJSON)
	}
	if strings.Contains(record.ValueJSON, "smtp-secret") {
		t.Fatalf("stored auth settings leaked plaintext password: %s", record.ValueJSON)
	}

	loaded, err := service.AuthSettings(context.Background())
	if err != nil {
		t.Fatalf("AuthSettings loaded returned error: %v", err)
	}
	if loaded.Email.Password != "smtp-secret" || !loaded.Email.PasswordSet {
		t.Fatalf("loaded auth settings did not decrypt password: %#v", loaded.Email)
	}

	publicSettings, err := service.PublicAuthSettings(context.Background())
	if err != nil {
		t.Fatalf("PublicAuthSettings returned error: %v", err)
	}
	if publicSettings.Email.Password != "" || !publicSettings.Email.PasswordSet {
		t.Fatalf("public auth settings did not mask password: %#v", publicSettings.Email)
	}
}

func TestAuthSettingsValidation(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-auth-settings-validation.db", &persistencemodel.AdminSetting{})
	service := NewService(db)

	tests := []struct {
		name     string
		settings AuthSettings
	}{
		{
			name: "open registration without verification",
			settings: AuthSettings{
				RegistrationEnabled:      true,
				RequireEmailVerification: false,
				Email: SMTPMailSettings{
					Enabled:     true,
					Host:        "smtp.example.com",
					Port:        587,
					FromEmail:   "noreply@example.com",
					UseStartTLS: true,
				},
			},
		},
		{
			name: "open registration without email sending",
			settings: AuthSettings{
				RegistrationEnabled:      true,
				RequireEmailVerification: true,
				Email:                    SMTPMailSettings{Enabled: false},
			},
		},
		{
			name: "email sending without smtp host",
			settings: AuthSettings{
				RegistrationEnabled:      false,
				RequireEmailVerification: true,
				Email: SMTPMailSettings{
					Enabled:     true,
					Port:        587,
					FromEmail:   "noreply@example.com",
					UseStartTLS: true,
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.UpdateAuthSettings(context.Background(), tt.settings)
			if !errors.Is(err, ErrInvalidAuthSettings) {
				t.Fatalf("UpdateAuthSettings error = %v, want ErrInvalidAuthSettings", err)
			}
		})
	}
}
