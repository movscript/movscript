package canvas

import (
	"context"
	"errors"
	"strings"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCanvases(ctx context.Context, filter CanvasListFilter) ([]canvasdomain.Canvas, error)
	GetCanvas(ctx context.Context, id string) (canvasdomain.Canvas, error)
	CreateCanvas(ctx context.Context, cv canvasdomain.Canvas) (canvasdomain.Canvas, error)
	ReloadCanvas(ctx context.Context, cv canvasdomain.Canvas) (canvasdomain.Canvas, error)
	SaveCanvasMetadata(ctx context.Context, cv canvasdomain.Canvas) error
	DeleteCanvas(ctx context.Context, cv canvasdomain.Canvas) error
	ReplaceCanvasGraph(ctx context.Context, cv canvasdomain.Canvas, nodes []canvasdomain.CanvasNode, edges []canvasdomain.CanvasEdge) error
	GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error)
	GetNode(ctx context.Context, canvasID uint, nodeID string) (canvasdomain.CanvasNode, error)
	IsInOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool
	EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCanvases(ctx context.Context, filter CanvasListFilter) ([]canvasdomain.Canvas, error) {
	canvases := make([]persistencemodel.Canvas, 0)
	q := r.db.WithContext(ctx).Where("owner_id = ?", filter.OwnerID)
	q = r.applyOrgScope(ctx, q, filter.OrgID, filter.OwnerID)
	if pid := strings.TrimSpace(filter.ProjectID); pid != "" {
		q = q.Where("project_id = ?", pid)
	}
	if stage := strings.TrimSpace(filter.Stage); stage != "" {
		q = q.Where("stage = ?", stage)
	}
	if canvasType := strings.TrimSpace(filter.CanvasType); canvasType != "" {
		q = q.Where("canvas_type = ?", canvasType)
	}
	if err := q.Find(&canvases).Error; err != nil {
		return nil, err
	}
	return canvasdomain.CanvasesFromModels(canvases), nil
}

func (r *gormRepository) GetCanvas(ctx context.Context, id string) (canvasdomain.Canvas, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		return canvasdomain.Canvas{}, err
	}
	return canvasdomain.CanvasFromModel(cv), nil
}

func (r *gormRepository) CreateCanvas(ctx context.Context, cv canvasdomain.Canvas) (canvasdomain.Canvas, error) {
	modelCV := cv.ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&modelCV).Error; err != nil {
			return err
		}
		if modelCV.CanvasType != "workflow" {
			return nil
		}

		domainNodes, domainEdge := canvasdomain.WorkflowBootstrapGraph(modelCV.ID)
		nodes := make([]persistencemodel.CanvasNode, 0, len(domainNodes))
		for _, node := range domainNodes {
			nodes = append(nodes, node.ToModel())
		}
		edge := domainEdge.ToModel()
		if err := tx.Create(&nodes).Error; err != nil {
			return err
		}
		return tx.Create(&edge).Error
	})
	if err != nil {
		return canvasdomain.CanvasFromModel(modelCV), err
	}
	return canvasdomain.CanvasFromModel(modelCV), nil
}

func (r *gormRepository) ReloadCanvas(ctx context.Context, cv canvasdomain.Canvas) (canvasdomain.Canvas, error) {
	modelCV := cv.ToModel()
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&modelCV, modelCV.ID).Error; err != nil {
		return canvasdomain.CanvasFromModel(modelCV), err
	}
	return canvasdomain.CanvasFromModel(modelCV), nil
}

func (r *gormRepository) SaveCanvasMetadata(ctx context.Context, cv canvasdomain.Canvas) error {
	modelCV := cv.ToModel()
	return r.db.WithContext(ctx).Save(&modelCV).Error
}

func (r *gormRepository) DeleteCanvas(ctx context.Context, cv canvasdomain.Canvas) error {
	modelCV := cv.ToModel()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Where("canvas_run_id IN (?)", tx.Model(&persistencemodel.CanvasRun{}).Select("id").Where("canvas_id = ?", modelCV.ID)).Delete(&persistencemodel.CanvasTask{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasRun{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasEdge{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&modelCV).Error; err != nil {
			return err
		}
		return nil
	})
}

func (r *gormRepository) ReplaceCanvasGraph(ctx context.Context, cv canvasdomain.Canvas, nodes []canvasdomain.CanvasNode, edges []canvasdomain.CanvasEdge) error {
	modelCV := cv.ToModel()
	modelNodes := canvasNodeRows(nodes)
	modelEdges := canvasEdgeRows(edges)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasEdge{}).Error; err != nil {
			return err
		}
		for i := range modelNodes {
			modelNodes[i].CanvasID = modelCV.ID
			modelNodes[i].ID = 0
		}
		for i := range modelEdges {
			modelEdges[i].CanvasID = modelCV.ID
			modelEdges[i].ID = 0
		}
		if len(modelNodes) > 0 {
			if err := tx.Create(&modelNodes).Error; err != nil {
				return err
			}
		}
		if len(modelEdges) > 0 {
			if err := tx.Create(&modelEdges).Error; err != nil {
				return err
			}
		}
		return tx.Save(&modelCV).Error
	})
}

func canvasNodeRows(nodes []canvasdomain.CanvasNode) []persistencemodel.CanvasNode {
	rows := make([]persistencemodel.CanvasNode, 0, len(nodes))
	for _, node := range nodes {
		rows = append(rows, node.ToModel())
	}
	return rows
}

func canvasEdgeRows(edges []canvasdomain.CanvasEdge) []persistencemodel.CanvasEdge {
	rows := make([]persistencemodel.CanvasEdge, 0, len(edges))
	for _, edge := range edges {
		rows = append(rows, edge.ToModel())
	}
	return rows
}

func (r *gormRepository) GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).First(&cv, id).Error; err != nil {
		return canvasdomain.CanvasFromModel(cv), err
	}
	if cv.OwnerID != ownerID {
		return canvasdomain.CanvasFromModel(cv), ErrCanvasForbidden
	}
	if !r.IsInOrgScope(ctx, cv.OrgID, orgID, cv.OwnerID, ownerID) {
		return canvasdomain.CanvasFromModel(cv), ErrCanvasForbidden
	}
	return canvasdomain.CanvasFromModel(cv), nil
}

func (r *gormRepository) GetNode(ctx context.Context, canvasID uint, nodeID string) (canvasdomain.CanvasNode, error) {
	var node persistencemodel.CanvasNode
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error
	return canvasdomain.CanvasNodeFromModel(node), err
}

func (r *gormRepository) IsInOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool {
	if sameOrg(entityOrgID, currentOrgID) {
		return true
	}
	return r.includeLegacyPersonal(ctx, currentOrgID) && entityOrgID == nil && ownerID == userID
}

func (r *gormRepository) EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil {
		return nil
	}
	var project persistencemodel.Project
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&project, *projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProjectNotFound
		}
		return err
	}
	if !sameOrg(project.OrgID, orgID) {
		return ErrProjectOutsideOrg
	}
	return nil
}

func (r *gormRepository) applyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, ownerID uint) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if r.includeLegacyPersonal(ctx, orgID) {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_id = ?)", *orgID, ownerID)
	}
	return q.Where("org_id = ?", *orgID)
}

func (r *gormRepository) includeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}
