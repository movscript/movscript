package modelgateway

import (
	"context"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"gorm.io/gorm"
)

type repository interface {
	ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint, includeLegacy bool) ([]domainmodelgateway.APIKey, error)
	CreateAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error
	UpdateAPIKey(ctx context.Context, key *domainmodelgateway.APIKey, updates map[string]any) error
	ReloadAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error
	DeleteAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error
	FindAPIKeyByHash(ctx context.Context, hash string) (domainmodelgateway.APIKey, error)
	FindUser(ctx context.Context, id uint) (model.User, error)
	TouchAPIKeyLastUsed(ctx context.Context, key *domainmodelgateway.APIKey, usedAt time.Time) error
	FindOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint, includeLegacy bool) (domainmodelgateway.APIKey, error)
	FindProjectOrgID(ctx context.Context, projectID uint) (*uint, error)
	IsPersonalOrg(ctx context.Context, orgID uint) bool
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint, includeLegacy bool) ([]domainmodelgateway.APIKey, error) {
	keys := make([]model.GatewayAPIKey, 0)
	q := r.db.WithContext(ctx).Where("owner_user_id = ?", ownerUserID)
	q = applyAPIKeyOrgScope(q, orgID, ownerUserID, includeLegacy)
	err := q.Order("created_at desc").Find(&keys).Error
	if err != nil {
		return nil, err
	}
	items := make([]domainmodelgateway.APIKey, 0, len(keys))
	for _, key := range keys {
		items = append(items, domainmodelgateway.APIKeyFromModel(key))
	}
	return items, nil
}

func (r *gormRepository) CreateAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error {
	row := key.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*key = domainmodelgateway.APIKeyFromModel(row)
	return nil
}

func (r *gormRepository) UpdateAPIKey(ctx context.Context, key *domainmodelgateway.APIKey, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	row := key.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(updates).Error; err != nil {
		return err
	}
	*key = domainmodelgateway.APIKeyFromModel(row)
	return nil
}

func (r *gormRepository) ReloadAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error {
	var row model.GatewayAPIKey
	if err := r.db.WithContext(ctx).First(&row, key.ID).Error; err != nil {
		return err
	}
	*key = domainmodelgateway.APIKeyFromModel(row)
	return nil
}

func (r *gormRepository) DeleteAPIKey(ctx context.Context, key *domainmodelgateway.APIKey) error {
	row := key.ToModel()
	return r.db.WithContext(ctx).Delete(&row).Error
}

func (r *gormRepository) FindAPIKeyByHash(ctx context.Context, hash string) (domainmodelgateway.APIKey, error) {
	var key model.GatewayAPIKey
	err := r.db.WithContext(ctx).Where("key_hash = ? AND is_enabled = true", hash).First(&key).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domainmodelgateway.APIKey{}, ErrAPIKeyNotFound
	}
	if err != nil {
		return domainmodelgateway.APIKey{}, err
	}
	return domainmodelgateway.APIKeyFromModel(key), nil
}

func (r *gormRepository) FindUser(ctx context.Context, id uint) (model.User, error) {
	var user model.User
	err := r.db.WithContext(ctx).First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return user, ErrAPIKeyNotFound
	}
	return user, err
}

func (r *gormRepository) TouchAPIKeyLastUsed(ctx context.Context, key *domainmodelgateway.APIKey, usedAt time.Time) error {
	row := key.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Update("last_used_at", &usedAt).Error; err != nil {
		return err
	}
	key.LastUsedAt = &usedAt
	return nil
}

func (r *gormRepository) FindOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint, includeLegacy bool) (domainmodelgateway.APIKey, error) {
	var key model.GatewayAPIKey
	q := r.db.WithContext(ctx).Where("id = ? AND owner_user_id = ?", id, ownerUserID)
	q = applyAPIKeyOrgScope(q, orgID, ownerUserID, includeLegacy)
	if err := q.First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainmodelgateway.APIKey{}, ErrAPIKeyNotFound
		}
		return domainmodelgateway.APIKey{}, err
	}
	return domainmodelgateway.APIKeyFromModel(key), nil
}

func (r *gormRepository) FindProjectOrgID(ctx context.Context, projectID uint) (*uint, error) {
	var project model.Project
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return project.OrgID, nil
}

func (r *gormRepository) IsPersonalOrg(ctx context.Context, orgID uint) bool {
	var org model.Organization
	if err := r.db.WithContext(ctx).Select("is_personal").First(&org, orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

func applyAPIKeyOrgScope(q *gorm.DB, orgID *uint, ownerUserID uint, includeLegacy bool) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if includeLegacy {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_user_id = ?)", *orgID, ownerUserID)
	}
	return q.Where("org_id = ?", *orgID)
}
