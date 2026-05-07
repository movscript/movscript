package entitlement

import (
	"errors"

	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("entitlement item not found")

func NewService(db *gorm.DB, cfg *config.Config) domainentitlement.EntitlementService {
	return newEditionService(db, cfg)
}
