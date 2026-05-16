package script

import (
	"context"
	"errors"

	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/cache"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/relation"
	"gorm.io/gorm"
)

type repository interface {
	ListScripts(ctx context.Context, filter ListFilter) ([]domainscript.ScriptSnapshot, error)
	CreateScript(ctx context.Context, item *domainscript.ScriptSnapshot) error
	GetScript(ctx context.Context, id uint) (domainscript.ScriptSnapshot, error)
	SaveScript(ctx context.Context, item *domainscript.ScriptSnapshot) error
	PatchScript(ctx context.Context, item *domainscript.ScriptSnapshot, spec domainscript.ScriptPatchSpec) error
	DeleteScript(ctx context.Context, id uint) (uint, error)

	FindInitialVersion(ctx context.Context, projectID uint, scriptID uint) (domainscript.ScriptVersion, bool, error)
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

func (r *gormRepository) PatchScript(ctx context.Context, item *domainscript.ScriptSnapshot, spec domainscript.ScriptPatchSpec) error {
	updates := scriptPatchColumns(spec)
	if len(updates) == 0 {
		return nil
	}
	row := item.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(updates).Error; err != nil {
		return err
	}
	item.ApplyPatch(spec)
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

func scriptPatchColumns(spec domainscript.ScriptPatchSpec) map[string]any {
	updates := map[string]any{}
	if spec.Title != nil {
		updates["title"] = *spec.Title
	}
	if spec.Description != nil {
		updates["description"] = *spec.Description
	}
	if spec.Content != nil {
		updates["content"] = *spec.Content
	}
	if spec.RawSource != nil {
		updates["raw_source"] = *spec.RawSource
	}
	if spec.ScriptType != nil {
		updates["script_type"] = *spec.ScriptType
	}
	if spec.SourceType != nil {
		updates["source_type"] = *spec.SourceType
	}
	if spec.Version != nil {
		updates["version"] = *spec.Version
	}
	if spec.ParentScriptID != nil {
		updates["parent_script_id"] = *spec.ParentScriptID
	}
	if spec.AssigneeID != nil {
		updates["assignee_id"] = *spec.AssigneeID
	}
	if spec.Summary != nil {
		updates["summary"] = *spec.Summary
	}
	if spec.Characters != nil {
		updates["characters"] = *spec.Characters
	}
	if spec.CharacterRelationships != nil {
		updates["character_relationships"] = *spec.CharacterRelationships
	}
	if spec.CoreSettings != nil {
		updates["core_settings"] = *spec.CoreSettings
	}
	if spec.Background != nil {
		updates["background"] = *spec.Background
	}
	if spec.ScenesDesc != nil {
		updates["scenes_desc"] = *spec.ScenesDesc
	}
	if spec.Hook != nil {
		updates["hook"] = *spec.Hook
	}
	if spec.PlotSummary != nil {
		updates["plot_summary"] = *spec.PlotSummary
	}
	if spec.ScriptPoints != nil {
		updates["script_points"] = *spec.ScriptPoints
	}
	if spec.PlannedSceneCount != nil {
		updates["planned_scene_count"] = *spec.PlannedSceneCount
	}
	if spec.TimeText != nil {
		updates["time_text"] = *spec.TimeText
	}
	if spec.LocationText != nil {
		updates["location_text"] = *spec.LocationText
	}
	if spec.StructuredCharacters != nil {
		updates["structured_characters"] = *spec.StructuredCharacters
	}
	if spec.PlotBeats != nil {
		updates["plot_beats"] = *spec.PlotBeats
	}
	if spec.Atmosphere != nil {
		updates["atmosphere"] = *spec.Atmosphere
	}
	if spec.StructureJSON != nil {
		updates["structure_json"] = *spec.StructureJSON
	}
	if spec.EntityCandidates != nil {
		updates["entity_candidates"] = *spec.EntityCandidates
	}
	if spec.RelationshipCandidates != nil {
		updates["relationship_candidates"] = *spec.RelationshipCandidates
	}
	if spec.Order != nil {
		updates["order"] = *spec.Order
	}
	return updates
}

func (r *gormRepository) CreateScriptVersionWithRelations(ctx context.Context, version *domainscript.ScriptVersion) error {
	row := version.ToModel()
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(&row).Error; err != nil {
		return err
	}
	*version = domainscript.ScriptVersionFromModel(row)
	return relation.SyncCoreEntityRelations(db, &row)
}

func normalizeNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}
