package canvas

import (
	"context"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (h *Service) createCanvasRunWithRelations(run *model.CanvasRun) error {
	return h.canvasRepo().CreateCanvasRun(context.Background(), run)
}

func (h *Service) saveCanvasRunWithRelations(run *model.CanvasRun) error {
	return h.canvasRepo().SaveCanvasRun(context.Background(), run)
}

func saveCanvasWithRelations(db *gorm.DB, cv *model.Canvas) error {
	db = db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(cv).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, cv)
}
