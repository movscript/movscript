package ai

import (
	"context"
	"errors"
	"fmt"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
	OrgID                 *uint
	ProjectID             *uint
	GatewayAPIKeyID       *uint
	JobID                 *uint
	ReservationID         *uint
	AIModelCatalogEntryID *uint
	RouteBindingID        *uint
}

type UsageEstimate struct {
	OperationType     string
	InputTokens       int
	OutputTokens      int
	CachedInputTokens int
	ReasoningTokens   int
	DurationSec       int
	ImageCount        int
	Cost              float64
}

type modelPricing struct {
	CreditsInputPer1M  float64
	CreditsOutputPer1M float64
	CreditsPerImage    float64
	CreditsPerSecond   float64
	CreditsPerCall     float64
}

func (s *AIService) EstimateTextRouteCost(ctx context.Context, userID uint, route ModelRoute, req TextRequest) (UsageEstimate, error) {
	_ = userID
	for _, capability := range textRuntimeCapabilities() {
		definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
		if err != nil {
			return UsageEstimate{}, err
		}
		if handled {
			inputTokens := estimateTextInputTokens(req)
			outputTokens := maxPositive(req.MaxTokens, 1024)
			return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, "text", inputTokens, outputTokens, 0, 1), nil
		}
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for text usage estimate")
}

func (s *AIService) EstimateImageRouteCost(ctx context.Context, userID uint, route ModelRoute, req ImageRequest) (UsageEstimate, error) {
	_ = userID
	for _, capability := range []string{CapabilityImage, CapabilityImageEdit} {
		definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
		if err != nil {
			return UsageEstimate{}, err
		}
		if handled {
			n := req.N
			if n <= 0 {
				n = 1
			}
			return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, "image", 0, 0, 0, n), nil
		}
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for image usage estimate")
}

func (s *AIService) EstimateVideoRouteCost(ctx context.Context, userID uint, route ModelRoute, req VideoRequest) (UsageEstimate, error) {
	_ = userID
	for _, capability := range []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
		if err != nil {
			return UsageEstimate{}, err
		}
		if handled {
			duration := req.Duration
			if duration <= 0 {
				duration = definition.def.DefaultDurSec
			}
			if duration <= 0 {
				duration = 1
			}
			return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, "video", 0, 0, duration, 1), nil
		}
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for video usage estimate")
}

func (s *AIService) EstimateAudioTTSRouteCost(ctx context.Context, userID uint, route ModelRoute) (UsageEstimate, error) {
	_ = userID
	definition, handled, err := s.catalogRouteDefinition(ctx, route, CapabilityAudioTTS)
	if err != nil {
		return UsageEstimate{}, err
	}
	if handled {
		return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, CapabilityAudioTTS, 0, 0, 0, 1), nil
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for text-to-speech usage estimate")
}

func (s *AIService) EstimateCapabilityPerCallRouteCost(ctx context.Context, userID uint, route ModelRoute, capability string) (UsageEstimate, error) {
	_ = userID
	definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
	if err != nil {
		return UsageEstimate{}, err
	}
	if handled {
		return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, capability, 0, 0, 0, 1), nil
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for %s usage estimate", capability)
}

func (s *AIService) EstimateAudioGenerateRouteCost(ctx context.Context, userID uint, route ModelRoute, capability string, durationSec int) (UsageEstimate, error) {
	_ = userID
	if !isAudioGenerationCapability(capability) {
		return UsageEstimate{}, fmt.Errorf("unsupported audio generation capability %q", capability)
	}
	definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
	if err != nil {
		return UsageEstimate{}, err
	}
	if handled {
		return estimateUsageCostWithPricing(definition.model.pricing(), definition.def, capability, 0, 0, positiveAudioDuration(durationSec, definition.def), 1), nil
	}
	return UsageEstimate{}, fmt.Errorf("catalog route is required for audio generation usage estimate")
}

func (s *AIService) ReserveUsage(ctx context.Context, userID, runtimeModelID uint, estimate UsageEstimate, usage UsageContext) (*persistencemodel.UsageReservation, error) {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if estimate.Cost <= 0 {
		reservation := persistencemodel.UsageReservation{
			UserID:                userID,
			OrgID:                 usage.OrgID,
			RuntimeModelID:        runtimeModelID,
			AIModelCatalogEntryID: usage.AIModelCatalogEntryID,
			RouteBindingID:        usage.RouteBindingID,
			GatewayAPIKeyID:       usage.GatewayAPIKeyID,
			ProjectID:             usage.ProjectID,
			JobID:                 usage.JobID,
			OperationType:         estimate.OperationType,
			EstimatedCost:         0,
			Status:                ReservationStatusReserved,
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
			UserID:                userID,
			OrgID:                 usage.OrgID,
			RuntimeModelID:        runtimeModelID,
			AIModelCatalogEntryID: usage.AIModelCatalogEntryID,
			RouteBindingID:        usage.RouteBindingID,
			GatewayAPIKeyID:       usage.GatewayAPIKeyID,
			ProjectID:             usage.ProjectID,
			JobID:                 usage.JobID,
			OperationType:         estimate.OperationType,
			EstimatedCost:         estimate.Cost,
			Status:                ReservationStatusReserved,
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

func (s *AIService) settleUsage(ctx context.Context, userID, runtimeModelID uint, estimate UsageEstimate, usage UsageContext) error {
	if estimate.ImageCount <= 0 {
		estimate.ImageCount = 1
	}
	if usage.ReservationID == nil || *usage.ReservationID == 0 {
		return s.logUsage(ctx, userID, runtimeModelID, estimate, usage, nil)
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
			UserID:                userID,
			OrgID:                 firstUint(usage.OrgID, reservation.OrgID),
			RuntimeModelID:        runtimeModelID,
			AIModelCatalogEntryID: firstUint(usage.AIModelCatalogEntryID, reservation.AIModelCatalogEntryID),
			RouteBindingID:        firstUint(usage.RouteBindingID, reservation.RouteBindingID),
			UsageReservationID:    usage.ReservationID,
			GatewayAPIKeyID:       usage.GatewayAPIKeyID,
			ProjectID:             usage.ProjectID,
			OperationType:         estimate.OperationType,
			InputTokens:           estimate.InputTokens,
			OutputTokens:          estimate.OutputTokens,
			CachedInputTokens:     estimate.CachedInputTokens,
			ReasoningTokens:       estimate.ReasoningTokens,
			DurationSec:           estimate.DurationSec,
			ImageCount:            estimate.ImageCount,
			Cost:                  estimate.Cost,
		}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&reservation).
			Select("RuntimeModelID", "AIModelCatalogEntryID", "RouteBindingID", "Status", "ActualCost", "UsageLogID", "UpdatedAt").
			Updates(persistencemodel.UsageReservation{
				RuntimeModelID:        runtimeModelID,
				AIModelCatalogEntryID: entry.AIModelCatalogEntryID,
				RouteBindingID:        entry.RouteBindingID,
				Status:                ReservationStatusSettled,
				ActualCost:            estimate.Cost,
				UsageLogID:            &entry.ID,
				Model:                 gorm.Model{UpdatedAt: now},
			}).Error
	})
}

func (s *AIService) logUsage(ctx context.Context, userID, runtimeModelID uint, estimate UsageEstimate, usage UsageContext, reservationID *uint) error {
	entry := persistencemodel.UsageLog{
		UserID:                userID,
		OrgID:                 usage.OrgID,
		RuntimeModelID:        runtimeModelID,
		AIModelCatalogEntryID: usage.AIModelCatalogEntryID,
		RouteBindingID:        usage.RouteBindingID,
		UsageReservationID:    reservationID,
		GatewayAPIKeyID:       usage.GatewayAPIKeyID,
		ProjectID:             usage.ProjectID,
		OperationType:         estimate.OperationType,
		InputTokens:           estimate.InputTokens,
		OutputTokens:          estimate.OutputTokens,
		CachedInputTokens:     estimate.CachedInputTokens,
		ReasoningTokens:       estimate.ReasoningTokens,
		DurationSec:           estimate.DurationSec,
		ImageCount:            estimate.ImageCount,
		Cost:                  estimate.Cost,
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

func usageWithRoute(usage UsageContext, route ModelRoute) UsageContext {
	if route.CatalogEntryID != 0 && usage.AIModelCatalogEntryID == nil {
		usage.AIModelCatalogEntryID = &route.CatalogEntryID
	}
	if route.RouteBindingID != 0 && usage.RouteBindingID == nil {
		usage.RouteBindingID = &route.RouteBindingID
	}
	return usage
}

func estimateUsageCostWithPricing(pricing modelPricing, def *ModelDef, opType string, inputTokens, outputTokens, durationSec, imageCount int) UsageEstimate {
	return estimateUsageCostWithPricingDetails(pricing, def, opType, TokenUsage{InputTokens: inputTokens, OutputTokens: outputTokens}, durationSec, imageCount)
}

func estimateUsageCostWithPricingDetails(pricing modelPricing, def *ModelDef, opType string, usage TokenUsage, durationSec, imageCount int) UsageEstimate {
	if imageCount <= 0 {
		imageCount = 1
	}
	return UsageEstimate{
		OperationType:     opType,
		InputTokens:       usage.InputTokens,
		OutputTokens:      usage.OutputTokens,
		CachedInputTokens: usage.CachedInputTokens,
		ReasoningTokens:   usage.ReasoningTokens,
		DurationSec:       durationSec,
		ImageCount:        imageCount,
		Cost:              calcCostForPricing(pricing, def, usage.InputTokens, usage.OutputTokens, durationSec, imageCount),
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
