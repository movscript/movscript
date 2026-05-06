package ai

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ReservationStatusReserved = "reserved"
	ReservationStatusSettled  = "settled"
	ReservationStatusReleased = "released"
)

var ErrInsufficientQuota = errors.New("insufficient quota")

func lockingUpdate() clause.Locking {
	return clause.Locking{Strength: "UPDATE"}
}

type BillingContext struct {
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

func (s *AIService) ReserveQuota(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, billing BillingContext) (*model.UsageReservation, error) {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if estimate.Cost <= 0 {
		reservation := model.UsageReservation{
			UserID:          userID,
			OrgID:           billing.OrgID,
			AIModelConfigID: modelConfigID,
			GatewayAPIKeyID: billing.GatewayAPIKeyID,
			ProjectID:       billing.ProjectID,
			JobID:           billing.JobID,
			OperationType:   estimate.OperationType,
			EstimatedCost:   0,
			Status:          ReservationStatusReserved,
		}
		if err := s.db.WithContext(ctx).Create(&reservation).Error; err != nil {
			return nil, err
		}
		return &reservation, nil
	}

	var reservation model.UsageReservation
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.reserveSpend(tx, userID, billing.OrgID, estimate.Cost, "estimated cost"); err != nil {
			return err
		}
		reservation = model.UsageReservation{
			UserID:          userID,
			OrgID:           billing.OrgID,
			AIModelConfigID: modelConfigID,
			GatewayAPIKeyID: billing.GatewayAPIKeyID,
			ProjectID:       billing.ProjectID,
			JobID:           billing.JobID,
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
	return s.db.WithContext(ctx).Model(&model.UsageReservation{}).
		Where("id = ? AND status = ?", reservationID, ReservationStatusReserved).
		Update("job_id", jobID).Error
}

func (s *AIService) ReleaseReservation(ctx context.Context, reservationID uint, reason string) error {
	if reservationID == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var reservation model.UsageReservation
		if err := tx.Clauses(lockingUpdate()).First(&reservation, reservationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if reservation.Status != ReservationStatusReserved {
			return nil
		}
		if reservation.EstimatedCost > 0 && !s.usesOrgBudget(tx, reservation.OrgID) {
			if err := tx.Model(&model.UserQuota{}).
				Where("user_id = ?", reservation.UserID).
				UpdateColumn("balance", gorm.Expr("balance + ?", reservation.EstimatedCost)).Error; err != nil {
				return err
			}
		}
		return tx.Model(&reservation).Updates(map[string]any{
			"status":         ReservationStatusReleased,
			"release_reason": reason,
			"updated_at":     time.Now(),
		}).Error
	})
}

func (s *AIService) settleUsage(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, billing BillingContext) error {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if billing.ReservationID == nil || *billing.ReservationID == 0 {
		return s.logUsage(ctx, userID, modelConfigID, estimate, billing, nil)
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var reservation model.UsageReservation
		if err := tx.Clauses(lockingUpdate()).First(&reservation, *billing.ReservationID).Error; err != nil {
			return err
		}
		if reservation.Status != ReservationStatusReserved {
			return nil
		}
		diff := estimate.Cost - reservation.EstimatedCost
		if diff > 0 {
			if err := s.reserveSpend(tx, userID, firstUint(billing.OrgID, reservation.OrgID), diff, "additional actual cost"); err != nil {
				return err
			}
		} else if diff < 0 && !s.usesOrgBudget(tx, firstUint(billing.OrgID, reservation.OrgID)) {
			if err := tx.Model(&model.UserQuota{}).
				Where("user_id = ?", userID).
				UpdateColumn("balance", gorm.Expr("balance + ?", -diff)).Error; err != nil {
				return err
			}
		}
		entry := model.UsageLog{
			UserID:             userID,
			OrgID:              firstUint(billing.OrgID, reservation.OrgID),
			AIModelConfigID:    modelConfigID,
			UsageReservationID: billing.ReservationID,
			GatewayAPIKeyID:    billing.GatewayAPIKeyID,
			ProjectID:          billing.ProjectID,
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
			"status":       ReservationStatusSettled,
			"actual_cost":  estimate.Cost,
			"usage_log_id": entry.ID,
			"updated_at":   time.Now(),
		}).Error
	})
}

func (s *AIService) logUsage(ctx context.Context, userID, modelConfigID uint, estimate UsageEstimate, billing BillingContext, reservationID *uint) error {
	entry := model.UsageLog{
		UserID:             userID,
		OrgID:              billing.OrgID,
		AIModelConfigID:    modelConfigID,
		UsageReservationID: reservationID,
		GatewayAPIKeyID:    billing.GatewayAPIKeyID,
		ProjectID:          billing.ProjectID,
		OperationType:      estimate.OperationType,
		InputTokens:        estimate.InputTokens,
		OutputTokens:       estimate.OutputTokens,
		DurationSec:        estimate.DurationSec,
		ImageCount:         estimate.ImageCount,
		Cost:               estimate.Cost,
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if estimate.Cost > 0 {
			if err := s.reserveSpend(tx, userID, billing.OrgID, estimate.Cost, "cost"); err != nil {
				return err
			}
		}
		return tx.Create(&entry).Error
	})
}

func (s *AIService) reserveSpend(tx *gorm.DB, userID uint, orgID *uint, cost float64, label string) error {
	if cost <= 0 {
		return nil
	}
	if err := s.enforceOrgStatus(tx, orgID); err != nil {
		return err
	}
	if s.usesOrgBudget(tx, orgID) {
		return s.enforceOrgMonthlyBudget(tx, *orgID, cost, label)
	}
	var quota model.UserQuota
	if err := tx.Clauses(lockingUpdate()).Where("user_id = ?", userID).First(&quota).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: balance 0.0000 is below %s %.4f", ErrInsufficientQuota, label, cost)
		}
		return err
	}
	if quota.Balance < cost {
		return fmt.Errorf("%w: balance %.4f is below %s %.4f", ErrInsufficientQuota, quota.Balance, label, cost)
	}
	return tx.Model(&quota).UpdateColumn("balance", gorm.Expr("balance - ?", cost)).Error
}

func (s *AIService) usesOrgBudget(tx *gorm.DB, orgID *uint) bool {
	if orgID == nil {
		return false
	}
	var org model.Organization
	if err := tx.Select("is_personal, status").First(&org, *orgID).Error; err != nil {
		return false
	}
	return !org.IsPersonal
}

func (s *AIService) enforceOrgStatus(tx *gorm.DB, orgID *uint) error {
	if orgID == nil {
		return nil
	}
	var org model.Organization
	if err := tx.Select("is_personal, status").First(&org, *orgID).Error; err != nil {
		return nil
	}
	if org.IsPersonal {
		return nil
	}
	switch org.Status {
	case "", "active", "trialing":
		return nil
	case "past_due", "suspended":
		return fmt.Errorf("%w: org status %s blocks AI usage", ErrInsufficientQuota, org.Status)
	default:
		return fmt.Errorf("%w: org status %s is not allowed", ErrInsufficientQuota, org.Status)
	}
}

func (s *AIService) enforceOrgMonthlyBudget(tx *gorm.DB, orgID uint, cost float64, label string) error {
	var quota model.OrgQuota
	if err := tx.Clauses(lockingUpdate()).Where("org_id = ?", orgID).First(&quota).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if quota.MonthlyBudget <= 0 {
		return nil
	}
	spent, err := s.orgMonthSpend(tx, orgID)
	if err != nil {
		return err
	}
	if spent+cost > quota.MonthlyBudget {
		return fmt.Errorf("%w: org monthly spend %.4f plus %s %.4f exceeds %.4f", ErrInsufficientQuota, spent, label, cost, quota.MonthlyBudget)
	}
	return nil
}

func (s *AIService) orgMonthSpend(tx *gorm.DB, orgID uint) (float64, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var usageTotal float64
	if err := tx.Model(&model.UsageLog{}).
		Where("org_id = ? AND created_at >= ?", orgID, monthStart).
		Select("COALESCE(SUM(cost), 0)").Scan(&usageTotal).Error; err != nil {
		return 0, err
	}
	var reservedTotal float64
	if err := tx.Model(&model.UsageReservation{}).
		Where("org_id = ? AND status = ? AND created_at >= ?", orgID, ReservationStatusReserved, monthStart).
		Select("COALESCE(SUM(estimated_cost), 0)").Scan(&reservedTotal).Error; err != nil {
		return 0, err
	}
	return usageTotal + reservedTotal, nil
}

func estimateUsageCost(cfg model.AIModelConfig, def *ModelDef, opType string, inputTokens, outputTokens, durationSec, imageCount int) UsageEstimate {
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
