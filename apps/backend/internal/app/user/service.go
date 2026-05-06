package user

import (
	"context"

	dto "github.com/movscript/movscript/internal/app/dto"
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
	Query string
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]model.User, error) {
	return s.repo.ListUsers(ctx, filter)
}

func (s *Service) Create(ctx context.Context, input dto.UserCreateInput) (model.User, error) {
	u := dto.NewUser(input)
	if err := s.repo.CreateUser(ctx, &u); err != nil {
		return u, err
	}
	return u, nil
}
