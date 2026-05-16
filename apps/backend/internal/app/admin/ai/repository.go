package ai

import (
	"context"
	"errors"

	domainai "github.com/movscript/movscript/internal/domain/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCredentials(ctx context.Context) ([]domainai.Credential, error)
	CreateCredential(ctx context.Context, cred *domainai.Credential) error
	SaveCredential(ctx context.Context, cred *domainai.Credential) error
	DeleteCredential(ctx context.Context, id uint) error
	GetCredential(ctx context.Context, id uint) (domainai.Credential, error)
	ListModelConfigs(ctx context.Context, credentialID string) ([]domainai.ModelConfig, error)
	CreateModelConfig(ctx context.Context, cfg *domainai.ModelConfig) error
	SaveModelConfig(ctx context.Context, cfg *domainai.ModelConfig) error
	DeleteModelConfig(ctx context.Context, id uint) error
	GetModelConfig(ctx context.Context, id string) (domainai.ModelConfig, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCredentials(ctx context.Context) ([]domainai.Credential, error) {
	creds := make([]persistencemodel.AICredential, 0)
	if err := r.db.WithContext(ctx).Preload("Models").Find(&creds).Error; err != nil {
		return nil, err
	}
	items := make([]domainai.Credential, 0, len(creds))
	for _, cred := range creds {
		items = append(items, domainai.CredentialFromModel(cred))
	}
	return items, nil
}

func (r *gormRepository) CreateCredential(ctx context.Context, cred *domainai.Credential) error {
	modelCred := cred.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelCred).Error; err != nil {
		return err
	}
	*cred = domainai.CredentialFromModel(modelCred)
	return nil
}

func (r *gormRepository) SaveCredential(ctx context.Context, cred *domainai.Credential) error {
	modelCred := cred.ToModel()
	if err := r.db.WithContext(ctx).Save(&modelCred).Error; err != nil {
		return err
	}
	*cred = domainai.CredentialFromModel(modelCred)
	return nil
}

func (r *gormRepository) DeleteCredential(ctx context.Context, id uint) error {
	result := r.db.WithContext(ctx).Delete(&persistencemodel.AICredential{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *gormRepository) GetCredential(ctx context.Context, id uint) (domainai.Credential, error) {
	var cred persistencemodel.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainai.Credential{}, ErrNotFound
		}
		return domainai.Credential{}, err
	}
	return domainai.CredentialFromModel(cred), nil
}

func (r *gormRepository) ListModelConfigs(ctx context.Context, credentialID string) ([]domainai.ModelConfig, error) {
	cfgs := make([]persistencemodel.AIModelConfig, 0)
	if err := r.db.WithContext(ctx).Where("credential_id = ?", credentialID).Find(&cfgs).Error; err != nil {
		return nil, err
	}
	items := make([]domainai.ModelConfig, 0, len(cfgs))
	for _, cfg := range cfgs {
		items = append(items, domainai.ModelConfigFromModel(cfg))
	}
	return items, nil
}

func (r *gormRepository) CreateModelConfig(ctx context.Context, cfg *domainai.ModelConfig) error {
	modelCfg := cfg.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelCfg).Error; err != nil {
		return err
	}
	*cfg = domainai.ModelConfigFromModel(modelCfg)
	return nil
}

func (r *gormRepository) SaveModelConfig(ctx context.Context, cfg *domainai.ModelConfig) error {
	modelCfg := cfg.ToModel()
	if err := r.db.WithContext(ctx).Save(&modelCfg).Error; err != nil {
		return err
	}
	*cfg = domainai.ModelConfigFromModel(modelCfg)
	return nil
}

func (r *gormRepository) DeleteModelConfig(ctx context.Context, id uint) error {
	result := r.db.WithContext(ctx).Delete(&persistencemodel.AIModelConfig{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *gormRepository) GetModelConfig(ctx context.Context, id string) (domainai.ModelConfig, error) {
	var cfg persistencemodel.AIModelConfig
	if err := r.db.WithContext(ctx).First(&cfg, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainai.ModelConfig{}, ErrNotFound
		}
		return domainai.ModelConfig{}, err
	}
	return domainai.ModelConfigFromModel(cfg), nil
}
