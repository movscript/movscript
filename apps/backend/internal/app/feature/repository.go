package feature

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type repository interface {
	ListFeatures(ctx context.Context) ([]model.FeatureConfig, error)
	GetFeature(ctx context.Context, key string) (model.FeatureConfig, error)
	SaveFeature(ctx context.Context, f *model.FeatureConfig) error
	FilterExistingModelIDs(ctx context.Context, ids []uint) []uint
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListFeatures(ctx context.Context) ([]model.FeatureConfig, error) {
	features := make([]model.FeatureConfig, 0)
	if err := r.db.WithContext(ctx).Order("id").Find(&features).Error; err != nil {
		return nil, err
	}
	return features, nil
}

func (r *gormRepository) GetFeature(ctx context.Context, key string) (model.FeatureConfig, error) {
	var f model.FeatureConfig
	if err := r.db.WithContext(ctx).Where("feature_key = ?", ai.NormalizeFeatureKey(key)).First(&f).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return f, ErrNotFound
		}
		return f, err
	}
	return f, nil
}

func (r *gormRepository) SaveFeature(ctx context.Context, f *model.FeatureConfig) error {
	return r.db.WithContext(ctx).Save(f).Error
}

func (r *gormRepository) FilterExistingModelIDs(ctx context.Context, ids []uint) []uint {
	if len(ids) == 0 {
		return []uint{}
	}
	var existing []uint
	r.db.WithContext(ctx).Model(&model.AIModelConfig{}).
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id IN ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", ids).
		Pluck("ai_model_configs.id", &existing)
	if existing == nil {
		return []uint{}
	}
	return existing
}
