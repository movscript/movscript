package workflowmarket

import (
	"context"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
	"gorm.io/gorm"
)

type repository interface {
	ListPublicCanvases(ctx context.Context) ([]domainmarket.PublicCanvas, error)
	FindWorkflowCanvasesByKey(ctx context.Context, key string, userID uint) ([]domainmarket.PublicCanvas, error)
	CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (canvasruntime.Canvas, error)
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

func (r *gormRepository) CreateCanvasFromTemplate(ctx context.Context, ownerID uint, tpl domainmarket.TemplateDef, name string, projectID *uint, stage string) (canvasruntime.Canvas, error) {
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
		return canvasruntime.Canvas{}, err
	}
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return canvasruntime.Canvas{}, err
	}
	return canvasruntime.CanvasFromModel(cv), nil
}

func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
	domainNodes := domainmarket.TemplateNodesForCanvas(canvasID, defs)
	nodes := make([]model.CanvasNode, 0, len(domainNodes))
	for _, node := range domainNodes {
		nodes = append(nodes, node.ToModel())
	}
	return nodes
}

func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
	domainEdges := domainmarket.TemplateEdgesForCanvas(canvasID, defs)
	edges := make([]model.CanvasEdge, 0, len(domainEdges))
	for _, edge := range domainEdges {
		edges = append(edges, edge.ToModel())
	}
	return edges
}

func publicCanvasFromModel(cv model.Canvas) domainmarket.PublicCanvas {
	nodes := make([]canvasruntime.CanvasNode, 0, len(cv.Nodes))
	for _, node := range cv.Nodes {
		nodes = append(nodes, canvasruntime.CanvasNodeFromModel(node))
	}
	edges := make([]canvasruntime.CanvasEdge, 0, len(cv.Edges))
	for _, edge := range cv.Edges {
		edges = append(edges, canvasruntime.CanvasEdgeFromModel(edge))
	}
	return domainmarket.PublicCanvas{
		Canvas: canvasruntime.CanvasFromModel(cv),
		Nodes:  nodes,
		Edges:  edges,
	}
}
