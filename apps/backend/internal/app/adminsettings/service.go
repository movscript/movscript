package adminsettings

import (
	"context"
	"encoding/json"
	"errors"
	"math"

	"gorm.io/gorm"
)

const SystemHealthThresholdsKey = "system_health_thresholds"

var ErrInvalidSystemHealthThresholds = errors.New("invalid system health thresholds")

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
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
