package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (s *Service) completeWorkItem(ctx context.Context, projectID uint, item *model.WorkItem, updates map[string]any, actorID *uint) (model.WorkItem, error) {
	return s.repo.CompleteWorkItem(ctx, projectID, item, updates, actorID)
}
