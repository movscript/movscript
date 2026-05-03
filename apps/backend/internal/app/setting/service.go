package setting

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/model"
	dto "github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

var (
	ErrNotFound     = errors.New("setting not found")
	ErrInvalidInput = errors.New("invalid setting input")
	ErrConflict     = errors.New("setting conflict")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ListFilter struct {
	ProjectID uint
	Type      string
	ScriptID  string
}

type RefFilter struct {
	ProjectID uint
	ScriptID  string
	SettingID string
	Scope     string
}

type RelationshipFilter struct {
	ProjectID     uint
	Category      string
	ScopeScriptID string
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]model.Setting, error) {
	settings := make([]model.Setting, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.Type != "" {
		q = q.Where("type = ?", filter.Type)
	}
	if filter.ScriptID != "" {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	err := q.Order("type, name").Find(&settings).Error
	return settings, err
}

func (s *Service) Create(ctx context.Context, projectID uint, input dto.SettingInput) (model.Setting, error) {
	var item model.Setting
	dto.ApplySettingInput(&item, input)
	item.ProjectID = projectID
	normalizeSetting(&item)
	if item.Name == "" {
		return item, fmt.Errorf("%w: 设定名称不能为空", ErrInvalidInput)
	}
	if s.settingNameExists(ctx, item.ProjectID, item.Name, 0) {
		return item, ErrConflict
	}
	if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) Update(ctx context.Context, id uint, input dto.SettingInput) (model.Setting, error) {
	var item model.Setting
	if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return item, ErrNotFound
		}
		return item, err
	}
	dto.ApplySettingInput(&item, input)
	normalizeSetting(&item)
	if item.Name == "" {
		return item, fmt.Errorf("%w: 设定名称不能为空", ErrInvalidInput)
	}
	if s.settingNameExists(ctx, item.ProjectID, item.Name, item.ID) {
		return item, ErrConflict
	}
	if err := s.db.WithContext(ctx).Save(&item).Error; err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&model.Setting{}, id).Error
}

func (s *Service) ListRefs(ctx context.Context, filter RefFilter) ([]model.ScriptSettingRef, error) {
	refs := make([]model.ScriptSettingRef, 0)
	q := s.db.WithContext(ctx).Preload("Setting").Preload("Script").Where("project_id = ?", filter.ProjectID)
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

func (s *Service) CreateRef(ctx context.Context, projectID uint, input dto.ScriptSettingRefInput) (model.ScriptSettingRef, error) {
	var ref model.ScriptSettingRef
	dto.ApplyScriptSettingRefInput(&ref, input)
	ref.ProjectID = projectID
	if ref.Source == "" {
		ref.Source = "manual"
	}
	if err := s.db.WithContext(ctx).Create(&ref).Error; err != nil {
		return ref, err
	}
	_ = s.db.WithContext(ctx).Preload("Setting").First(&ref, ref.ID).Error
	return ref, nil
}

func (s *Service) UpdateRef(ctx context.Context, id uint, input dto.ScriptSettingRefInput) (model.ScriptSettingRef, error) {
	var ref model.ScriptSettingRef
	if err := s.db.WithContext(ctx).First(&ref, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ref, ErrNotFound
		}
		return ref, err
	}
	dto.ApplyScriptSettingRefInput(&ref, input)
	if err := s.db.WithContext(ctx).Save(&ref).Error; err != nil {
		return ref, err
	}
	_ = s.db.WithContext(ctx).Preload("Setting").First(&ref, ref.ID).Error
	return ref, nil
}

func (s *Service) DeleteRef(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&model.ScriptSettingRef{}, id).Error
}

func (s *Service) ListRelationships(ctx context.Context, filter RelationshipFilter) ([]model.SettingRelationship, error) {
	items := make([]model.SettingRelationship, 0)
	q := s.db.WithContext(ctx).Preload("SourceSetting").Preload("TargetSetting").Where("project_id = ?", filter.ProjectID)
	if filter.Category != "" {
		q = q.Where("category = ?", filter.Category)
	}
	if filter.ScopeScriptID != "" {
		q = q.Where("scope_script_id = ?", filter.ScopeScriptID)
	}
	err := q.Order("created_at").Find(&items).Error
	return items, err
}

func (s *Service) CreateRelationship(ctx context.Context, projectID uint, input dto.SettingRelationshipInput) (model.SettingRelationship, error) {
	var item model.SettingRelationship
	dto.ApplySettingRelationshipInput(&item, input)
	item.ProjectID = projectID
	normalizeRelationship(&item)
	if err := s.validateRelationship(ctx, &item); err != nil {
		return item, err
	}
	if s.relationshipExists(ctx, &item, 0) {
		return item, ErrConflict
	}
	if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
		return item, err
	}
	_ = s.db.WithContext(ctx).Preload("SourceSetting").Preload("TargetSetting").First(&item, item.ID).Error
	return item, nil
}

func (s *Service) UpdateRelationship(ctx context.Context, id uint, input dto.SettingRelationshipInput) (model.SettingRelationship, error) {
	var item model.SettingRelationship
	if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return item, ErrNotFound
		}
		return item, err
	}
	dto.ApplySettingRelationshipInput(&item, input)
	normalizeRelationship(&item)
	if err := s.validateRelationship(ctx, &item); err != nil {
		return item, err
	}
	if s.relationshipExists(ctx, &item, item.ID) {
		return item, ErrConflict
	}
	if err := s.db.WithContext(ctx).Save(&item).Error; err != nil {
		return item, err
	}
	_ = s.db.WithContext(ctx).Preload("SourceSetting").Preload("TargetSetting").First(&item, item.ID).Error
	return item, nil
}

func (s *Service) DeleteRelationship(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&model.SettingRelationship{}, id).Error
}

func normalizeSetting(item *model.Setting) {
	item.Name = strings.TrimSpace(item.Name)
	item.Status = strings.TrimSpace(item.Status)
	if item.Status == "" {
		item.Status = "default"
	}
}

func normalizeRelationship(item *model.SettingRelationship) {
	if item.Source == "" {
		item.Source = "manual"
	}
	if item.Category == "" {
		item.Category = "relationship"
	}
}

func (s *Service) validateRelationship(ctx context.Context, r *model.SettingRelationship) error {
	if r.ProjectID == 0 {
		return fmt.Errorf("%w: 项目 ID 无效", ErrInvalidInput)
	}
	if r.SourceSettingID == 0 || r.TargetSettingID == 0 {
		return fmt.Errorf("%w: 关系两端设定不能为空", ErrInvalidInput)
	}
	if r.SourceSettingID == r.TargetSettingID {
		return fmt.Errorf("%w: 关系两端不能是同一个设定", ErrInvalidInput)
	}
	if strings.TrimSpace(r.Category) == "" {
		return fmt.Errorf("%w: 关系分类不能为空", ErrInvalidInput)
	}
	var sourceSetting model.Setting
	if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", r.SourceSettingID, r.ProjectID).First(&sourceSetting).Error; err != nil {
		return fmt.Errorf("%w: 起点设定不存在或不属于当前项目", ErrInvalidInput)
	}
	var targetSetting model.Setting
	if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", r.TargetSettingID, r.ProjectID).First(&targetSetting).Error; err != nil {
		return fmt.Errorf("%w: 终点设定不存在或不属于当前项目", ErrInvalidInput)
	}
	if r.ScopeScriptID != nil {
		var script model.Script
		if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", *r.ScopeScriptID, r.ProjectID).First(&script).Error; err != nil {
			return fmt.Errorf("%w: 作用域剧本不存在或不属于当前项目", ErrInvalidInput)
		}
	}
	return nil
}

func (s *Service) relationshipExists(ctx context.Context, r *model.SettingRelationship, excludeID uint) bool {
	q := s.db.WithContext(ctx).Model(&model.SettingRelationship{}).
		Where("project_id = ? AND source_setting_id = ? AND target_setting_id = ? AND category = ? AND type = ?", r.ProjectID, r.SourceSettingID, r.TargetSettingID, r.Category, r.Type)
	if r.ScopeScriptID == nil {
		q = q.Where("scope_script_id IS NULL")
	} else {
		q = q.Where("scope_script_id = ?", *r.ScopeScriptID)
	}
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	q.Count(&count)
	return count > 0
}

func (s *Service) settingNameExists(ctx context.Context, projectID uint, name string, excludeID uint) bool {
	q := s.db.WithContext(ctx).Model(&model.Setting{}).Where("project_id = ? AND name = ?", projectID, name)
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	q.Count(&count)
	return count > 0
}
