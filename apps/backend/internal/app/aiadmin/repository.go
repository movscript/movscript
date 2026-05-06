package aiadmin

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCredentials(ctx context.Context) ([]model.AICredential, error)
	CreateCredential(ctx context.Context, cred *model.AICredential) error
	SaveCredential(ctx context.Context, cred *model.AICredential) error
	DeleteCredential(ctx context.Context, id string) error
	GetCredential(ctx context.Context, id any) (model.AICredential, error)
	ListModelConfigs(ctx context.Context, credentialID string) ([]model.AIModelConfig, error)
	CreateModelConfig(ctx context.Context, cfg *model.AIModelConfig) error
	SaveModelConfig(ctx context.Context, cfg *model.AIModelConfig) error
	DeleteModelConfig(ctx context.Context, id string) error
	GetModelConfig(ctx context.Context, id string) (model.AIModelConfig, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCredentials(ctx context.Context) ([]model.AICredential, error) {
	creds := make([]model.AICredential, 0)
	if err := r.db.WithContext(ctx).Preload("Models").Find(&creds).Error; err != nil {
		return nil, err
	}
	return creds, nil
}

func (r *gormRepository) CreateCredential(ctx context.Context, cred *model.AICredential) error {
	return r.db.WithContext(ctx).Create(cred).Error
}

func (r *gormRepository) SaveCredential(ctx context.Context, cred *model.AICredential) error {
	return r.db.WithContext(ctx).Save(cred).Error
}

func (r *gormRepository) DeleteCredential(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&model.AICredential{}, id).Error
}

func (r *gormRepository) GetCredential(ctx context.Context, id any) (model.AICredential, error) {
	var cred model.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cred, ErrNotFound
		}
		return cred, err
	}
	return cred, nil
}

func (r *gormRepository) ListModelConfigs(ctx context.Context, credentialID string) ([]model.AIModelConfig, error) {
	cfgs := make([]model.AIModelConfig, 0)
	err := r.db.WithContext(ctx).Where("credential_id = ?", credentialID).Find(&cfgs).Error
	return cfgs, err
}

func (r *gormRepository) CreateModelConfig(ctx context.Context, cfg *model.AIModelConfig) error {
	return r.db.WithContext(ctx).Create(cfg).Error
}

func (r *gormRepository) SaveModelConfig(ctx context.Context, cfg *model.AIModelConfig) error {
	return r.db.WithContext(ctx).Save(cfg).Error
}

func (r *gormRepository) DeleteModelConfig(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&model.AIModelConfig{}, id).Error
}

func (r *gormRepository) GetModelConfig(ctx context.Context, id string) (model.AIModelConfig, error) {
	var cfg model.AIModelConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cfg, ErrNotFound
		}
		return cfg, err
	}
	return cfg, nil
}
