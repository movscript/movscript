package setting

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListSettings(ctx context.Context, filter ListFilter) ([]model.Setting, error)
	CreateSetting(ctx context.Context, item *model.Setting) error
	GetSetting(ctx context.Context, id uint) (model.Setting, error)
	SaveSetting(ctx context.Context, item *model.Setting) error
	DeleteSetting(ctx context.Context, id uint) error
	SettingNameExists(ctx context.Context, projectID uint, name string, excludeID uint) (bool, error)

	ListRefs(ctx context.Context, filter RefFilter) ([]model.ScriptSettingRef, error)
	GetRef(ctx context.Context, id uint) (model.ScriptSettingRef, error)
	ReloadRefWithSetting(ctx context.Context, item *model.ScriptSettingRef) error

	ListRelationships(ctx context.Context, filter RelationshipFilter) ([]model.SettingRelationship, error)
	GetRelationship(ctx context.Context, id uint) (model.SettingRelationship, error)
	ReloadRelationshipWithSettings(ctx context.Context, item *model.SettingRelationship) error
	RelationshipExists(ctx context.Context, item *model.SettingRelationship, excludeID uint) (bool, error)
	SettingBelongsToProject(ctx context.Context, settingID uint, projectID uint) (bool, error)
	ScriptBelongsToProject(ctx context.Context, scriptID uint, projectID uint) (bool, error)

	CreateCoreEntityWithRelations(ctx context.Context, item any) error
	SaveCoreEntityWithRelations(ctx context.Context, item any) error
	DeleteCoreEntityWithRelations(ctx context.Context, item any) error
}

type gormRepository struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

func (r *gormRepository) ListSettings(ctx context.Context, filter ListFilter) ([]model.Setting, error) {
	settings := make([]model.Setting, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.Type != "" {
		q = q.Where("type = ?", filter.Type)
	}
	if filter.ScriptID != "" {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	err := q.Order("type, name").Find(&settings).Error
	return settings, err
}

func (r *gormRepository) CreateSetting(ctx context.Context, item *model.Setting) error {
	return r.db.WithContext(ctx).Create(item).Error
}

func (r *gormRepository) GetSetting(ctx context.Context, id uint) (model.Setting, error) {
	var item model.Setting
	if err := r.db.WithContext(ctx).First(&item, id).Error; err != nil {
		return item, normalizeNotFound(err)
	}
	return item, nil
}

func (r *gormRepository) SaveSetting(ctx context.Context, item *model.Setting) error {
	return r.db.WithContext(ctx).Save(item).Error
}

func (r *gormRepository) DeleteSetting(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&model.Setting{}, id).Error
}

func (r *gormRepository) SettingNameExists(ctx context.Context, projectID uint, name string, excludeID uint) (bool, error) {
	q := r.db.WithContext(ctx).Model(&model.Setting{}).Where("project_id = ? AND name = ?", projectID, name)
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ListRefs(ctx context.Context, filter RefFilter) ([]model.ScriptSettingRef, error) {
	refs := make([]model.ScriptSettingRef, 0)
	q := r.db.WithContext(ctx).Preload("Setting").Preload("Script").Where("project_id = ?", filter.ProjectID)
	if filter.ScriptID != "" {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	if filter.SettingID != "" {
		q = q.Where("setting_id = ?", filter.SettingID)
	}
	if filter.Scope != "" {
		q = q.Where("scope = ?", filter.Scope)
	}
	err := q.Order(`script_id, "order", created_at`).Find(&refs).Error
	return refs, err
}

func (r *gormRepository) GetRef(ctx context.Context, id uint) (model.ScriptSettingRef, error) {
	var item model.ScriptSettingRef
	if err := r.db.WithContext(ctx).First(&item, id).Error; err != nil {
		return item, normalizeNotFound(err)
	}
	return item, nil
}

func (r *gormRepository) ReloadRefWithSetting(ctx context.Context, item *model.ScriptSettingRef) error {
	return r.db.WithContext(ctx).Preload("Setting").First(item, item.ID).Error
}

func (r *gormRepository) ListRelationships(ctx context.Context, filter RelationshipFilter) ([]model.SettingRelationship, error) {
	items := make([]model.SettingRelationship, 0)
	q := r.db.WithContext(ctx).Preload("SourceSetting").Preload("TargetSetting").Where("project_id = ?", filter.ProjectID)
	if filter.Category != "" {
		q = q.Where("category = ?", filter.Category)
	}
	if filter.ScopeScriptID != "" {
		q = q.Where("scope_script_id = ?", filter.ScopeScriptID)
	}
	err := q.Order("created_at").Find(&items).Error
	return items, err
}

func (r *gormRepository) GetRelationship(ctx context.Context, id uint) (model.SettingRelationship, error) {
	var item model.SettingRelationship
	if err := r.db.WithContext(ctx).First(&item, id).Error; err != nil {
		return item, normalizeNotFound(err)
	}
	return item, nil
}

func (r *gormRepository) ReloadRelationshipWithSettings(ctx context.Context, item *model.SettingRelationship) error {
	return r.db.WithContext(ctx).Preload("SourceSetting").Preload("TargetSetting").First(item, item.ID).Error
}

func (r *gormRepository) RelationshipExists(ctx context.Context, item *model.SettingRelationship, excludeID uint) (bool, error) {
	q := r.db.WithContext(ctx).Model(&model.SettingRelationship{}).
		Where("project_id = ? AND source_setting_id = ? AND target_setting_id = ? AND category = ? AND type = ?", item.ProjectID, item.SourceSettingID, item.TargetSettingID, item.Category, item.Type)
	if item.ScopeScriptID == nil {
		q = q.Where("scope_script_id IS NULL")
	} else {
		q = q.Where("scope_script_id = ?", *item.ScopeScriptID)
	}
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) SettingBelongsToProject(ctx context.Context, settingID uint, projectID uint) (bool, error) {
	return r.existsInProject(ctx, &model.Setting{}, settingID, projectID)
}

func (r *gormRepository) ScriptBelongsToProject(ctx context.Context, scriptID uint, projectID uint) (bool, error) {
	return r.existsInProject(ctx, &model.Script{}, scriptID, projectID)
}

func (r *gormRepository) CreateCoreEntityWithRelations(ctx context.Context, item any) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(item).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, item)
}

func (r *gormRepository) SaveCoreEntityWithRelations(ctx context.Context, item any) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(item).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, item)
}

func (r *gormRepository) DeleteCoreEntityWithRelations(ctx context.Context, item any) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Delete(item).Error; err != nil {
		return err
	}
	return entityrelation.DeleteCoreEntityRelations(db, item)
}

func (r *gormRepository) existsInProject(ctx context.Context, item any, id uint, projectID uint) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(item).Where("id = ? AND project_id = ?", id, projectID).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}
