package ai

import (
	"errors"

	infraai "github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

var (
	ErrNotFound              = errors.New("ai admin item not found")
	ErrInvalidModelCatalog   = errors.New("invalid ai model catalog")
	ErrInvalidProviderConfig = errors.New("invalid ai provider config")
	ErrEncryptCredentials    = errors.New("failed to encrypt credentials")
	ErrEncryptFilesAPIKey    = errors.New("failed to encrypt files api key")
)

type Service struct {
	db            *gorm.DB
	repo          repository
	encryptionKey []byte
	registry      *infraai.Registry
	gatewayHealth providercontract.AIGatewayHealthProbe
}

func NewService(db *gorm.DB, encryptionKey []byte, registry *infraai.Registry) *Service {
	var gatewayHealth providercontract.AIGatewayHealthProbe
	if registry != nil {
		gatewayHealth = infraai.NewAIService(db, registry)
	}
	return &Service{db: db, repo: newRepository(db), encryptionKey: encryptionKey, registry: registry, gatewayHealth: gatewayHealth}
}

type TestResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}
