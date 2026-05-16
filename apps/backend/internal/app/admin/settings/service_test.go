package settings

import (
	"context"
	"errors"
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
