package canvas

import (
	"context"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) createCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	created, err := h.canvasRepo().CreateCanvasRun(context.Background(), canvasruntime.CanvasRunFromModel(*run))
	if err != nil {
		return err
	}
	*run = created.ToModel()
	return nil
}

func (h *Service) saveCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	return h.canvasRepo().SaveCanvasRun(context.Background(), canvasruntime.CanvasRunFromModel(*run))
}
