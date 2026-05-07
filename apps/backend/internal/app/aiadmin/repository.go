package aiadmin

import (
	"context"
	"errors"

	domainaiadmin "github.com/movscript/movscript/internal/domain/aiadmin"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCredentials(ctx context.Context) ([]domainaiadmin.Credential, error)
	CreateCredential(ctx context.Context, cred *domainaiadmin.Credential) error
	SaveCredential(ctx context.Context, cred *domainaiadmin.Credential) error
	DeleteCredential(ctx context.Context, id string) error
	GetCredential(ctx context.Context, id any) (domainaiadmin.Credential, error)
	ListModelConfigs(ctx context.Context, credentialID string) ([]domainaiadmin.ModelConfig, error)
	CreateModelConfig(ctx context.Context, cfg *domainaiadmin.ModelConfig) error
	SaveModelConfig(ctx context.Context, cfg *domainaiadmin.ModelConfig) error
	DeleteModelConfig(ctx context.Context, id string) error
	GetModelConfig(ctx context.Context, id string) (domainaiadmin.ModelConfig, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCredentials(ctx context.Context) ([]domainaiadmin.Credential, error) {
	creds := make([]model.AICredential, 0)
	if err := r.db.WithContext(ctx).Preload("Models").Find(&creds).Error; err != nil {
		return nil, err
	}
	items := make([]domainaiadmin.Credential, 0, len(creds))
	for _, cred := range creds {
		items = append(items, domainaiadmin.CredentialFromModel(cred))
	}
	return items, nil
}

func (r *gormRepository) CreateCredential(ctx context.Context, cred *domainaiadmin.Credential) error {
	modelCred := cred.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelCred).Error; err != nil {
		return err
	}
	*cred = domainaiadmin.CredentialFromModel(modelCred)
	return nil
}

func (r *gormRepository) SaveCredential(ctx context.Context, cred *domainaiadmin.Credential) error {
	modelCred := cred.ToModel()
	if err := r.db.WithContext(ctx).Save(&modelCred).Error; err != nil {
		return err
	}
	*cred = domainaiadmin.CredentialFromModel(modelCred)
	return nil
}

func (r *gormRepository) DeleteCredential(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&model.AICredential{}, id).Error
}

func (r *gormRepository) GetCredential(ctx context.Context, id any) (domainaiadmin.Credential, error) {
	var cred model.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainaiadmin.Credential{}, ErrNotFound
		}
		return domainaiadmin.Credential{}, err
	}
	return domainaiadmin.CredentialFromModel(cred), nil
}

func (r *gormRepository) ListModelConfigs(ctx context.Context, credentialID string) ([]domainaiadmin.ModelConfig, error) {
	cfgs := make([]model.AIModelConfig, 0)
	if err := r.db.WithContext(ctx).Where("credential_id = ?", credentialID).Find(&cfgs).Error; err != nil {
		return nil, err
	}
	items := make([]domainaiadmin.ModelConfig, 0, len(cfgs))
	for _, cfg := range cfgs {
		items = append(items, domainaiadmin.ModelConfigFromModel(cfg))
	}
	return items, nil
}

func (r *gormRepository) CreateModelConfig(ctx context.Context, cfg *domainaiadmin.ModelConfig) error {
	modelCfg := cfg.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelCfg).Error; err != nil {
		return err
	}
	*cfg = domainaiadmin.ModelConfigFromModel(modelCfg)
	return nil
}

func (r *gormRepository) SaveModelConfig(ctx context.Context, cfg *domainaiadmin.ModelConfig) error {
	modelCfg := cfg.ToModel()
	if err := r.db.WithContext(ctx).Save(&modelCfg).Error; err != nil {
		return err
	}
	*cfg = domainaiadmin.ModelConfigFromModel(modelCfg)
	return nil
}

func (r *gormRepository) DeleteModelConfig(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&model.AIModelConfig{}, id).Error
}

func (r *gormRepository) GetModelConfig(ctx context.Context, id string) (domainaiadmin.ModelConfig, error) {
	var cfg model.AIModelConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainaiadmin.ModelConfig{}, ErrNotFound
		}
		return domainaiadmin.ModelConfig{}, err
	}
	return domainaiadmin.ModelConfigFromModel(cfg), nil
}
