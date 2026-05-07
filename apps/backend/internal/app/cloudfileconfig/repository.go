package cloudfileconfig

import (
	"context"
	"errors"

	domaincloudfileconfig "github.com/movscript/movscript/internal/domain/cloudfileconfig"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListConfigs(ctx context.Context) ([]domaincloudfileconfig.Config, error)
	CreateConfig(ctx context.Context, cfg *domaincloudfileconfig.Config) error
	GetConfig(ctx context.Context, id uint) (domaincloudfileconfig.Config, error)
	SaveConfig(ctx context.Context, cfg *domaincloudfileconfig.Config) error
	DeleteConfig(ctx context.Context, id uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListConfigs(ctx context.Context) ([]domaincloudfileconfig.Config, error) {
	cfgs := make([]model.CloudFileConfig, 0)
	if err := r.db.WithContext(ctx).Order("priority asc, id asc").Find(&cfgs).Error; err != nil {
		return nil, err
	}
	items := make([]domaincloudfileconfig.Config, 0, len(cfgs))
	for _, cfg := range cfgs {
		items = append(items, domaincloudfileconfig.ConfigFromModel(cfg))
	}
	return items, nil
}

func (r *gormRepository) CreateConfig(ctx context.Context, cfg *domaincloudfileconfig.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*cfg = domaincloudfileconfig.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) GetConfig(ctx context.Context, id uint) (domaincloudfileconfig.Config, error) {
	var cfg model.CloudFileConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domaincloudfileconfig.Config{}, ErrNotFound
		}
		return domaincloudfileconfig.Config{}, err
	}
	return domaincloudfileconfig.ConfigFromModel(cfg), nil
}

func (r *gormRepository) SaveConfig(ctx context.Context, cfg *domaincloudfileconfig.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*cfg = domaincloudfileconfig.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) DeleteConfig(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&model.CloudFileConfig{}, id).Error
}
