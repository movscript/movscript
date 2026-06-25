package router

import (
	"github.com/movscript/auth-service/pkg/authidentity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/app/systemstream"
	"github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/scopedtoken"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB             *gorm.DB
	Config         *config.Config
	Store          storage.Storage
	AuthIdentity   authidentity.Manager
	AuthProvider   authprovider.Provider
	Tokens         *scopedtoken.Manager
	Registry       *ai.Registry
	AIService      *ai.AIService
	ImageVerifier  ai.ImageVerificationClient
	Cache          cache.Cache
	VectorIndex    providercontract.VectorIndexProvider
	Entitlements   entitlement.EntitlementService
	SystemMessages *systemstream.Hub
	EncryptionKey  []byte
}
