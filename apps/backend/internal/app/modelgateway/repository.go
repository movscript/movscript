package modelgateway

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint, includeLegacy bool) ([]model.GatewayAPIKey, error)
	CreateAPIKey(ctx context.Context, key *model.GatewayAPIKey) error
	UpdateAPIKey(ctx context.Context, key *model.GatewayAPIKey, updates map[string]any) error
	ReloadAPIKey(ctx context.Context, key *model.GatewayAPIKey) error
	DeleteAPIKey(ctx context.Context, key *model.GatewayAPIKey) error
	FindAPIKeyByHash(ctx context.Context, hash string) (model.GatewayAPIKey, error)
	FindUser(ctx context.Context, id uint) (model.User, error)
	TouchAPIKeyLastUsed(ctx context.Context, key *model.GatewayAPIKey, usedAt time.Time) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint, includeLegacy bool) ([]model.GatewayAPIKey, error) {
	keys := make([]model.GatewayAPIKey, 0)
	q := r.db.WithContext(ctx).Where("owner_user_id = ?", ownerUserID)
	q = applyAPIKeyOrgScope(q, orgID, ownerUserID, includeLegacy)
	err := q.Order("created_at desc").Find(&keys).Error
	return keys, err
}

func (r *gormRepository) CreateAPIKey(ctx context.Context, key *model.GatewayAPIKey) error {
	return r.db.WithContext(ctx).Create(key).Error
}

func (r *gormRepository) UpdateAPIKey(ctx context.Context, key *model.GatewayAPIKey, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(key).Updates(updates).Error
}

func (r *gormRepository) ReloadAPIKey(ctx context.Context, key *model.GatewayAPIKey) error {
	return r.db.WithContext(ctx).First(key, key.ID).Error
}

func (r *gormRepository) DeleteAPIKey(ctx context.Context, key *model.GatewayAPIKey) error {
	return r.db.WithContext(ctx).Delete(key).Error
}

func (r *gormRepository) FindAPIKeyByHash(ctx context.Context, hash string) (model.GatewayAPIKey, error) {
	var key model.GatewayAPIKey
	err := r.db.WithContext(ctx).Where("key_hash = ? AND is_enabled = true", hash).First(&key).Error
	return key, err
}

func (r *gormRepository) FindUser(ctx context.Context, id uint) (model.User, error) {
	var user model.User
	err := r.db.WithContext(ctx).First(&user, id).Error
	return user, err
}

func (r *gormRepository) TouchAPIKeyLastUsed(ctx context.Context, key *model.GatewayAPIKey, usedAt time.Time) error {
	return r.db.WithContext(ctx).Model(key).Update("last_used_at", &usedAt).Error
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
