package canvas

import (
	"github.com/movscript/auth-service/pkg/authidentity"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) Service {
	return NewServiceWithIdentity(db, nil)
}

func NewServiceWithIdentity(db *gorm.DB, identity authidentity.OrgDirectory) Service {
	return Service{
		repo: newRepositoryWithIdentity(db, identity),
	}
}

func (h *Service) canvasRepo() repository { return h.repo }
