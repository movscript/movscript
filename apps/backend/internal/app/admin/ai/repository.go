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
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCredentials(ctx context.Context) ([]domainai.Credential, error) {
	creds := make([]persistencemodel.AICredential, 0)
	if err := r.db.WithContext(ctx).Find(&creds).Error; err != nil {
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
