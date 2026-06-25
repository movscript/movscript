//go:build !runtime_overlay

package ai

import (
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func (s *AIService) reserveUsageLimit(tx *gorm.DB, userID uint, orgID *uint, cost float64, label string) error {
	return nil
}

func (s *AIService) releaseReservedUsageLimit(tx *gorm.DB, reservation persistencemodel.UsageReservation) error {
	return nil
}

func (s *AIService) refundUsageLimit(tx *gorm.DB, userID uint, orgID *uint, amount float64) error {
	return nil
}
