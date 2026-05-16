package market

import (
	"context"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	domainmarket "github.com/movscript/movscript/internal/domain/workflow/market"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/relation"
	"gorm.io/gorm"
)

type repository interface {
	ListPublicCanvases(ctx context.Context) ([]domainmarket.PublicCanvas, error)
	FindWorkflowCanvasesByKey(ctx context.Context, key string, userID uint) ([]domainmarket.PublicCanvas, error)
	CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (canvasdomain.Canvas, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListPublicCanvases(ctx context.Context) ([]domainmarket.PublicCanvas, error) {
	canvases := make([]persistencemodel.Canvas, 0)
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
	canvases := make([]persistencemodel.Canvas, 0)
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

func (r *gormRepository) CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (canvasdomain.Canvas, error) {
	cv := domainmarket.TemplateCanvas(ownerID, tpl, name, projectID, stage).ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		if err := relation.SyncCoreEntityRelations(tx, &cv); err != nil {
			return err
		}
		nodes := templateNodeRowsForCanvas(cv.ID, tpl.Nodes)
		edges := templateEdgeRowsForCanvas(cv.ID, tpl.Edges)
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
		return canvasdomain.Canvas{}, err
	}
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return canvasdomain.Canvas{}, err
	}
	return canvasdomain.CanvasFromModel(cv), nil
}

func templateNodeRowsForCanvas(canvasID uint, defs []TemplateNode) []persistencemodel.CanvasNode {
	domainNodes := domainmarket.TemplateNodesForCanvas(canvasID, defs)
	nodes := make([]persistencemodel.CanvasNode, 0, len(domainNodes))
	for _, node := range domainNodes {
		nodes = append(nodes, node.ToModel())
	}
	return nodes
}

func templateEdgeRowsForCanvas(canvasID uint, defs []TemplateEdge) []persistencemodel.CanvasEdge {
	domainEdges := domainmarket.TemplateEdgesForCanvas(canvasID, defs)
	edges := make([]persistencemodel.CanvasEdge, 0, len(domainEdges))
	for _, edge := range domainEdges {
		edges = append(edges, edge.ToModel())
	}
	return edges
}

func publicCanvasFromModel(cv persistencemodel.Canvas) domainmarket.PublicCanvas {
	nodes := make([]canvasdomain.CanvasNode, 0, len(cv.Nodes))
	for _, node := range cv.Nodes {
		nodes = append(nodes, canvasdomain.CanvasNodeFromModel(node))
	}
	edges := make([]canvasdomain.CanvasEdge, 0, len(cv.Edges))
	for _, edge := range cv.Edges {
		edges = append(edges, canvasdomain.CanvasEdgeFromModel(edge))
	}
	return domainmarket.PublicCanvas{
		Canvas: canvasdomain.CanvasFromModel(cv),
		Nodes:  nodes,
		Edges:  edges,
	}
}
