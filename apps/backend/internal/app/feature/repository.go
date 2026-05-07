package feature

import (
	"context"
	"errors"

	domainfeature "github.com/movscript/movscript/internal/domain/feature"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListFeatures(ctx context.Context) ([]domainfeature.FeatureConfig, error)
	GetFeature(ctx context.Context, key string) (domainfeature.FeatureConfig, error)
	SaveFeature(ctx context.Context, f *domainfeature.FeatureConfig) error
	FilterExistingModelIDs(ctx context.Context, ids []uint) []uint
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListFeatures(ctx context.Context) ([]domainfeature.FeatureConfig, error) {
	features := make([]persistencemodel.FeatureConfig, 0)
	if err := r.db.WithContext(ctx).Order("id").Find(&features).Error; err != nil {
		return nil, err
	}
	items := make([]domainfeature.FeatureConfig, 0, len(features))
	for _, feature := range features {
		items = append(items, domainfeature.FeatureConfigFromModel(feature))
	}
	return items, nil
}

func (r *gormRepository) GetFeature(ctx context.Context, key string) (domainfeature.FeatureConfig, error) {
	var f persistencemodel.FeatureConfig
	if err := r.db.WithContext(ctx).Where("feature_key = ?", ai.NormalizeFeatureKey(key)).First(&f).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainfeature.FeatureConfig{}, ErrNotFound
		}
		return domainfeature.FeatureConfig{}, err
	}
	return domainfeature.FeatureConfigFromModel(f), nil
}

func (r *gormRepository) SaveFeature(ctx context.Context, f *domainfeature.FeatureConfig) error {
	row := f.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*f = domainfeature.FeatureConfigFromModel(row)
	return nil
}

func (r *gormRepository) FilterExistingModelIDs(ctx context.Context, ids []uint) []uint {
	if len(ids) == 0 {
		return []uint{}
	}
	var existing []uint
	r.db.WithContext(ctx).Model(&persistencemodel.AIModelConfig{}).
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id IN ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", ids).
		Pluck("ai_model_configs.id", &existing)
	if existing == nil {
		return []uint{}
	}
	return existing
}
