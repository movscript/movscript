package entitlement

import (
	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

func NewService(db *gorm.DB, cfg *config.Config) commercial.EntitlementService {
	return newEditionService(db, cfg)
}
