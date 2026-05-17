package ai

import (
	"context"
	"errors"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

const (
	ReservationStatusReserved = "reserved"
	ReservationStatusSettled  = "settled"
	ReservationStatusReleased = "released"
)

var ErrUsageLimitExceeded = errors.New("usage limit exceeded")

func lockingUpdate() clause.Locking {
	return clause.Locking{Strength: "UPDATE"}
}

type UsageContext struct {
	OrgID           *uint
	ProjectID       *uint
	GatewayAPIKeyID *uint
	JobID           *uint
	ReservationID   *uint
}

type UsageEstimate struct {
	OperationType string
	InputTokens   int
	OutputTokens  int
	DurationSec   int
	ImageCount    int
	Cost          float64
}

func (s *AIService) EstimateTextCost(modelConfigID uint, req TextRequest) (UsageEstimate, error) {
	cfg, _, def, err := s.loadConfig(modelConfigID, CapabilityText)
	if err != nil {
		return UsageEstimate{}, err
	}
	inputTokens := estimateTextInputTokens(req)
	outputTokens := maxPositive(req.MaxTokens, 1024)
	return estimateUsageCost(cfg, def, "text", inputTokens, outputTokens, 0, 1), nil
}

func (s *AIService) EstimateImageCost(modelConfigID uint, req ImageRequest) (UsageEstimate, error) {
	cfg, _, def, err := s.loadConfig(modelConfigID, CapabilityImage)
	if err != nil {
		var err2 error
		cfg, _, def, err2 = s.loadConfig(modelConfigID, CapabilityImageEdit)
		if err2 != nil {
			return UsageEstimate{}, err
		}
	}
	n := req.N
	if n <= 0 {
		n = 1
	}
	return estimateUsageCost(cfg, def, "image", 0, 0, 0, n), nil
}

func (s *AIService) EstimateVideoCost(modelConfigID uint, req VideoRequest) (UsageEstimate, error) {
	cfg, _, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return UsageEstimate{}, err
	}
	duration := req.Duration
	if duration <= 0 {
		duration = def.DefaultDurSec
	}
	if duration <= 0 {
		duration = 1
	}
	return estimateUsageCost(cfg, def, "video", 0, 0, duration, 1), nil
}

func (s *AIService) ReserveUsage(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, usage UsageContext) (*persistencemodel.UsageReservation, error) {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if estimate.Cost <= 0 {
		reservation := persistencemodel.UsageReservation{
			UserID:          userID,
			OrgID:           usage.OrgID,
			AIModelConfigID: modelConfigID,
			GatewayAPIKeyID: usage.GatewayAPIKeyID,
			ProjectID:       usage.ProjectID,
			JobID:           usage.JobID,
			OperationType:   estimate.OperationType,
			EstimatedCost:   0,
			Status:          ReservationStatusReserved,
		}
		if err := s.db.WithContext(ctx).Create(&reservation).Error; err != nil {
			return nil, err
		}
		return &reservation, nil
	}

	var reservation persistencemodel.UsageReservation
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.reserveUsageLimit(tx, userID, usage.OrgID, estimate.Cost, "estimated cost"); err != nil {
			return err
		}
		reservation = persistencemodel.UsageReservation{
			UserID:          userID,
			OrgID:           usage.OrgID,
			AIModelConfigID: modelConfigID,
			GatewayAPIKeyID: usage.GatewayAPIKeyID,
			ProjectID:       usage.ProjectID,
			JobID:           usage.JobID,
			OperationType:   estimate.OperationType,
			EstimatedCost:   estimate.Cost,
			Status:          ReservationStatusReserved,
		}
		return tx.Create(&reservation).Error
	})
	if err != nil {
		return nil, err
	}
	return &reservation, nil
}

func (s *AIService) SetReservationJob(ctx context.Context, reservationID, jobID uint) error {
	return s.db.WithContext(ctx).Model(&persistencemodel.UsageReservation{}).
		Where("id = ? AND status = ?", reservationID, ReservationStatusReserved).
		Update("job_id", jobID).Error
}

func (s *AIService) ReleaseReservation(ctx context.Context, reservationID uint, reason string) error {
	if reservationID == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var reservation persistencemodel.UsageReservation
		if err := tx.Clauses(lockingUpdate()).First(&reservation, reservationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if reservation.Status != ReservationStatusReserved {
			return nil
		}
		if err := s.releaseReservedUsageLimit(tx, reservation); err != nil {
			return err
		}
		return tx.Model(&reservation).Updates(map[string]any{
			"status":         ReservationStatusReleased,
			"release_reason": reason,
			"updated_at":     time.Now(),
		}).Error
	})
}

func (s *AIService) settleUsage(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, usage UsageContext) error {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if usage.ReservationID == nil || *usage.ReservationID == 0 {
		return s.logUsage(ctx, userID, modelConfigID, estimate, usage, nil)
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var reservation persistencemodel.UsageReservation
		if err := tx.Clauses(lockingUpdate()).First(&reservation, *usage.ReservationID).Error; err != nil {
			return err
		}
		if reservation.Status != ReservationStatusReserved {
			return nil
		}
		diff := estimate.Cost - reservation.EstimatedCost
		if diff > 0 {
			if err := s.reserveUsageLimit(tx, userID, firstUint(usage.OrgID, reservation.OrgID), diff, "additional actual cost"); err != nil {
				return err
			}
		} else if diff < 0 {
			if err := s.refundUsageLimit(tx, userID, firstUint(usage.OrgID, reservation.OrgID), -diff); err != nil {
				return err
			}
		}
		entry := persistencemodel.UsageLog{
			UserID:             userID,
			OrgID:              firstUint(usage.OrgID, reservation.OrgID),
			AIModelConfigID:    modelConfigID,
			UsageReservationID: usage.ReservationID,
			GatewayAPIKeyID:    usage.GatewayAPIKeyID,
			ProjectID:          usage.ProjectID,
			OperationType:      estimate.OperationType,
			InputTokens:        estimate.InputTokens,
			OutputTokens:       estimate.OutputTokens,
			DurationSec:        estimate.DurationSec,
			ImageCount:         estimate.ImageCount,
			Cost:               estimate.Cost,
		}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		return tx.Model(&reservation).Updates(map[string]any{
			"ai_model_config_id": modelConfigID,
			"status":             ReservationStatusSettled,
			"actual_cost":        estimate.Cost,
			"usage_log_id":       entry.ID,
			"updated_at":         time.Now(),
		}).Error
	})
}

func (s *AIService) logUsage(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, usage UsageContext, reservationID *uint) error {
	entry := persistencemodel.UsageLog{
		UserID:             userID,
		OrgID:              usage.OrgID,
		AIModelConfigID:    modelConfigID,
		UsageReservationID: reservationID,
		GatewayAPIKeyID:    usage.GatewayAPIKeyID,
		ProjectID:          usage.ProjectID,
		OperationType:      estimate.OperationType,
		InputTokens:        estimate.InputTokens,
		OutputTokens:       estimate.OutputTokens,
		DurationSec:        estimate.DurationSec,
		ImageCount:         estimate.ImageCount,
		Cost:               estimate.Cost,
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if estimate.Cost > 0 {
			if err := s.reserveUsageLimit(tx, userID, usage.OrgID, estimate.Cost, "cost"); err != nil {
				return err
			}
		}
		return tx.Create(&entry).Error
	})
}

func estimateUsageCost(cfg persistencemodel.AIModelConfig, def *ModelDef, opType string, inputTokens, outputTokens, durationSec, imageCount int) UsageEstimate {
	if imageCount <= 0 {
		imageCount = 1
	}
	return UsageEstimate{
		OperationType: opType,
		InputTokens:   inputTokens,
		OutputTokens:  outputTokens,
		DurationSec:   durationSec,
		ImageCount:    imageCount,
		Cost:          calcCost(cfg, def, inputTokens, outputTokens, durationSec, imageCount),
	}
}

func estimateTextInputTokens(req TextRequest) int {
	chars := 0
	for _, msg := range req.Messages {
		chars += len(msg.Role) + len(msg.Content)
		for _, tc := range msg.ToolCalls {
			chars += len(tc.ID) + len(tc.Type) + len(tc.Function.Name) + len(tc.Function.Arguments)
		}
	}
	chars += len(req.Tools)
	chars += len(req.ToolChoice)
	if chars <= 0 {
		return 1
	}
	return chars/4 + 1
}

func derefUint(value *uint) uint {
	if value == nil {
		return 0
	}
	return *value
}

func firstUint(values ...*uint) *uint {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func maxPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func positiveDuration(duration int, def *ModelDef) int {
	if duration > 0 {
		return duration
	}
	if def != nil && def.DefaultDurSec > 0 {
		return def.DefaultDurSec
	}
	return 1
}
