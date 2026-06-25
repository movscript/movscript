package settings

import (
	"context"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("admin setting not found")

type settingRecord struct {
	Key       string
	ValueJSON string
}

type repository interface {
	Get(ctx context.Context, key string) (settingRecord, error)
	Save(ctx context.Context, setting settingRecord) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Get(ctx context.Context, key string) (settingRecord, error) {
	var setting persistencemodel.AdminSetting
	if err := r.db.WithContext(ctx).Where("key = ?", key).First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return settingRecord{}, ErrNotFound
		}
		return settingRecord{}, err
	}
	return settingRecord{Key: setting.Key, ValueJSON: setting.ValueJSON}, nil
}

func (r *gormRepository) Save(ctx context.Context, setting settingRecord) error {
	var existing persistencemodel.AdminSetting
	err := r.db.WithContext(ctx).Where("key = ?", setting.Key).First(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return r.db.WithContext(ctx).Create(&persistencemodel.AdminSetting{
				Key:       setting.Key,
				ValueJSON: setting.ValueJSON,
			}).Error
		}
		return err
	}
	existing.ValueJSON = setting.ValueJSON
	return r.db.WithContext(ctx).Save(&existing).Error
}
