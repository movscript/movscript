//go:build !enterprise

package ai

import (
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (s *AIService) reserveSpend(tx *gorm.DB, userID uint, orgID *uint, cost float64, label string) error {
	return nil
}

func (s *AIService) releaseReservedSpend(tx *gorm.DB, reservation model.UsageReservation) error {
	return nil
}

func (s *AIService) refundSettledSpend(tx *gorm.DB, userID uint, orgID *uint, amount float64) error {
	return nil
}
