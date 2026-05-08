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
	patch := domainsemantic.ScriptVersionPatch{
		Title:           input.Title,
		SourceType:      input.SourceType,
		Content:         input.Content,
		RawSource:       input.RawSource,
		Summary:         input.Summary,
		Status:          input.Status,
		ParentVersionID: input.ParentVersionID,
	}
	return s.repo.PatchScriptVersion(ctx, item, patch)
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	return s.repo.NextScriptVersionNumber(ctx, projectID, scriptID)
}
