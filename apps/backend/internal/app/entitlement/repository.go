package entitlement

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	FindOrganization(ctx context.Context, orgID uint) (model.Organization, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	if db == nil {
		return nil
	}
	return &gormRepository{db: db}
}

func (r *gormRepository) FindOrganization(ctx context.Context, orgID uint) (model.Organization, error) {
	var org model.Organization
	if err := r.db.WithContext(ctx).Select("id, is_personal, plan, status").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return org, ErrNotFound
		}
		return org, err
	}
	return org, nil
}
