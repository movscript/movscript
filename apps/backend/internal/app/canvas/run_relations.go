package canvas

import (
	"context"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) createCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	created, err := h.canvasRepo().CreateCanvasRun(context.Background(), canvasdomain.CanvasRunFromModel(*run))
	if err != nil {
		return err
	}
	*run = created.ToModel()
	return nil
}

func (h *Service) saveCanvasRunWithRelations(run *persistencemodel.CanvasRun) error {
	return h.canvasRepo().SaveCanvasRun(context.Background(), canvasdomain.CanvasRunFromModel(*run))
}
