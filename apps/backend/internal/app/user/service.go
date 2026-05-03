package user

import (
	"context"

	"github.com/movscript/movscript/internal/model"
	dto "github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ListFilter struct {
	Query string
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]model.User, error) {
	users := make([]model.User, 0)
	q := s.db.WithContext(ctx)
	if filter.Query != "" {
		q = q.Where("username ILIKE ?", "%"+filter.Query+"%").Limit(10)
	}
	err := q.Find(&users).Error
	return users, err
}

func (s *Service) Create(ctx context.Context, input dto.UserCreateInput) (model.User, error) {
	u := dto.NewUser(input)
	if err := s.db.WithContext(ctx).Create(&u).Error; err != nil {
		return u, err
	}
	return u, nil
}
