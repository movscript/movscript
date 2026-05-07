package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]domainsemantic.ScriptVersion, error) {
	return s.repo.ListScriptVersions(ctx, filter)
}

func (s *Service) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (domainsemantic.ScriptVersion, error) {
	item, err := s.repo.CreateScriptVersion(ctx, projectID, input, createdByID)
	if err != nil {
		return item, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return item, nil
}

func (s *Service) PatchScriptVersion(ctx context.Context, projectID uint, id string, input PatchScriptVersionInput) (domainsemantic.ScriptVersion, error) {
	item, err := s.repo.LoadScriptVersion(ctx, projectID, id)
	if err != nil {
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
	return s.repo.PatchScriptVersion(ctx, item, updates)
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	return s.repo.NextScriptVersionNumber(ctx, projectID, scriptID)
}
