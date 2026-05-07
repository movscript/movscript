package canvas

import (
	"context"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) createBinding(ctx context.Context, binding persistencemodel.ResourceBinding) error {
	if h == nil || h.canvasRepo() == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return h.canvasRepo().CreateResourceBinding(ctx, binding)
}
