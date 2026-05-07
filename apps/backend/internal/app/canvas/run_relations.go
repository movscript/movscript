package canvas

import (
	"context"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) createCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	return h.canvasRepo().CreateCanvasRun(context.Background(), run)
}

func (h *Service) saveCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	return h.canvasRepo().SaveCanvasRun(context.Background(), run)
}
