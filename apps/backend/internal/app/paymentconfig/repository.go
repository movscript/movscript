package paymentconfig

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	domainpaymentconfig "github.com/movscript/movscript/internal/domain/paymentconfig"
	"gorm.io/gorm"
)

type repository interface {
	ListConfigs(ctx context.Context) ([]domainpaymentconfig.Config, error)
	CreateConfig(ctx context.Context, cfg *domainpaymentconfig.Config) error
	GetConfig(ctx context.Context, id uint) (domainpaymentconfig.Config, error)
	SaveConfig(ctx context.Context, cfg *domainpaymentconfig.Config) error
	DeleteConfig(ctx context.Context, id uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListConfigs(ctx context.Context) ([]domainpaymentconfig.Config, error) {
	cfgs := make([]model.PaymentConfig, 0)
	if err := r.db.WithContext(ctx).Order("priority asc, id asc").Find(&cfgs).Error; err != nil {
		return nil, err
	}
	items := make([]domainpaymentconfig.Config, 0, len(cfgs))
	for _, cfg := range cfgs {
		items = append(items, domainpaymentconfig.ConfigFromModel(cfg))
	}
	return items, nil
}

func (r *gormRepository) CreateConfig(ctx context.Context, cfg *domainpaymentconfig.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*cfg = domainpaymentconfig.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) GetConfig(ctx context.Context, id uint) (domainpaymentconfig.Config, error) {
	var cfg model.PaymentConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainpaymentconfig.Config{}, ErrNotFound
		}
		return domainpaymentconfig.Config{}, err
	}
	return domainpaymentconfig.ConfigFromModel(cfg), nil
}

func (r *gormRepository) SaveConfig(ctx context.Context, cfg *domainpaymentconfig.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*cfg = domainpaymentconfig.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) DeleteConfig(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&model.PaymentConfig{}, id).Error
}
