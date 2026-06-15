package canvas

import (
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type Service struct {
	repo      repository
	registry  *ai.Registry
	svc       *ai.AIService
	catalog   providercontract.AIGatewayModelCatalog
	routing   providercontract.AIGatewayRoutingPolicy
	store     storage.Storage
	uploadDir string
}

func NewService(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, verifier ai.ImageVerificationClient, store storage.Storage) Service {
	service := Service{
		repo:      newRepository(db),
		registry:  registry,
		svc:       svc,
		store:     store,
		uploadDir: "/tmp/movscript-canvas",
	}
	if svc != nil {
		service.catalog = svc
		service.routing = svc
	}
	return service
}

func (h *Service) canvasRepo() repository { return h.repo }
