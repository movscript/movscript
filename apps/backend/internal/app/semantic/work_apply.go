package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) completeWorkItem(ctx context.Context, projectID uint, item domainsemantic.WorkItem, updates map[string]any, actorID *uint) (domainsemantic.WorkItem, error) {
	return s.repo.CompleteWorkItem(ctx, projectID, item, updates, actorID)
}
