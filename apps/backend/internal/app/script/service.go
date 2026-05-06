package script

import (
	"context"
	"errors"
	"fmt"

	dto "github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/domain/model"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/cache"
)

var (
	ErrNotFound    = errors.New("script not found")
	ErrVersionSync = errors.New("script version sync failed")
)

type Service struct {
	repo  repository
	cache cache.Cache
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
	return s.repo.ListScripts(ctx, filter)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (model.Script, error) {
	var item model.Script
	dto.ApplyScriptInput(&item, input.Script)
	item.ProjectID = input.ProjectID
	NormalizeDefaults(&item)
	item.AuthorID = input.AuthorID
	if err := s.repo.CreateScript(ctx, &item); err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.CreatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) Get(ctx context.Context, id uint) (model.Script, error) {
	return s.repo.GetScript(ctx, id)
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
	if err := s.repo.SaveScript(ctx, &item); err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	projectID, err := s.repo.DeleteScript(ctx, id)
	if err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, projectID)
	return nil
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
		if err := s.repo.PatchScript(ctx, &item, updates); err != nil {
			return item, err
		}
	}
	item, err = s.repo.GetScript(ctx, item.ID)
	if err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, fmt.Sprintf("project:%d:progress", projectID))
}

func NormalizeDefaults(item *model.Script) {
	domainscript.NormalizeDefaults(item)
}

func (s *Service) ensureInitialVersion(ctx context.Context, item *model.Script, createdByID *uint) error {
	if item == nil || item.ID == 0 {
		return nil
	}
	version, found, err := s.repo.FindInitialVersion(ctx, item.ProjectID, item.ID)
	if err != nil {
		return err
	}
	if found {
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
		return s.repo.UpdateScriptVersionWithRelations(ctx, &version, updates)
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
	return s.repo.CreateScriptVersionWithRelations(ctx, &version)
}

func wrapVersionSync(err error) error {
	if err == nil {
		return nil
	}
	return errors.Join(ErrVersionSync, err)
}
