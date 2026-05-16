package cloud

import (
	"context"
	"errors"

	domaincloud "github.com/movscript/movscript/internal/domain/cloud"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListConfigs(ctx context.Context) ([]domaincloud.Config, error)
	CreateConfig(ctx context.Context, cfg *domaincloud.Config) error
	GetConfig(ctx context.Context, id uint) (domaincloud.Config, error)
	SaveConfig(ctx context.Context, cfg *domaincloud.Config) error
	DeleteConfig(ctx context.Context, id uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListConfigs(ctx context.Context) ([]domaincloud.Config, error) {
	cfgs := make([]persistencemodel.CloudFileConfig, 0)
	if err := r.db.WithContext(ctx).Order("priority asc, id asc").Find(&cfgs).Error; err != nil {
		return nil, err
	}
	items := make([]domaincloud.Config, 0, len(cfgs))
	for _, cfg := range cfgs {
		items = append(items, domaincloud.ConfigFromModel(cfg))
	}
	return items, nil
}

func (r *gormRepository) CreateConfig(ctx context.Context, cfg *domaincloud.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*cfg = domaincloud.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) GetConfig(ctx context.Context, id uint) (domaincloud.Config, error) {
	var cfg persistencemodel.CloudFileConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domaincloud.Config{}, ErrNotFound
		}
		return domaincloud.Config{}, err
	}
	return domaincloud.ConfigFromModel(cfg), nil
}

func (r *gormRepository) SaveConfig(ctx context.Context, cfg *domaincloud.Config) error {
	row := cfg.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*cfg = domaincloud.ConfigFromModel(row)
	return nil
}

func (r *gormRepository) DeleteConfig(ctx context.Context, id uint) error {
	result := r.db.WithContext(ctx).Delete(&persistencemodel.CloudFileConfig{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
