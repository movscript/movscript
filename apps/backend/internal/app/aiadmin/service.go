package aiadmin

import (
	"errors"

	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

var (
	ErrNotFound           = errors.New("ai admin item not found")
	ErrInvalidModelConfig = errors.New("invalid ai model config")
	ErrEncryptCredentials = errors.New("failed to encrypt credentials")
	ErrEncryptFilesAPIKey = errors.New("failed to encrypt files api key")
)

type Service struct {
	db            *gorm.DB
	repo          repository
	encryptionKey []byte
	registry      *ai.Registry
}

func NewService(db *gorm.DB, encryptionKey []byte, registry *ai.Registry) *Service {
	return &Service{db: db, repo: newRepository(db), encryptionKey: encryptionKey, registry: registry}
}

type TestResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}
