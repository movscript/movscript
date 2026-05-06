package script

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

type repository interface {
	ListScripts(ctx context.Context, filter ListFilter) ([]model.Script, error)
	CreateScript(ctx context.Context, item *model.Script) error
	GetScript(ctx context.Context, id uint) (model.Script, error)
	SaveScript(ctx context.Context, item *model.Script) error
	PatchScript(ctx context.Context, item *model.Script, updates map[string]any) error
	DeleteScript(ctx context.Context, id uint) (uint, error)

	FindInitialVersion(ctx context.Context, projectID uint, scriptID uint) (model.ScriptVersion, bool, error)
	UpdateScriptVersionWithRelations(ctx context.Context, version *model.ScriptVersion, updates map[string]any) error
	CreateScriptVersionWithRelations(ctx context.Context, version *model.ScriptVersion) error
}

type gormRepository struct {
	db *gorm.DB
}

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db}, cache: c}
}

func (r *gormRepository) ListScripts(ctx context.Context, filter ListFilter) ([]model.Script, error) {
	scripts := make([]model.Script, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.Type != "" {
		q = q.Where("script_type = ?", filter.Type)
	}
	if filter.AssigneeID != "" {
		q = q.Where("assignee_id = ?", filter.AssigneeID)
	}
	err := q.Order(`"order", created_at`).Find(&scripts).Error
	return scripts, err
}

func (r *gormRepository) CreateScript(ctx context.Context, item *model.Script) error {
	return r.db.WithContext(ctx).Create(item).Error
}

func (r *gormRepository) GetScript(ctx context.Context, id uint) (model.Script, error) {
	var item model.Script
	if err := r.db.WithContext(ctx).First(&item, id).Error; err != nil {
		return item, normalizeNotFound(err)
	}
	return item, nil
}

func (r *gormRepository) SaveScript(ctx context.Context, item *model.Script) error {
	return r.db.WithContext(ctx).Save(item).Error
}

func (r *gormRepository) PatchScript(ctx context.Context, item *model.Script, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(item).Updates(updates).Error
}

func (r *gormRepository) DeleteScript(ctx context.Context, id uint) (uint, error) {
	var item model.Script
	_ = r.db.WithContext(ctx).Select("id, project_id").First(&item, id).Error
	if err := r.db.WithContext(ctx).Delete(&model.Script{}, id).Error; err != nil {
		return 0, err
	}
	return item.ProjectID, nil
}

func (r *gormRepository) FindInitialVersion(ctx context.Context, projectID uint, scriptID uint) (model.ScriptVersion, bool, error) {
	var version model.ScriptVersion
	err := r.db.WithContext(ctx).Where("project_id = ? AND script_id = ? AND version_number = ?", projectID, scriptID, 1).First(&version).Error
	if err == nil {
		return version, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return version, false, nil
	}
	return version, false, err
}

func (r *gormRepository) UpdateScriptVersionWithRelations(ctx context.Context, version *model.ScriptVersion, updates map[string]any) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Model(version).Updates(updates).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, version)
}

func (r *gormRepository) CreateScriptVersionWithRelations(ctx context.Context, version *model.ScriptVersion) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(version).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, version)
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}
