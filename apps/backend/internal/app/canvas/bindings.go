package canvas

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) createBinding(ctx context.Context, binding model.ResourceBinding) error {
	if h == nil || h.canvasRepo() == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return h.canvasRepo().CreateResourceBinding(ctx, binding)
}
