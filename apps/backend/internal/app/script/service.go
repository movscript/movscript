package script

import (
	"context"
	"errors"

	dto "github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/domain/model"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"gorm.io/gorm"
)

var (
	ErrNotFound    = errors.New("script not found")
	ErrVersionSync = errors.New("script version sync failed")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ListFilter struct {
	ProjectID  uint
	Type       string
	AssigneeID string
}

type CreateInput struct {
	ProjectID   uint
	AuthorID    uint
	CreatedByID *uint
	Script      dto.ScriptInput
}

type UpdateInput struct {
	ID          uint
	UpdatedByID *uint
	Script      dto.ScriptInput
}

type PatchInput struct {
	ID          uint
	UpdatedByID *uint
	Body        map[string]any
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]model.Script, error) {
	scripts := make([]model.Script, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.Type != "" {
		q = q.Where("script_type = ?", filter.Type)
	}
	if filter.AssigneeID != "" {
		q = q.Where("assignee_id = ?", filter.AssigneeID)
	}
	err := q.Order(`"order", created_at`).Find(&scripts).Error
	return scripts, err
}

func (s *Service) Create(ctx context.Context, input CreateInput) (model.Script, error) {
	var item model.Script
	dto.ApplyScriptInput(&item, input.Script)
	item.ProjectID = input.ProjectID
	NormalizeDefaults(&item)
	item.AuthorID = input.AuthorID
	if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.CreatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	return item, nil
}

func (s *Service) Get(ctx context.Context, id uint) (model.Script, error) {
	var item model.Script
	if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return item, ErrNotFound
		}
		return item, err
	}
	return item, nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (model.Script, error) {
	item, err := s.Get(ctx, input.ID)
	if err != nil {
		return item, err
	}
	projectID := item.ProjectID
	dto.ApplyScriptInput(&item, input.Script)
	item.ProjectID = projectID
	NormalizeDefaults(&item)
	if err := s.db.WithContext(ctx).Save(&item).Error; err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	return item, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&model.Script{}, id).Error
}

func (s *Service) Patch(ctx context.Context, input PatchInput) (model.Script, error) {
	item, err := s.Get(ctx, input.ID)
	if err != nil {
		return item, err
	}
	next := item
	if scriptType, ok := input.Body["script_type"].(string); ok {
		next.ScriptType = scriptType
	}
	NormalizeDefaults(&next)
	updates := dto.ScriptPatchUpdates(input.Body)
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&item).Updates(updates).Error; err != nil {
			return item, err
		}
	}
	if err := s.db.WithContext(ctx).First(&item, item.ID).Error; err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	return item, nil
}

func NormalizeDefaults(item *model.Script) {
	domainscript.NormalizeDefaults(item)
}

func (s *Service) ensureInitialVersion(ctx context.Context, item *model.Script, createdByID *uint) error {
	if item == nil || item.ID == 0 {
		return nil
	}
	var version model.ScriptVersion
	err := s.db.WithContext(ctx).Where("project_id = ? AND script_id = ? AND version_number = ?", item.ProjectID, item.ID, 1).First(&version).Error
	if err == nil {
		updates := map[string]any{
			"title":       item.Title,
			"source_type": item.SourceType,
			"content":     item.Content,
			"raw_source":  item.RawSource,
			"summary":     item.Summary,
		}
		if version.Status == "" {
			updates["status"] = "active"
		}
		return s.db.WithContext(ctx).Model(&version).Updates(updates).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	version = model.ScriptVersion{
		ProjectID:     item.ProjectID,
		ScriptID:      item.ID,
		VersionNumber: 1,
		Title:         item.Title,
		SourceType:    item.SourceType,
		Content:       item.Content,
		RawSource:     item.RawSource,
		Summary:       item.Summary,
		Status:        "active",
		CreatedByID:   createdByID,
	}
	if version.SourceType == "" {
		version.SourceType = "raw"
	}
	return s.db.WithContext(ctx).Create(&version).Error
}

func wrapVersionSync(err error) error {
	if err == nil {
		return nil
	}
	return errors.Join(ErrVersionSync, err)
}
