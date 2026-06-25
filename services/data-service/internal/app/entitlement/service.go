package entitlement

import (
	"errors"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("entitlement item not found")

func NewService(db *gorm.DB, cfg *config.Config) domainentitlement.EntitlementService {
	return newRuntimeService(db, cfg)
}

func NewServiceWithIdentity(db *gorm.DB, cfg *config.Config, identity authidentity.OrgDirectory) domainentitlement.EntitlementService {
	return newRuntimeServiceWithIdentity(db, cfg, identity)
}
