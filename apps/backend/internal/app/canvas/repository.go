package canvas

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/app/entityrelation"
	resourcebinding "github.com/movscript/movscript/internal/app/resourcebinding"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	domainplugin "github.com/movscript/movscript/internal/domain/plugin"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListCanvases(ctx context.Context, filter CanvasListFilter) ([]canvasruntime.Canvas, error)
	FindOwnedEntityCanvas(ctx context.Context, ownerID uint, orgID *uint, projectID *uint, canvasType string, refType string, refID uint) (canvasruntime.Canvas, bool, error)
	GetCanvas(ctx context.Context, id string) (canvasruntime.Canvas, error)
	CreateCanvas(ctx context.Context, cv canvasruntime.Canvas) (canvasruntime.Canvas, error)
	ReloadCanvas(ctx context.Context, cv canvasruntime.Canvas) (canvasruntime.Canvas, error)
	SaveCanvasMetadata(ctx context.Context, cv canvasruntime.Canvas) error
	DeleteCanvas(ctx context.Context, cv canvasruntime.Canvas) error
	ReplaceCanvasGraph(ctx context.Context, cv canvasruntime.Canvas, nodes []canvasruntime.CanvasNode, edges []canvasruntime.CanvasEdge) error
	GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasruntime.Canvas, error)
	GetNode(ctx context.Context, canvasID uint, nodeID string) (canvasruntime.CanvasNode, error)
	ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error)
	GetRun(ctx context.Context, canvasID uint, runID string) (canvasruntime.CanvasRun, error)
	ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]canvasruntime.CanvasTask, error)
	LatestNodeTask(ctx context.Context, canvasID string, nodeID string) (canvasruntime.CanvasNode, canvasruntime.CanvasTask, error)
	ListNodeTasks(ctx context.Context, canvasID string, nodeID string) (canvasruntime.CanvasNode, []canvasruntime.CanvasTask, error)
	IsInOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool
	EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error
	ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error)
	CreateTask(ctx context.Context, task canvasruntime.CanvasTask) (canvasruntime.CanvasTask, error)
	UpdateTask(ctx context.Context, task canvasruntime.CanvasTask, updates map[string]any) error
	SaveTask(ctx context.Context, task canvasruntime.CanvasTask) error
	FindTask(ctx context.Context, taskID uint) (canvasruntime.CanvasTask, error)
	SaveNode(ctx context.Context, node canvasruntime.CanvasNode) error
	CreateCanvasRun(ctx context.Context, run canvasruntime.CanvasRun) (canvasruntime.CanvasRun, error)
	SaveCanvasRun(ctx context.Context, run canvasruntime.CanvasRun) error
	FindCanvasRun(ctx context.Context, runID uint) (canvasruntime.CanvasRun, error)
	ListCanvasRunTasks(ctx context.Context, runID uint) ([]canvasruntime.CanvasTask, error)
	CanvasUsageScope(ctx context.Context, canvasID uint) (*uint, *uint, error)
	CanvasOrgID(ctx context.Context, canvasID uint) (*uint, error)
	LatestDoneTaskForNode(ctx context.Context, canvasNodeID uint) (canvasruntime.CanvasTask, bool, error)
	LatestCompletedRun(ctx context.Context, canvasID uint) (canvasruntime.CanvasRun, error)
	FindRunInCanvas(ctx context.Context, canvasID uint, runID uint) (canvasruntime.CanvasRun, bool, error)
	ListOutputNodes(ctx context.Context, canvasID uint) ([]canvasruntime.CanvasNode, error)
	ListTasksForRunAndNodes(ctx context.Context, runID uint, nodeIDs []uint) ([]canvasruntime.CanvasTask, error)
	GetCanvasForRunExecution(ctx context.Context, canvasID uint, runID uint) (canvasruntime.CanvasRun, canvasruntime.CanvasGraph, error)
	FailRunNotFound(ctx context.Context, runID uint, finishedAt *time.Time) error
	ListRunTasksOrdered(ctx context.Context, runID uint) ([]canvasruntime.CanvasTask, error)
	FindResources(ctx context.Context, ids []uint) ([]domainresource.RawResource, error)
	CreateResource(ctx context.Context, resource domainresource.RawResource) (domainresource.RawResource, error)
	DeleteResource(ctx context.Context, resource domainresource.RawResource) error
	UpdateResource(ctx context.Context, resource domainresource.RawResource, spec domainresource.UpdateSpec) error
	CreateResourceBinding(ctx context.Context, binding domainresourcebinding.Binding) error
	attachGeneratedAssetSlotCandidate(ctx context.Context, input attachGeneratedAssetSlotCandidateInput) error
	ListCanvasOutputTargets(ctx context.Context, filter CanvasOutputTargetFilter) ([]CanvasOutputTarget, error)
	FindEnabledPluginTool(ctx context.Context, toolKey string) (domainplugin.PluginTool, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListCanvases(ctx context.Context, filter CanvasListFilter) ([]canvasruntime.Canvas, error) {
	canvases := make([]persistencemodel.Canvas, 0)
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
	return canvasruntime.CanvasesFromModels(canvases), nil
}

func (r *gormRepository) FindOwnedEntityCanvas(ctx context.Context, ownerID uint, orgID *uint, projectID *uint, canvasType string, refType string, refID uint) (canvasruntime.Canvas, bool, error) {
	var existing persistencemodel.Canvas
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
			return canvasruntime.Canvas{}, false, nil
		}
		return canvasruntime.Canvas{}, false, err
	}
	return canvasruntime.CanvasFromModel(existing), true, nil
}

func (r *gormRepository) GetCanvas(ctx context.Context, id string) (canvasruntime.Canvas, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		return canvasruntime.Canvas{}, err
	}
	return canvasruntime.CanvasFromModel(cv), nil
}

func (r *gormRepository) CreateCanvas(ctx context.Context, cv canvasruntime.Canvas) (canvasruntime.Canvas, error) {
	modelCV := cv.ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&modelCV).Error; err != nil {
			return err
		}
		if modelCV.CanvasType == "inspiration" && modelCV.RefType == "asset_slot" && modelCV.RefID != nil && *modelCV.RefID != 0 {
			return createAssetSlotCanvasTargetNode(tx, &modelCV)
		}
		if modelCV.CanvasType != "workflow" {
			return nil
		}

		domainNodes, domainEdge := canvasruntime.WorkflowBootstrapGraph(modelCV.ID)
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
		return canvasruntime.CanvasFromModel(modelCV), err
	}
	return canvasruntime.CanvasFromModel(modelCV), nil
}

func (r *gormRepository) ReloadCanvas(ctx context.Context, cv canvasruntime.Canvas) (canvasruntime.Canvas, error) {
	modelCV := cv.ToModel()
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&modelCV, modelCV.ID).Error; err != nil {
		return canvasruntime.CanvasFromModel(modelCV), err
	}
	return canvasruntime.CanvasFromModel(modelCV), nil
}

func (r *gormRepository) SaveCanvasMetadata(ctx context.Context, cv canvasruntime.Canvas) error {
	modelCV := cv.ToModel()
	return saveCanvasWithRelations(r.db.WithContext(ctx), &modelCV)
}

func (r *gormRepository) DeleteCanvas(ctx context.Context, cv canvasruntime.Canvas) error {
	modelCV := cv.ToModel()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		var runs []persistencemodel.CanvasRun
		if err := tx.Select("id").Where("canvas_id = ?", modelCV.ID).Find(&runs).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_run_id IN (?)", tx.Model(&persistencemodel.CanvasRun{}).Select("id").Where("canvas_id = ?", modelCV.ID)).Delete(&persistencemodel.CanvasTask{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", modelCV.ID).Delete(&persistencemodel.CanvasRun{}).Error; err != nil {
			return err
		}
		for i := range runs {
			if err := entityrelation.DeleteCoreEntityRelations(tx, &runs[i]); err != nil {
				return err
			}
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
		return entityrelation.DeleteCoreEntityRelations(tx, &modelCV)
	})
}

func (r *gormRepository) ReplaceCanvasGraph(ctx context.Context, cv canvasruntime.Canvas, nodes []canvasruntime.CanvasNode, edges []canvasruntime.CanvasEdge) error {
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
		return saveCanvasWithRelations(tx, &modelCV)
	})
}

func canvasNodeRows(nodes []canvasruntime.CanvasNode) []persistencemodel.CanvasNode {
	rows := make([]persistencemodel.CanvasNode, 0, len(nodes))
	for _, node := range nodes {
		rows = append(rows, node.ToModel())
	}
	return rows
}

func canvasEdgeRows(edges []canvasruntime.CanvasEdge) []persistencemodel.CanvasEdge {
	rows := make([]persistencemodel.CanvasEdge, 0, len(edges))
	for _, edge := range edges {
		rows = append(rows, edge.ToModel())
	}
	return rows
}

func canvasTaskRows(tasks []canvasruntime.CanvasTask) []persistencemodel.CanvasTask {
	rows := make([]persistencemodel.CanvasTask, 0, len(tasks))
	for _, task := range tasks {
		rows = append(rows, task.ToModel())
	}
	return rows
}

func (r *gormRepository) GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasruntime.Canvas, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).First(&cv, id).Error; err != nil {
		return canvasruntime.CanvasFromModel(cv), err
	}
	if cv.OwnerID != ownerID {
		return canvasruntime.CanvasFromModel(cv), ErrCanvasForbidden
	}
	if !r.IsInOrgScope(ctx, cv.OrgID, orgID, cv.OwnerID, ownerID) {
		return canvasruntime.CanvasFromModel(cv), ErrCanvasForbidden
	}
	return canvasruntime.CanvasFromModel(cv), nil
}

func (r *gormRepository) GetNode(ctx context.Context, canvasID uint, nodeID string) (canvasruntime.CanvasNode, error) {
	var node persistencemodel.CanvasNode
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error
	return canvasruntime.CanvasNodeFromModel(node), err
}

func (r *gormRepository) ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.CanvasRun{}).Where("canvas_id = ?", canvasID)
	if status := strings.TrimSpace(status); status != "" && status != "all" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return CanvasRunListPage{}, err
	}
	q = q.Omit("graph_snapshot").Order("id desc")
	items := make([]persistencemodel.CanvasRun, 0)
	if pageMode {
		if err := q.Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error; err != nil {
			return CanvasRunListPage{}, err
		}
	} else if err := q.Limit(20).Find(&items).Error; err != nil {
		return CanvasRunListPage{}, err
	}
	return CanvasRunListPage{Items: canvasruntime.CanvasRunsFromModels(items), Total: total}, nil
}

func (r *gormRepository) GetRun(ctx context.Context, canvasID uint, runID string) (canvasruntime.CanvasRun, error) {
	var run persistencemodel.CanvasRun
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).Preload("Tasks.Resource").First(&run).Error; err != nil {
		return canvasruntime.CanvasRun{}, err
	}
	return canvasruntime.CanvasRunFromModel(run), nil
}

func (r *gormRepository) ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]canvasruntime.CanvasTask, error) {
	var run persistencemodel.CanvasRun
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).First(&run).Error; err != nil {
		return nil, err
	}
	tasks := make([]persistencemodel.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return canvasruntime.CanvasTasksFromModels(tasks), nil
}

func (r *gormRepository) LatestNodeTask(ctx context.Context, canvasID string, nodeID string) (canvasruntime.CanvasNode, canvasruntime.CanvasTask, error) {
	var node persistencemodel.CanvasNode
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return canvasruntime.CanvasNodeFromModel(node), canvasruntime.CanvasTask{}, err
	}
	var task persistencemodel.CanvasTask
	if err := r.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").First(&task).Error; err != nil {
		return canvasruntime.CanvasNodeFromModel(node), canvasruntime.CanvasTaskFromModel(task), err
	}
	return canvasruntime.CanvasNodeFromModel(node), canvasruntime.CanvasTaskFromModel(task), nil
}

func (r *gormRepository) ListNodeTasks(ctx context.Context, canvasID string, nodeID string) (canvasruntime.CanvasNode, []canvasruntime.CanvasTask, error) {
	var node persistencemodel.CanvasNode
	if err := r.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return canvasruntime.CanvasNodeFromModel(node), nil, err
	}
	tasks := make([]persistencemodel.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks).Error; err != nil {
		return canvasruntime.CanvasNodeFromModel(node), nil, err
	}
	return canvasruntime.CanvasNodeFromModel(node), canvasruntime.CanvasTasksFromModels(tasks), nil
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

func (r *gormRepository) ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error) {
	canvasTable := r.db.NamingStrategy.TableName("Canvas")
	q := r.db.WithContext(ctx).Model(&persistencemodel.CanvasEntityWriteAudit{}).
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
	items := make([]persistencemodel.CanvasEntityWriteAudit, 0)
	if err := q.Order("canvas_entity_write_audits.id desc").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&items).Error; err != nil {
		return EntityWriteAuditPage{}, err
	}
	return EntityWriteAuditPage{Items: canvasruntime.EntityWriteAuditsFromModels(items), Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
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

func (r *gormRepository) CreateTask(ctx context.Context, task canvasruntime.CanvasTask) (canvasruntime.CanvasTask, error) {
	modelTask := task.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelTask).Error; err != nil {
		return canvasruntime.CanvasTaskFromModel(modelTask), err
	}
	return canvasruntime.CanvasTaskFromModel(modelTask), nil
}

func (r *gormRepository) UpdateTask(ctx context.Context, task canvasruntime.CanvasTask, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	modelTask := task.ToModel()
	return r.db.WithContext(ctx).Model(&modelTask).Updates(updates).Error
}

func (r *gormRepository) SaveTask(ctx context.Context, task canvasruntime.CanvasTask) error {
	modelTask := task.ToModel()
	return r.db.WithContext(ctx).Save(&modelTask).Error
}

func (r *gormRepository) FindTask(ctx context.Context, taskID uint) (canvasruntime.CanvasTask, error) {
	var task persistencemodel.CanvasTask
	if err := r.db.WithContext(ctx).First(&task, taskID).Error; err != nil {
		return canvasruntime.CanvasTaskFromModel(task), err
	}
	return canvasruntime.CanvasTaskFromModel(task), nil
}

func (r *gormRepository) SaveNode(ctx context.Context, node canvasruntime.CanvasNode) error {
	modelNode := node.ToModel()
	return r.db.WithContext(ctx).Save(&modelNode).Error
}

func (r *gormRepository) CreateCanvasRun(ctx context.Context, run canvasruntime.CanvasRun) (canvasruntime.CanvasRun, error) {
	modelRun := run.ToModel()
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Create(&modelRun).Error; err != nil {
		return canvasruntime.CanvasRunFromModel(modelRun), err
	}
	if err := entityrelation.SyncCoreEntityRelations(db, &modelRun); err != nil {
		return canvasruntime.CanvasRunFromModel(modelRun), err
	}
	return canvasruntime.CanvasRunFromModel(modelRun), nil
}

func (r *gormRepository) SaveCanvasRun(ctx context.Context, run canvasruntime.CanvasRun) error {
	modelRun := run.ToModel()
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(&modelRun).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, &modelRun)
}

func (r *gormRepository) FindCanvasRun(ctx context.Context, runID uint) (canvasruntime.CanvasRun, error) {
	var run persistencemodel.CanvasRun
	if err := r.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		return canvasruntime.CanvasRunFromModel(run), err
	}
	return canvasruntime.CanvasRunFromModel(run), nil
}

func (r *gormRepository) ListCanvasRunTasks(ctx context.Context, runID uint) ([]canvasruntime.CanvasTask, error) {
	tasks := make([]persistencemodel.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID).Find(&tasks).Error; err != nil {
		return nil, err
	}
	return canvasruntime.CanvasTasksFromModels(tasks), nil
}

func (r *gormRepository) CanvasUsageScope(ctx context.Context, canvasID uint) (*uint, *uint, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Select("id, org_id, project_id").First(&cv, canvasID).Error; err != nil {
		return nil, nil, err
	}
	return cv.OrgID, cv.ProjectID, nil
}

func (r *gormRepository) CanvasOrgID(ctx context.Context, canvasID uint) (*uint, error) {
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&cv, canvasID).Error; err != nil {
		return nil, err
	}
	return cv.OrgID, nil
}

func (r *gormRepository) LatestDoneTaskForNode(ctx context.Context, canvasNodeID uint) (canvasruntime.CanvasTask, bool, error) {
	var task persistencemodel.CanvasTask
	err := r.db.WithContext(ctx).Where("canvas_node_id = ? AND status = ?", canvasNodeID, canvasruntime.CanvasTaskStatusDone).Order("id desc").First(&task).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return canvasruntime.CanvasTaskFromModel(task), false, nil
		}
		return canvasruntime.CanvasTaskFromModel(task), false, err
	}
	return canvasruntime.CanvasTaskFromModel(task), true, nil
}

func (r *gormRepository) LatestCompletedRun(ctx context.Context, canvasID uint) (canvasruntime.CanvasRun, error) {
	var run persistencemodel.CanvasRun
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND status = ?", canvasID, canvasruntime.CanvasRunStatusDone).Order("id desc").First(&run).Error
	return canvasruntime.CanvasRunFromModel(run), err
}

func (r *gormRepository) FindRunInCanvas(ctx context.Context, canvasID uint, runID uint) (canvasruntime.CanvasRun, bool, error) {
	var run persistencemodel.CanvasRun
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).First(&run).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return canvasruntime.CanvasRunFromModel(run), false, nil
		}
		return canvasruntime.CanvasRunFromModel(run), false, err
	}
	return canvasruntime.CanvasRunFromModel(run), true, nil
}

func (r *gormRepository) ListOutputNodes(ctx context.Context, canvasID uint) ([]canvasruntime.CanvasNode, error) {
	nodes := make([]persistencemodel.CanvasNode, 0)
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND type = ?", canvasID, "output").Order("id asc").Find(&nodes).Error
	if err != nil {
		return nil, err
	}
	return canvasruntime.CanvasNodesFromModels(nodes), nil
}

func (r *gormRepository) ListTasksForRunAndNodes(ctx context.Context, runID uint, nodeIDs []uint) ([]canvasruntime.CanvasTask, error) {
	tasks := make([]persistencemodel.CanvasTask, 0)
	q := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID)
	if len(nodeIDs) > 0 {
		q = q.Where("canvas_node_id IN ?", nodeIDs)
	}
	if err := q.Order("id asc").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return canvasruntime.CanvasTasksFromModels(tasks), nil
}

func (r *gormRepository) GetCanvasForRunExecution(ctx context.Context, canvasID uint, runID uint) (canvasruntime.CanvasRun, canvasruntime.CanvasGraph, error) {
	var run persistencemodel.CanvasRun
	if err := r.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		return canvasruntime.CanvasRunFromModel(run), canvasruntime.CanvasGraph{}, err
	}
	graph, err := canvasruntime.CanvasGraphFromRunSnapshot(canvasID, run.GraphSnapshot)
	if err == nil {
		return canvasruntime.CanvasRunFromModel(run), graph, nil
	}
	var cv persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, canvasID).Error; err != nil {
		return canvasruntime.CanvasRunFromModel(run), canvasruntime.CanvasGraphFromModel(cv), err
	}
	return canvasruntime.CanvasRunFromModel(run), canvasruntime.CanvasGraphFromModel(cv), nil
}

func (r *gormRepository) FailRunNotFound(ctx context.Context, runID uint, finishedAt *time.Time) error {
	return r.db.WithContext(ctx).Model(&persistencemodel.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
		"status":      canvasruntime.CanvasRunStatusFailed,
		"error":       "run not found",
		"finished_at": finishedAt,
	}).Error
}

func (r *gormRepository) ListRunTasksOrdered(ctx context.Context, runID uint) ([]canvasruntime.CanvasTask, error) {
	tasks := make([]persistencemodel.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID).Order("id asc").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return canvasruntime.CanvasTasksFromModels(tasks), nil
}

func (r *gormRepository) FindResources(ctx context.Context, ids []uint) ([]domainresource.RawResource, error) {
	resources := make([]persistencemodel.RawResource, 0)
	if len(ids) == 0 {
		return []domainresource.RawResource{}, nil
	}
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, err
	}
	return rawResourcesFromRows(resources), nil
}

func (r *gormRepository) CreateResource(ctx context.Context, resource domainresource.RawResource) (domainresource.RawResource, error) {
	modelResource := resource.ToModel()
	if err := r.db.WithContext(ctx).Create(&modelResource).Error; err != nil {
		return domainresource.RawResourceFromModel(modelResource), err
	}
	return domainresource.RawResourceFromModel(modelResource), nil
}

func (r *gormRepository) DeleteResource(ctx context.Context, resource domainresource.RawResource) error {
	modelResource := resource.ToModel()
	return r.db.WithContext(ctx).Delete(&modelResource).Error
}

func (r *gormRepository) UpdateResource(ctx context.Context, resource domainresource.RawResource, spec domainresource.UpdateSpec) error {
	if spec.Empty() {
		return nil
	}
	modelResource := resource.ToModel()
	return r.db.WithContext(ctx).Model(&modelResource).Updates(resourceUpdateColumns(spec)).Error
}

func rawResourcesFromRows(resources []persistencemodel.RawResource) []domainresource.RawResource {
	items := make([]domainresource.RawResource, 0, len(resources))
	for _, resource := range resources {
		items = append(items, domainresource.RawResourceFromModel(resource))
	}
	return items
}

func resourceUpdateColumns(spec domainresource.UpdateSpec) map[string]any {
	updates := map[string]any{}
	if spec.FilePath != nil {
		updates["file_path"] = *spec.FilePath
	}
	if spec.StorageKey != nil {
		updates["storage_key"] = *spec.StorageKey
	}
	if spec.StorageBackend != nil {
		updates["storage_backend"] = *spec.StorageBackend
	}
	if spec.Type != nil {
		updates["type"] = *spec.Type
	}
	if spec.Name != nil {
		updates["name"] = *spec.Name
	}
	if spec.MimeType != nil {
		updates["mime_type"] = *spec.MimeType
	}
	if spec.Size != nil {
		updates["size"] = *spec.Size
	}
	if spec.IsShared != nil {
		updates["is_shared"] = *spec.IsShared
	}
	if spec.ClearFolder {
		updates["folder_id"] = nil
	} else if spec.FolderID != nil {
		updates["folder_id"] = *spec.FolderID
	}
	if spec.VerificationStatus != nil {
		updates["verification_status"] = *spec.VerificationStatus
	}
	if spec.VerificationRef != nil {
		updates["verification_ref"] = *spec.VerificationRef
	}
	if spec.VerifiedAt != nil {
		updates["verified_at"] = *spec.VerifiedAt
	}
	if spec.VerificationProvider != nil {
		updates["verification_provider"] = *spec.VerificationProvider
	}
	if spec.VerificationError != nil {
		updates["verification_error"] = *spec.VerificationError
	}
	return updates
}

type attachGeneratedAssetSlotCandidateInput struct {
	CanvasID       uint
	CanvasRunID    uint
	ProjectID      uint
	UserID         uint
	EntityKind     string
	EntityID       uint
	ResourceID     uint
	BindingSlot    string
	BindingMeta    string
	CandidateNote  string
	CandidateNode  string
	SourceSlotID   uint
	CandidateSlot  *persistencemodel.AssetSlot
	OutputTarget   *persistencemodel.CanvasOutput
	OutputValueRaw string
}

type CanvasOutputTargetFilter struct {
	ProjectID    uint
	CanvasID     uint
	PortID       string
	CanvasNodeID string
	OutputType   string
	Statuses     []string
}

type CanvasOutputTarget struct {
	ID           uint
	ProjectID    uint
	CanvasID     uint
	CanvasRunID  *uint
	CanvasNodeID string
	PortID       string
	OwnerType    string
	OwnerID      uint
	OutputType   string
	ResourceID   *uint
	TargetField  string
	ValueJSON    string
	Status       string
	MetadataJSON string
}

func (r *gormRepository) CreateResourceBinding(ctx context.Context, binding domainresourcebinding.Binding) error {
	_, err := resourcebinding.NewService(r.db).CreateBinding(ctx, binding)
	return err
}

func (r *gormRepository) attachGeneratedAssetSlotCandidate(ctx context.Context, input attachGeneratedAssetSlotCandidateInput) error {
	if input.ProjectID == 0 || input.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	var candidateSlot persistencemodel.AssetSlot
	if input.CandidateSlot != nil {
		candidateSlot = *input.CandidateSlot
	} else if input.EntityID > 0 {
		if err := db.First(&candidateSlot, input.EntityID).Error; err != nil || candidateSlot.ProjectID != input.ProjectID {
			return nil
		}
	}

	var sourceSlot persistencemodel.AssetSlot
	sourceSlotID := input.SourceSlotID
	if sourceSlotID == 0 {
		if candidateSlot.OwnerType != "asset_slot" || candidateSlot.OwnerID == nil || *candidateSlot.OwnerID == 0 {
			return nil
		}
		sourceSlotID = *candidateSlot.OwnerID
	}
	if err := db.First(&sourceSlot, sourceSlotID).Error; err != nil || sourceSlot.ProjectID != input.ProjectID {
		return nil
	}
	if candidateSlot.ID == 0 {
		err := db.
			Where("project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ?", input.ProjectID, "asset_slot", sourceSlot.ID, input.ResourceID).
			Order("id asc").
			First(&candidateSlot).Error
		if err != nil {
			name := strings.TrimSpace(sourceSlot.Name)
			if name == "" {
				name = fmt.Sprintf("素材位 #%d", sourceSlot.ID)
			}
			candidateSlot = domainsemantic.NewAssetSlot(domainsemantic.AssetSlotSpec{
				ProjectID:                input.ProjectID,
				ProductionID:             sourceSlot.ProductionID,
				CreativeReferenceID:      sourceSlot.CreativeReferenceID,
				CreativeReferenceStateID: sourceSlot.CreativeReferenceStateID,
				OwnerType:                "asset_slot",
				OwnerID:                  &sourceSlot.ID,
				Kind:                     canvasruntime.FirstNonEmptyString(sourceSlot.Kind, "image"),
				Name:                     name + " · 生成候选",
				Description:              canvasruntime.FirstNonEmptyString(sourceSlot.Description, sourceSlot.PromptHint),
				SlotKey:                  sourceSlot.SlotKey,
				PromptHint:               sourceSlot.PromptHint,
				Status:                   domainsemantic.AssetSlotStatusCandidate,
				Priority:                 canvasruntime.FirstNonEmptyString(sourceSlot.Priority, "normal"),
				ResourceID:               &input.ResourceID,
				MetadataJSON:             input.BindingMeta,
			}).ToModel()
			if err := db.Create(&candidateSlot).Error; err != nil {
				return nil
			}
			if err := entityrelation.SyncCoreEntityRelations(db, &candidateSlot); err != nil {
				return nil
			}
		}
	}
	if candidateSlot.ResourceID == nil {
		candidateSlot.ResourceID = &input.ResourceID
	}
	if candidateSlot.Status == "" || candidateSlot.Status == "missing" {
		candidateSlot.Status = domainsemantic.AssetSlotStatusCandidate
	}
	if err := db.Save(&candidateSlot).Error; err != nil {
		return nil
	}
	sourceID := input.CanvasRunID
	slot := strings.TrimSpace(input.BindingSlot)
	if slot == "" {
		slot = "result"
	}
	meta := input.BindingMeta
	if strings.TrimSpace(meta) == "" {
		meta = "{}"
	}
	var existingBinding persistencemodel.ResourceBinding
	if err := db.
		Where("project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?", input.ProjectID, input.ResourceID, domainresourcebinding.OwnerTypeAssetSlot, candidateSlot.ID, domainresourcebinding.RoleOutput, slot, 1).
		First(&existingBinding).Error; err != nil {
		_ = r.CreateResourceBinding(ctx, domainresourcebinding.New(domainresourcebinding.CreateInput{
			ProjectID:    input.ProjectID,
			ResourceID:   input.ResourceID,
			OwnerType:    domainresourcebinding.OwnerTypeAssetSlot,
			OwnerID:      candidateSlot.ID,
			Role:         domainresourcebinding.RoleOutput,
			Slot:         slot,
			Status:       domainresourcebinding.StatusSelected,
			SourceType:   domainresourcebinding.SourceTypeCanvas,
			SourceID:     &sourceID,
			IsPrimary:    true,
			MetadataJSON: meta,
			CreatedByID:  &input.UserID,
		}))
	}
	var existing persistencemodel.AssetSlotCandidate
	err := db.
		Where("project_id = ? AND asset_slot_id = ? AND candidate_asset_slot_id = ?", input.ProjectID, sourceSlot.ID, candidateSlot.ID).
		First(&existing).Error
	if err != nil {
		existing = domainsemantic.NewAssetSlotCandidate(domainsemantic.AssetSlotCandidateSpec{
			ProjectID:            input.ProjectID,
			AssetSlotID:          sourceSlot.ID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           domainresourcebinding.SourceTypeCanvas,
			SourceID:             &sourceID,
			Status:               domainsemantic.AssetSlotCandidateStatusCandidate,
			Note:                 canvasruntime.FirstNonEmptyString(input.CandidateNote, "由素材生成画布写回"),
		}).ToModel()
		if err := db.Create(&existing).Error; err != nil {
			return nil
		}
		if err := entityrelation.SyncCoreEntityRelations(db, &existing); err != nil {
			return nil
		}
	} else {
		existing.SourceType = domainresourcebinding.SourceTypeCanvas
		existing.SourceID = &sourceID
		domainsemantic.NormalizeAssetSlotCandidate(&existing)
		if err := db.Save(&existing).Error; err != nil {
			return nil
		}
		if err := entityrelation.SyncCoreEntityRelations(db, &existing); err != nil {
			return nil
		}
	}
	if input.OutputTarget != nil {
		target := *input.OutputTarget
		canvasruntime.AttachCanvasOutput(&target, input.CanvasRunID, input.ResourceID, input.OutputValueRaw)
		if err := db.Save(&target).Error; err != nil {
			return nil
		}
		_ = entityrelation.SyncCoreEntityRelations(db, &target)
	}
	return nil
}

func (r *gormRepository) ListCanvasOutputTargets(ctx context.Context, filter CanvasOutputTargetFilter) ([]CanvasOutputTarget, error) {
	targets := make([]persistencemodel.CanvasOutput, 0)
	q := r.db.WithContext(ctx).Where("project_id = ? AND canvas_id = ?", filter.ProjectID, filter.CanvasID)
	if portID := strings.TrimSpace(filter.PortID); portID != "" {
		q = q.Where("port_id = ?", portID)
	}
	if nodeID := strings.TrimSpace(filter.CanvasNodeID); nodeID != "" {
		q = q.Where("canvas_node_id = ?", nodeID)
	}
	if outputType := strings.TrimSpace(filter.OutputType); outputType != "" {
		q = q.Where("output_type = ?", outputType)
	}
	if len(filter.Statuses) > 0 {
		q = q.Where("status IN ?", filter.Statuses)
	}
	if err := q.Find(&targets).Error; err != nil {
		return nil, err
	}
	return canvasOutputTargetsFromRows(targets), nil
}

func canvasOutputTargetsFromRows(targets []persistencemodel.CanvasOutput) []CanvasOutputTarget {
	items := make([]CanvasOutputTarget, 0, len(targets))
	for _, target := range targets {
		items = append(items, canvasOutputTargetFromRow(target))
	}
	return items
}

func canvasOutputTargetFromRow(target persistencemodel.CanvasOutput) CanvasOutputTarget {
	return CanvasOutputTarget{
		ID:           target.ID,
		ProjectID:    target.ProjectID,
		CanvasID:     target.CanvasID,
		CanvasRunID:  target.CanvasRunID,
		CanvasNodeID: target.CanvasNodeID,
		PortID:       target.PortID,
		OwnerType:    target.OwnerType,
		OwnerID:      target.OwnerID,
		OutputType:   target.OutputType,
		ResourceID:   target.ResourceID,
		TargetField:  target.TargetField,
		ValueJSON:    target.ValueJSON,
		Status:       target.Status,
		MetadataJSON: target.MetadataJSON,
	}
}

func (target CanvasOutputTarget) toRow() persistencemodel.CanvasOutput {
	return persistencemodel.CanvasOutput{
		Model:        gorm.Model{ID: target.ID},
		ProjectID:    target.ProjectID,
		CanvasID:     target.CanvasID,
		CanvasRunID:  target.CanvasRunID,
		CanvasNodeID: target.CanvasNodeID,
		PortID:       target.PortID,
		OwnerType:    target.OwnerType,
		OwnerID:      target.OwnerID,
		OutputType:   target.OutputType,
		ResourceID:   target.ResourceID,
		TargetField:  target.TargetField,
		ValueJSON:    target.ValueJSON,
		Status:       target.Status,
		MetadataJSON: target.MetadataJSON,
	}
}

func (r *gormRepository) FindEnabledPluginTool(ctx context.Context, toolKey string) (domainplugin.PluginTool, error) {
	var tool persistencemodel.PluginTool
	err := r.db.WithContext(ctx).Preload("Plugin").
		Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugin_tools.tool_key = ? AND plugin_tools.enabled = ? AND plugins.enabled = ? AND plugins.deleted_at IS NULL", strings.TrimSpace(toolKey), true, true).
		First(&tool).Error
	return domainplugin.PluginToolFromModel(tool), err
}

func saveCanvasWithRelations(db *gorm.DB, cv *persistencemodel.Canvas) error {
	db = db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(cv).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, cv)
}

func createAssetSlotCanvasTargetNode(tx *gorm.DB, cv *persistencemodel.Canvas) error {
	var slot persistencemodel.AssetSlot
	if err := tx.First(&slot, *cv.RefID).Error; err != nil {
		return err
	}
	node := canvasruntime.NewAssetSlotTargetNode(canvasruntime.AssetSlotTargetNodeInput{
		CanvasID:      cv.ID,
		AssetSlotID:   slot.ID,
		AssetKind:     slot.Kind,
		AssetName:     slot.Name,
		FallbackLabel: fmt.Sprintf("素材位 #%d", slot.ID),
	}).ToModel()
	return tx.Create(&node).Error
}
