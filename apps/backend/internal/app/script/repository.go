package script

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/cache"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListScripts(ctx context.Context, filter ListFilter) ([]domainscript.ScriptSnapshot, error)
	CreateScript(ctx context.Context, item *domainscript.ScriptSnapshot) error
	GetScript(ctx context.Context, id uint) (domainscript.ScriptSnapshot, error)
	SaveScript(ctx context.Context, item *domainscript.ScriptSnapshot) error
	PatchScript(ctx context.Context, item *domainscript.ScriptSnapshot, updates map[string]any) error
	DeleteScript(ctx context.Context, id uint) (uint, error)

	FindInitialVersion(ctx context.Context, projectID uint, scriptID uint) (domainscript.ScriptVersion, bool, error)
	UpdateScriptVersionWithRelations(ctx context.Context, version *domainscript.ScriptVersion, updates map[string]any) error
	CreateScriptVersionWithRelations(ctx context.Context, version *domainscript.ScriptVersion) error
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

func (r *gormRepository) ListScripts(ctx context.Context, filter ListFilter) ([]domainscript.ScriptSnapshot, error) {
	scripts := make([]persistencemodel.Script, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.Type != "" {
		q = q.Where("script_type = ?", filter.Type)
	}
	if filter.AssigneeID != "" {
		q = q.Where("assignee_id = ?", filter.AssigneeID)
	}
	err := q.Order(`"order", created_at`).Find(&scripts).Error
	if err != nil {
		return nil, err
	}
	items := make([]domainscript.ScriptSnapshot, 0, len(scripts))
	for _, script := range scripts {
		items = append(items, domainscript.ScriptSnapshotFromModel(script))
	}
	return items, nil
}

func (r *gormRepository) CreateScript(ctx context.Context, item *domainscript.ScriptSnapshot) error {
	row := item.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*item = domainscript.ScriptSnapshotFromModel(row)
	return nil
}

func (r *gormRepository) GetScript(ctx context.Context, id uint) (domainscript.ScriptSnapshot, error) {
	var item persistencemodel.Script
	if err := r.db.WithContext(ctx).First(&item, id).Error; err != nil {
		return domainscript.ScriptSnapshot{}, normalizeNotFound(err)
	}
	return domainscript.ScriptSnapshotFromModel(item), nil
}

func (r *gormRepository) SaveScript(ctx context.Context, item *domainscript.ScriptSnapshot) error {
	row := item.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*item = domainscript.ScriptSnapshotFromModel(row)
	return nil
}

func (r *gormRepository) PatchScript(ctx context.Context, item *domainscript.ScriptSnapshot, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	row := item.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(updates).Error; err != nil {
		return err
	}
	*item = domainscript.ScriptSnapshotFromModel(row)
	return nil
}

func (r *gormRepository) DeleteScript(ctx context.Context, id uint) (uint, error) {
	var item persistencemodel.Script
	_ = r.db.WithContext(ctx).Select("id, project_id").First(&item, id).Error
	if err := r.db.WithContext(ctx).Delete(&persistencemodel.Script{}, id).Error; err != nil {
		return 0, err
	}
	return item.ProjectID, nil
}

func (r *gormRepository) FindInitialVersion(ctx context.Context, projectID uint, scriptID uint) (domainscript.ScriptVersion, bool, error) {
	var version persistencemodel.ScriptVersion
	err := r.db.WithContext(ctx).Where("project_id = ? AND script_id = ? AND version_number = ?", projectID, scriptID, 1).First(&version).Error
	if err == nil {
		return domainscript.ScriptVersionFromModel(version), true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domainscript.ScriptVersion{}, false, nil
	}
	return domainscript.ScriptVersion{}, false, err
}

func (r *gormRepository) UpdateScriptVersionWithRelations(ctx context.Context, version *domainscript.ScriptVersion, updates map[string]any) error {
	row := version.ToModel()
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Model(&row).Updates(updates).Error; err != nil {
		return err
	}
	if err := db.First(&row, row.ID).Error; err != nil {
		return err
	}
	*version = domainscript.ScriptVersionFromModel(row)
	return entityrelation.SyncCoreEntityRelations(db, &row)
}

func (r *gormRepository) CreateScriptVersionWithRelations(ctx context.Context, version *domainscript.ScriptVersion) error {
	row := version.ToModel()
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(&row).Error; err != nil {
		return err
	}
	*version = domainscript.ScriptVersionFromModel(row)
	return entityrelation.SyncCoreEntityRelations(db, &row)
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}
