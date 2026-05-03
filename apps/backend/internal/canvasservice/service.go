package canvasservice

import (
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/storage"
	"github.com/movscript/movscript/internal/workflow"
	"gorm.io/gorm"
)

type Service struct {
	db        *gorm.DB
	registry  *ai.Registry
	svc       *ai.AIService
	entityIO  *workflow.EntityIOService
	store     storage.Storage
	uploadDir string
}

func NewService(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, entityIO *workflow.EntityIOService, store storage.Storage) Service {
	if entityIO == nil {
		entityIO = workflow.NewEntityIOService(db)
	}
	return Service{
		db:        db,
		registry:  registry,
		svc:       svc,
		entityIO:  entityIO,
		store:     store,
		uploadDir: "/tmp/movscript-canvas",
	}
}
