package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (s *Service) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]model.ScriptVersion, error) {
	return s.repo.ListScriptVersions(ctx, filter)
}

func (s *Service) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (model.ScriptVersion, error) {
	item, err := s.repo.CreateScriptVersion(ctx, projectID, input, createdByID)
	if err != nil {
		return item, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return item, nil
}

func (s *Service) PatchScriptVersion(ctx context.Context, projectID uint, id string, input PatchScriptVersionInput) (model.ScriptVersion, error) {
	var item model.ScriptVersion
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"title":             input.Title,
		"source_type":       input.SourceType,
		"content":           input.Content,
		"raw_source":        input.RawSource,
		"summary":           input.Summary,
		"status":            input.Status,
		"parent_version_id": input.ParentVersionID,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	return s.repo.NextScriptVersionNumber(ctx, projectID, scriptID)
}
