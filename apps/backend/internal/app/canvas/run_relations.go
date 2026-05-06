package canvas

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) createCanvasRunWithRelations(run *model.CanvasRun) error {
	return h.canvasRepo().CreateCanvasRun(context.Background(), run)
}

func (h *Service) saveCanvasRunWithRelations(run *model.CanvasRun) error {
	return h.canvasRepo().SaveCanvasRun(context.Background(), run)
}
