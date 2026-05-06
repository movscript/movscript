package canvas

import (
	"github.com/movscript/movscript/internal/app/workflowio"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type Service struct {
	repo      repository
	registry  *ai.Registry
	svc       *ai.AIService
	entityIO  *workflowio.EntityIOService
	store     storage.Storage
	uploadDir string
}

func NewService(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, entityIO *workflowio.EntityIOService, store storage.Storage) Service {
	if entityIO == nil {
		entityIO = workflowio.NewEntityIOService(db)
	}
	return Service{
		repo:      newRepository(db),
		registry:  registry,
		svc:       svc,
		entityIO:  entityIO,
		store:     store,
		uploadDir: "/tmp/movscript-canvas",
	}
}

func (h *Service) canvasRepo() repository { return h.repo }
