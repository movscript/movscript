package canvasservice

import (
	"context"
	"fmt"

	resourcebinding "github.com/movscript/movscript/internal/app/resourcebinding"
	"github.com/movscript/movscript/internal/model"
)

func (h *Service) createBinding(ctx context.Context, binding model.ResourceBinding) error {
	if h == nil || h.db == nil {
		return fmt.Errorf("resource binding db is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return resourcebinding.NewService(h.db).CreateBinding(ctx, &binding)
}
