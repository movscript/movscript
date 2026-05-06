package entitlement

import (
	"errors"

	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("entitlement item not found")

func NewService(db *gorm.DB, cfg *config.Config) commercial.EntitlementService {
	return newEditionService(db, cfg)
}
