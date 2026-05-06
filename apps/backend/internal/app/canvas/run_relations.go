package canvas

import (
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (h *Service) createCanvasRunWithRelations(run *model.CanvasRun) error {
	db := h.db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(run).Error; err != nil {
		return err
	}
	return model.SyncCoreEntityRelations(db, run)
}

func (h *Service) saveCanvasRunWithRelations(run *model.CanvasRun) error {
	db := h.db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(run).Error; err != nil {
		return err
	}
	return model.SyncCoreEntityRelations(db, run)
}

func saveCanvasWithRelations(db *gorm.DB, cv *model.Canvas) error {
	db = db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(cv).Error; err != nil {
		return err
	}
	return model.SyncCoreEntityRelations(db, cv)
}
