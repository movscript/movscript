package user

import (
	"context"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListUsers(ctx context.Context, filter ListFilter) ([]domainauth.UserProfile, error)
	CreateUser(ctx context.Context, u *domainauth.RegisteredUser) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListUsers(ctx context.Context, filter ListFilter) ([]domainauth.UserProfile, error) {
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
	return userProfilesFromModels(users), nil
}

func userProfilesFromModels(users []model.User) []domainauth.UserProfile {
	result := make([]domainauth.UserProfile, 0, len(users))
	for _, user := range users {
		result = append(result, domainauth.UserProfileFromModel(user))
	}
	return result
}

func (r *gormRepository) CreateUser(ctx context.Context, u *domainauth.RegisteredUser) error {
	row := u.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*u = domainauth.RegisteredUserFromModel(row)
	return nil
}
