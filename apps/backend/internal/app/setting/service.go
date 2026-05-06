package setting

import (
	"context"
	"errors"
	"fmt"
	"strings"

	dto "github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/domain/model"
	domainsetting "github.com/movscript/movscript/internal/domain/setting"
)

var (
	ErrNotFound     = errors.New("setting not found")
	ErrInvalidInput = errors.New("invalid setting input")
	ErrConflict     = errors.New("setting conflict")
)

type Service struct {
	repo repository
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
	return s.repo.ListSettings(ctx, filter)
}

func (s *Service) Create(ctx context.Context, projectID uint, input dto.SettingInput) (model.Setting, error) {
	var item model.Setting
	dto.ApplySettingInput(&item, input)
	item.ProjectID = projectID
	normalizeSetting(&item)
	if item.Name == "" {
		return item, fmt.Errorf("%w: 设定名称不能为空", ErrInvalidInput)
	}
	exists, err := s.repo.SettingNameExists(ctx, item.ProjectID, item.Name, 0)
	if err != nil {
		return item, err
	}
	if exists {
		return item, ErrConflict
	}
	if err := s.repo.CreateSetting(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) Update(ctx context.Context, id uint, input dto.SettingInput) (model.Setting, error) {
	item, err := s.repo.GetSetting(ctx, id)
	if err != nil {
		return item, err
	}
	dto.ApplySettingInput(&item, input)
	normalizeSetting(&item)
	if item.Name == "" {
		return item, fmt.Errorf("%w: 设定名称不能为空", ErrInvalidInput)
	}
	exists, err := s.repo.SettingNameExists(ctx, item.ProjectID, item.Name, item.ID)
	if err != nil {
		return item, err
	}
	if exists {
		return item, ErrConflict
	}
	if err := s.repo.SaveSetting(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	return s.repo.DeleteSetting(ctx, id)
}

func (s *Service) ListRefs(ctx context.Context, filter RefFilter) ([]model.ScriptSettingRef, error) {
	return s.repo.ListRefs(ctx, filter)
}

func (s *Service) CreateRef(ctx context.Context, projectID uint, input dto.ScriptSettingRefInput) (model.ScriptSettingRef, error) {
	var ref model.ScriptSettingRef
	dto.ApplyScriptSettingRefInput(&ref, input)
	ref.ProjectID = projectID
	if ref.Source == "" {
		ref.Source = "manual"
	}
	if err := s.repo.CreateCoreEntityWithRelations(ctx, &ref); err != nil {
		return ref, err
	}
	_ = s.repo.ReloadRefWithSetting(ctx, &ref)
	return ref, nil
}

func (s *Service) UpdateRef(ctx context.Context, id uint, input dto.ScriptSettingRefInput) (model.ScriptSettingRef, error) {
	ref, err := s.repo.GetRef(ctx, id)
	if err != nil {
		return ref, err
	}
	dto.ApplyScriptSettingRefInput(&ref, input)
	if err := s.repo.SaveCoreEntityWithRelations(ctx, &ref); err != nil {
		return ref, err
	}
	_ = s.repo.ReloadRefWithSetting(ctx, &ref)
	return ref, nil
}

func (s *Service) DeleteRef(ctx context.Context, id uint) error {
	ref, err := s.repo.GetRef(ctx, id)
	if err != nil {
		return err
	}
	return s.repo.DeleteCoreEntityWithRelations(ctx, &ref)
}

func (s *Service) ListRelationships(ctx context.Context, filter RelationshipFilter) ([]model.SettingRelationship, error) {
	return s.repo.ListRelationships(ctx, filter)
}

func (s *Service) CreateRelationship(ctx context.Context, projectID uint, input dto.SettingRelationshipInput) (model.SettingRelationship, error) {
	var item model.SettingRelationship
	dto.ApplySettingRelationshipInput(&item, input)
	item.ProjectID = projectID
	normalizeRelationship(&item)
	if err := s.validateRelationship(ctx, &item); err != nil {
		return item, err
	}
	exists, err := s.repo.RelationshipExists(ctx, &item, 0)
	if err != nil {
		return item, err
	}
	if exists {
		return item, ErrConflict
	}
	if err := s.repo.CreateCoreEntityWithRelations(ctx, &item); err != nil {
		return item, err
	}
	_ = s.repo.ReloadRelationshipWithSettings(ctx, &item)
	return item, nil
}

func (s *Service) UpdateRelationship(ctx context.Context, id uint, input dto.SettingRelationshipInput) (model.SettingRelationship, error) {
	item, err := s.repo.GetRelationship(ctx, id)
	if err != nil {
		return item, err
	}
	dto.ApplySettingRelationshipInput(&item, input)
	normalizeRelationship(&item)
	if err := s.validateRelationship(ctx, &item); err != nil {
		return item, err
	}
	exists, err := s.repo.RelationshipExists(ctx, &item, item.ID)
	if err != nil {
		return item, err
	}
	if exists {
		return item, ErrConflict
	}
	if err := s.repo.SaveCoreEntityWithRelations(ctx, &item); err != nil {
		return item, err
	}
	_ = s.repo.ReloadRelationshipWithSettings(ctx, &item)
	return item, nil
}

func (s *Service) DeleteRelationship(ctx context.Context, id uint) error {
	item, err := s.repo.GetRelationship(ctx, id)
	if err != nil {
		return err
	}
	return s.repo.DeleteCoreEntityWithRelations(ctx, &item)
}

func normalizeSetting(item *model.Setting) {
	domainsetting.NormalizeSetting(item)
}

func normalizeRelationship(item *model.SettingRelationship) {
	domainsetting.NormalizeRelationship(item)
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
	sourceOK, err := s.repo.SettingBelongsToProject(ctx, r.SourceSettingID, r.ProjectID)
	if err != nil {
		return err
	}
	if !sourceOK {
		return fmt.Errorf("%w: 起点设定不存在或不属于当前项目", ErrInvalidInput)
	}
	targetOK, err := s.repo.SettingBelongsToProject(ctx, r.TargetSettingID, r.ProjectID)
	if err != nil {
		return err
	}
	if !targetOK {
		return fmt.Errorf("%w: 终点设定不存在或不属于当前项目", ErrInvalidInput)
	}
	if r.ScopeScriptID != nil {
		scriptOK, err := s.repo.ScriptBelongsToProject(ctx, *r.ScopeScriptID, r.ProjectID)
		if err != nil {
			return err
		}
		if !scriptOK {
			return fmt.Errorf("%w: 作用域剧本不存在或不属于当前项目", ErrInvalidInput)
		}
	}
	return nil
}
