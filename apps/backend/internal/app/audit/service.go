package audit

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	ActorID    string
	Action     string
	TargetType string
	TargetID   string
	ProjectID  string
	Since      *time.Time
	Until      *time.Time
	Page       int
	PageSize   int
}

type Page struct {
	Items    []model.AuditLog `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
	return s.repo.ListLogs(ctx, filter)
}
