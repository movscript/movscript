package workflowmarket

import (
	"context"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
	"gorm.io/gorm"
)

type repository interface {
	ListPublicCanvases(ctx context.Context) ([]domainmarket.PublicCanvas, error)
	FindWorkflowCanvasesByKey(ctx context.Context, key string, userID uint) ([]domainmarket.PublicCanvas, error)
	CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (model.Canvas, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListPublicCanvases(ctx context.Context) ([]domainmarket.PublicCanvas, error) {
	canvases := make([]model.Canvas, 0)
	err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
		Where("canvas_type = ? AND visibility = ?", "workflow", "public").
		Order("published_at DESC NULLS LAST, id DESC").
		Find(&canvases).Error
	if err != nil {
		return nil, err
	}
	items := make([]domainmarket.PublicCanvas, 0, len(canvases))
	for _, canvas := range canvases {
		items = append(items, publicCanvasFromModel(canvas))
	}
	return items, nil
}

func (r *gormRepository) FindWorkflowCanvasesByKey(ctx context.Context, key string, userID uint) ([]domainmarket.PublicCanvas, error) {
	canvases := make([]model.Canvas, 0)
	err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
		Where("canvas_type = ? AND workflow_key = ?", "workflow", key).
		Where("owner_id = ? OR visibility = ?", userID, "public").
		Order("id DESC").
		Find(&canvases).Error
	if err != nil {
		return nil, err
	}
	items := make([]domainmarket.PublicCanvas, 0, len(canvases))
	for _, canvas := range canvases {
		items = append(items, publicCanvasFromModel(canvas))
	}
	return items, nil
}

func (r *gormRepository) CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (model.Canvas, error) {
	cv := domainmarket.TemplateCanvas(ownerID, tpl, name, projectID, stage).ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		if err := entityrelation.SyncCoreEntityRelations(tx, &cv); err != nil {
			return err
		}
		nodes := TemplateNodesForCanvas(cv.ID, tpl.Nodes)
		edges := TemplateEdgesForCanvas(cv.ID, tpl.Edges)
		if len(nodes) > 0 {
			if err := tx.Create(&nodes).Error; err != nil {
				return err
			}
		}
		if len(edges) > 0 {
			if err := tx.Create(&edges).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return model.Canvas{}, err
	}
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}
