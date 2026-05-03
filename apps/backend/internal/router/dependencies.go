package router

import (
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/auth"
	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB            *gorm.DB
	Config        *config.Config
	Store         storage.Storage
	Tokens        *auth.Manager
	Registry      *ai.Registry
	AIService     *ai.AIService
	EncryptionKey []byte
}
