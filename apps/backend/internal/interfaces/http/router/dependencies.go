package router

import (
	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB            *gorm.DB
	Config        *config.Config
	Store         storage.Storage
	Tokens        *auth.Manager
	Registry      *ai.Registry
	AIService     *ai.AIService
	Cache         cache.Cache
	Entitlements  commercial.EntitlementService
	EncryptionKey []byte
}
