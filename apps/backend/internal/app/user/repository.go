package user

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListUsers(ctx context.Context, filter ListFilter) ([]model.User, error)
	CreateUser(ctx context.Context, u *model.User) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListUsers(ctx context.Context, filter ListFilter) ([]model.User, error) {
	users := make([]model.User, 0)
	q := r.db.WithContext(ctx)
	if filter.Query != "" {
		if r.db.Dialector.Name() == "postgres" {
			q = q.Where("username ILIKE ?", "%"+filter.Query+"%").Limit(10)
		} else {
			q = q.Where("LOWER(username) LIKE LOWER(?)", "%"+filter.Query+"%").Limit(10)
		}
	}
	if err := q.Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (r *gormRepository) CreateUser(ctx context.Context, u *model.User) error {
	if err := r.db.WithContext(ctx).Create(u).Error; err != nil {
		return err
	}
	return nil
}
