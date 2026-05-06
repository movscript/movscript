package canvas

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCanvases(ctx context.Context, filter CanvasListFilter) ([]model.Canvas, error)
	FindOwnedEntityCanvas(ctx context.Context, ownerID uint, orgID *uint, projectID *uint, canvasType string, refType string, refID uint) (model.Canvas, bool, error)
	GetCanvas(ctx context.Context, id string) (model.Canvas, error)
	CreateCanvas(ctx context.Context, cv *model.Canvas) error
	ReloadCanvas(ctx context.Context, cv *model.Canvas) error
	SaveCanvasMetadata(ctx context.Context, cv *model.Canvas) error
	DeleteCanvas(ctx context.Context, cv *model.Canvas) error
	ReplaceCanvasGraph(ctx context.Context, cv *model.Canvas, nodes []model.CanvasNode, edges []model.CanvasEdge) error
	GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (model.Canvas, error)
	GetNode(ctx context.Context, canvasID uint, nodeID string) (model.CanvasNode, error)
	ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error)
	GetRun(ctx context.Context, canvasID uint, runID string) (model.CanvasRun, error)
	ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]model.CanvasTask, error)
	LatestNodeTask(ctx context.Context, canvasID string, nodeID string) (model.CanvasNode, model.CanvasTask, error)
	ListNodeTasks(ctx context.Context, canvasID string, nodeID string) (model.CanvasNode, []model.CanvasTask, error)
	IsInOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool
	EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error
	ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error)
	CreateTask(ctx context.Context, task *model.CanvasTask) error
	UpdateTask(ctx context.Context, task *model.CanvasTask, updates map[string]any) error
	SaveTask(ctx context.Context, task *model.CanvasTask) error
	FindTask(ctx context.Context, taskID uint) (model.CanvasTask, error)
	SaveNode(ctx context.Context, node *model.CanvasNode) error
	CreateCanvasRun(ctx context.Context, run *model.CanvasRun) error
	SaveCanvasRun(ctx context.Context, run *model.CanvasRun) error
	FindCanvasRun(ctx context.Context, runID uint) (model.CanvasRun, error)
	ListCanvasRunTasks(ctx context.Context, runID uint) ([]model.CanvasTask, error)
	CanvasBillingScope(ctx context.Context, canvasID uint) (*uint, *uint, error)
	CanvasOrgID(ctx context.Context, canvasID uint) (*uint, error)
	LatestDoneTaskForNode(ctx context.Context, canvasNodeID uint) (model.CanvasTask, bool, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCanvases(ctx context.Context, filter CanvasListFilter) ([]model.Canvas, error) {
	canvases := make([]model.Canvas, 0)
	q := r.db.WithContext(ctx).Where("owner_id = ?", filter.OwnerID)
	q = r.applyOrgScope(ctx, q, filter.OrgID, filter.OwnerID)
	if pid := strings.TrimSpace(filter.ProjectID); pid != "" {
		q = q.Where("project_id = ?", pid)
	}
	if stage := strings.TrimSpace(filter.Stage); stage != "" {
		q = q.Where("stage = ?", stage)
	}
	if refType := strings.TrimSpace(filter.RefType); refType != "" {
		q = q.Where("ref_type = ?", refType)
	}
	if refID := strings.TrimSpace(filter.RefID); refID != "" {
		q = q.Where("ref_id = ?", refID)
	}
	if canvasType := strings.TrimSpace(filter.CanvasType); canvasType != "" {
		q = q.Where("canvas_type = ?", canvasType)
	}
	if err := q.Find(&canvases).Error; err != nil {
		return nil, err
	}
	return canvases, nil
}

func (r *gormRepository) FindOwnedEntityCanvas(ctx context.Context, ownerID uint, orgID *uint, projectID *uint, canvasType string, refType string, refID uint) (model.Canvas, bool, error) {
	var existing model.Canvas
	q := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
		Where("owner_id = ? AND canvas_type = ? AND ref_type = ? AND ref_id = ?", ownerID, canvasType, refType, refID)
	q = r.applyOrgScope(ctx, q, orgID, ownerID)
	if projectID != nil {
		q = q.Where("project_id = ?", *projectID)
	} else {
		q = q.Where("project_id IS NULL")
	}
	if err := q.Order("id asc").First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Canvas{}, false, nil
		}
		return model.Canvas{}, false, err
	}
	return existing, true, nil
}

func (r *gormRepository) GetCanvas(ctx context.Context, id string) (model.Canvas, error) {
	var cv model.Canvas
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		return cv, err
	}
	return cv, nil
}

func (r *gormRepository) CreateCanvas(ctx context.Context, cv *model.Canvas) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(cv).Error; err != nil {
			return err
		}
		if cv.CanvasType == "inspiration" && cv.RefType == "asset_slot" && cv.RefID != nil && *cv.RefID != 0 {
			return createAssetSlotCanvasTargetNode(tx, cv)
		}
		if cv.CanvasType != "workflow" {
			return nil
		}

		nodes, edge := canvasruntime.WorkflowBootstrapGraph(cv.ID)
		if err := tx.Create(&nodes).Error; err != nil {
			return err
		}
		return tx.Create(&edge).Error
	})
}

func (r *gormRepository) ReloadCanvas(ctx context.Context, cv *model.Canvas) error {
	return r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(cv, cv.ID).Error
}

func (r *gormRepository) SaveCanvasMetadata(ctx context.Context, cv *model.Canvas) error {
	return saveCanvasWithRelations(r.db.WithContext(ctx), cv)
}

func (r *gormRepository) DeleteCanvas(ctx context.Context, cv *model.Canvas) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		var runs []model.CanvasRun
		if err := tx.Select("id").Where("canvas_id = ?", cv.ID).Find(&runs).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_run_id IN (?)", tx.Model(&model.CanvasRun{}).Select("id").Where("canvas_id = ?", cv.ID)).Delete(&model.CanvasTask{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasRun{}).Error; err != nil {
			return err
		}
		for i := range runs {
			if err := entityrelation.DeleteCoreEntityRelations(tx, &runs[i]); err != nil {
				return err
			}
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(cv).Error; err != nil {
			return err
		}
		return entityrelation.DeleteCoreEntityRelations(tx, cv)
	})
}

func (r *gormRepository) ReplaceCanvasGraph(ctx context.Context, cv *model.Canvas, nodes []model.CanvasNode, edges []model.CanvasEdge) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{}).Error; err != nil {
			return err
		}
		for i := range nodes {
			nodes[i].CanvasID = cv.ID
			nodes[i].ID = 0
		}
		for i := range edges {
			edges[i].CanvasID = cv.ID
			edges[i].ID = 0
		}
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
		return saveCanvasWithRelations(tx, cv)
	})
}

func (r *gormRepository) GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (model.Canvas, error) {
	var cv model.Canvas
	if err := r.db.WithContext(ctx).First(&cv, id).Error; err != nil {
		return cv, err
	}
	if cv.OwnerID != ownerID {
		return cv, ErrCanvasForbidden
	}
	if !r.IsInOrgScope(ctx, cv.OrgID, orgID, cv.OwnerID, ownerID) {
		return cv, ErrCanvasForbidden
	}
	return cv, nil
}

func (r *gormRepository) GetNode(ctx context.Context, canvasID uint, nodeID string) (model.CanvasNode, error) {
	var node model.CanvasNode
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error
	return node, err
}

func (r *gormRepository) ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error) {
	q := r.db.WithContext(ctx).Model(&model.CanvasRun{}).Where("canvas_id = ?", canvasID)
	if status := strings.TrimSpace(status); status != "" && status != "all" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return CanvasRunListPage{}, err
	}
	q = q.Omit("graph_snapshot").Order("id desc")
	items := make([]model.CanvasRun, 0)
	if pageMode {
		if err := q.Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error; err != nil {
			return CanvasRunListPage{}, err
		}
	} else if err := q.Limit(20).Find(&items).Error; err != nil {
		return CanvasRunListPage{}, err
	}
	return CanvasRunListPage{Items: items, Total: total}, nil
}

func (r *gormRepository) GetRun(ctx context.Context, canvasID uint, runID string) (model.CanvasRun, error) {
	var run model.CanvasRun
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).Preload("Tasks.Resource").First(&run).Error
	return run, err
}

func (r *gormRepository) ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]model.CanvasTask, error) {
	var run model.CanvasRun
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).First(&run).Error; err != nil {
		return nil, err
	}
	tasks := make([]model.CanvasTask, 0)
	err := r.db.WithContext(ctx).Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks).Error
	return tasks, err
}

func (r *gormRepository) LatestNodeTask(ctx context.Context, canvasID string, nodeID string) (model.CanvasNode, model.CanvasTask, error) {
	var node model.CanvasNode
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return node, model.CanvasTask{}, err
	}
	var task model.CanvasTask
	if err := r.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").First(&task).Error; err != nil {
		return node, task, err
	}
	return node, task, nil
}

func (r *gormRepository) ListNodeTasks(ctx context.Context, canvasID string, nodeID string) (model.CanvasNode, []model.CanvasTask, error) {
	var node model.CanvasNode
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return node, nil, err
	}
	tasks := make([]model.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks).Error; err != nil {
		return node, nil, err
	}
	return node, tasks, nil
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
	var project model.Project
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

func (r *gormRepository) ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error) {
	canvasTable := r.db.NamingStrategy.TableName("Canvas")
	q := r.db.WithContext(ctx).Model(&model.CanvasEntityWriteAudit{}).
		Joins("JOIN "+canvasTable+" ON "+canvasTable+".id = canvas_entity_write_audits.canvas_id").
		Where(canvasTable+".owner_id = ?", filter.OwnerID)
	if filter.CanvasID > 0 {
		q = q.Where("canvas_entity_write_audits.canvas_id = ?", filter.CanvasID)
	}
	if filter.CanvasRunID > 0 {
		q = q.Where("canvas_entity_write_audits.canvas_run_id = ?", filter.CanvasRunID)
	}
	if entityKind := strings.TrimSpace(filter.EntityKind); entityKind != "" {
		q = q.Where("canvas_entity_write_audits.entity_kind = ?", entityKind)
	}
	if filter.EntityID > 0 {
		q = q.Where("canvas_entity_write_audits.entity_id = ?", filter.EntityID)
	}
	if filter.UserID > 0 {
		q = q.Where("canvas_entity_write_audits.user_id = ?", filter.UserID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return EntityWriteAuditPage{}, err
	}
	items := make([]model.CanvasEntityWriteAudit, 0)
	if err := q.Order("canvas_entity_write_audits.id desc").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&items).Error; err != nil {
		return EntityWriteAuditPage{}, err
	}
	return EntityWriteAuditPage{Items: items, Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
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
	var org model.Organization
	if err := r.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

func (r *gormRepository) CreateTask(ctx context.Context, task *model.CanvasTask) error {
	return r.db.WithContext(ctx).Create(task).Error
}

func (r *gormRepository) UpdateTask(ctx context.Context, task *model.CanvasTask, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(task).Updates(updates).Error
}

func (r *gormRepository) SaveTask(ctx context.Context, task *model.CanvasTask) error {
	return r.db.WithContext(ctx).Save(task).Error
}

func (r *gormRepository) FindTask(ctx context.Context, taskID uint) (model.CanvasTask, error) {
	var task model.CanvasTask
	if err := r.db.WithContext(ctx).First(&task, taskID).Error; err != nil {
		return task, err
	}
	return task, nil
}

func (r *gormRepository) SaveNode(ctx context.Context, node *model.CanvasNode) error {
	return r.db.WithContext(ctx).Save(node).Error
}

func (r *gormRepository) CreateCanvasRun(ctx context.Context, run *model.CanvasRun) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(run).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, run)
}

func (r *gormRepository) SaveCanvasRun(ctx context.Context, run *model.CanvasRun) error {
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(run).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, run)
}

func (r *gormRepository) FindCanvasRun(ctx context.Context, runID uint) (model.CanvasRun, error) {
	var run model.CanvasRun
	if err := r.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		return run, err
	}
	return run, nil
}

func (r *gormRepository) ListCanvasRunTasks(ctx context.Context, runID uint) ([]model.CanvasTask, error) {
	tasks := make([]model.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID).Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}

func (r *gormRepository) CanvasBillingScope(ctx context.Context, canvasID uint) (*uint, *uint, error) {
	var cv model.Canvas
	if err := r.db.WithContext(ctx).Select("id, org_id, project_id").First(&cv, canvasID).Error; err != nil {
		return nil, nil, err
	}
	return cv.OrgID, cv.ProjectID, nil
}

func (r *gormRepository) CanvasOrgID(ctx context.Context, canvasID uint) (*uint, error) {
	var cv model.Canvas
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&cv, canvasID).Error; err != nil {
		return nil, err
	}
	return cv.OrgID, nil
}

func (r *gormRepository) LatestDoneTaskForNode(ctx context.Context, canvasNodeID uint) (model.CanvasTask, bool, error) {
	var task model.CanvasTask
	err := r.db.WithContext(ctx).Where("canvas_node_id = ? AND status = ?", canvasNodeID, "done").Order("id desc").First(&task).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return task, false, nil
		}
		return task, false, err
	}
	return task, true, nil
}
