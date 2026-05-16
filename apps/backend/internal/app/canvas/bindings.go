package canvas

import (
	"context"

	domainresourcebinding "github.com/movscript/movscript/internal/domain/resource/binding"
)

func (h *Service) createBinding(ctx context.Context, binding domainresourcebinding.Binding) error {
	if h == nil || h.canvasRepo() == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return h.canvasRepo().CreateResourceBinding(ctx, binding)
}
