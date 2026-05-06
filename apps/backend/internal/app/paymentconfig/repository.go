package paymentconfig

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListConfigs(ctx context.Context) ([]model.PaymentConfig, error)
	CreateConfig(ctx context.Context, cfg *model.PaymentConfig) error
	GetConfig(ctx context.Context, id uint) (model.PaymentConfig, error)
	SaveConfig(ctx context.Context, cfg *model.PaymentConfig) error
	DeleteConfig(ctx context.Context, id uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListConfigs(ctx context.Context) ([]model.PaymentConfig, error) {
	cfgs := make([]model.PaymentConfig, 0)
	if err := r.db.WithContext(ctx).Order("priority asc, id asc").Find(&cfgs).Error; err != nil {
		return nil, err
	}
	return cfgs, nil
}

func (r *gormRepository) CreateConfig(ctx context.Context, cfg *model.PaymentConfig) error {
	return r.db.WithContext(ctx).Create(cfg).Error
}

func (r *gormRepository) GetConfig(ctx context.Context, id uint) (model.PaymentConfig, error) {
	var cfg model.PaymentConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cfg, ErrNotFound
		}
		return cfg, err
	}
	return cfg, nil
}

func (r *gormRepository) SaveConfig(ctx context.Context, cfg *model.PaymentConfig) error {
	return r.db.WithContext(ctx).Save(cfg).Error
}

func (r *gormRepository) DeleteConfig(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&model.PaymentConfig{}, id).Error
}
