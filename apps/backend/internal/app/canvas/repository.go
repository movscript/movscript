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
	"github.com/movscript/movscript/internal/domain/model"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
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
	LatestCompletedRun(ctx context.Context, canvasID uint) (model.CanvasRun, error)
	FindRunInCanvas(ctx context.Context, canvasID uint, runID uint) (model.CanvasRun, bool, error)
	ListOutputNodes(ctx context.Context, canvasID uint) ([]model.CanvasNode, error)
	ListTasksForRunAndNodes(ctx context.Context, runID uint, nodeIDs []uint) ([]model.CanvasTask, error)
	GetCanvasForRunExecution(ctx context.Context, canvasID uint, runID uint) (model.CanvasRun, model.Canvas, error)
	FailRunNotFound(ctx context.Context, runID uint, finishedAt *time.Time) error
	ListRunTasksOrdered(ctx context.Context, runID uint) ([]model.CanvasTask, error)
	FindResources(ctx context.Context, ids []uint) ([]model.RawResource, error)
	CreateResource(ctx context.Context, resource *model.RawResource) error
	DeleteResource(ctx context.Context, resource *model.RawResource) error
	UpdateResource(ctx context.Context, resource *model.RawResource, updates map[string]any) error
	CreateResourceBinding(ctx context.Context, binding model.ResourceBinding) error
	AttachGeneratedAssetSlotCandidate(ctx context.Context, input AttachGeneratedAssetSlotCandidateInput) error
	ListCanvasOutputTargets(ctx context.Context, filter CanvasOutputTargetFilter) ([]model.CanvasOutput, error)
	FindEnabledPluginTool(ctx context.Context, toolKey string) (model.PluginTool, error)
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

		domainNodes, domainEdge := canvasruntime.WorkflowBootstrapGraph(cv.ID)
		nodes := make([]model.CanvasNode, 0, len(domainNodes))
		for _, node := range domainNodes {
			nodes = append(nodes, node.ToModel())
		}
		edge := domainEdge.ToModel()
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
	err := r.db.WithContext(ctx).Where("canvas_node_id = ? AND status = ?", canvasNodeID, canvasruntime.CanvasTaskStatusDone).Order("id desc").First(&task).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return task, false, nil
		}
		return task, false, err
	}
	return task, true, nil
}

func (r *gormRepository) LatestCompletedRun(ctx context.Context, canvasID uint) (model.CanvasRun, error) {
	var run model.CanvasRun
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND status = ?", canvasID, canvasruntime.CanvasRunStatusDone).Order("id desc").First(&run).Error
	return run, err
}

func (r *gormRepository) FindRunInCanvas(ctx context.Context, canvasID uint, runID uint) (model.CanvasRun, bool, error) {
	var run model.CanvasRun
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).First(&run).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return run, false, nil
		}
		return run, false, err
	}
	return run, true, nil
}

func (r *gormRepository) ListOutputNodes(ctx context.Context, canvasID uint) ([]model.CanvasNode, error) {
	nodes := make([]model.CanvasNode, 0)
	err := r.db.WithContext(ctx).Where("canvas_id = ? AND type = ?", canvasID, "output").Order("id asc").Find(&nodes).Error
	return nodes, err
}

func (r *gormRepository) ListTasksForRunAndNodes(ctx context.Context, runID uint, nodeIDs []uint) ([]model.CanvasTask, error) {
	tasks := make([]model.CanvasTask, 0)
	q := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID)
	if len(nodeIDs) > 0 {
		q = q.Where("canvas_node_id IN ?", nodeIDs)
	}
	err := q.Order("id asc").Find(&tasks).Error
	return tasks, err
}

func (r *gormRepository) GetCanvasForRunExecution(ctx context.Context, canvasID uint, runID uint) (model.CanvasRun, model.Canvas, error) {
	var run model.CanvasRun
	if err := r.db.WithContext(ctx).First(&run, runID).Error; err != nil {
		return run, model.Canvas{}, err
	}
	cv, err := canvasruntime.CanvasFromRunSnapshot(canvasID, run.GraphSnapshot)
	if err == nil {
		return run, cv, nil
	}
	if err := r.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, canvasID).Error; err != nil {
		return run, cv, err
	}
	return run, cv, nil
}

func (r *gormRepository) FailRunNotFound(ctx context.Context, runID uint, finishedAt *time.Time) error {
	return r.db.WithContext(ctx).Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
		"status":      canvasruntime.CanvasRunStatusFailed,
		"error":       "run not found",
		"finished_at": finishedAt,
	}).Error
}

func (r *gormRepository) ListRunTasksOrdered(ctx context.Context, runID uint) ([]model.CanvasTask, error) {
	tasks := make([]model.CanvasTask, 0)
	if err := r.db.WithContext(ctx).Where("canvas_run_id = ?", runID).Order("id asc").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}

func (r *gormRepository) FindResources(ctx context.Context, ids []uint) ([]model.RawResource, error) {
	resources := make([]model.RawResource, 0)
	if len(ids) == 0 {
		return resources, nil
	}
	err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error
	return resources, err
}

func (r *gormRepository) CreateResource(ctx context.Context, resource *model.RawResource) error {
	return r.db.WithContext(ctx).Create(resource).Error
}

func (r *gormRepository) DeleteResource(ctx context.Context, resource *model.RawResource) error {
	return r.db.WithContext(ctx).Delete(resource).Error
}

func (r *gormRepository) UpdateResource(ctx context.Context, resource *model.RawResource, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(resource).Updates(updates).Error
}

type AttachGeneratedAssetSlotCandidateInput struct {
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
	CandidateSlot  *model.AssetSlot
	OutputTarget   *model.CanvasOutput
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

func (r *gormRepository) CreateResourceBinding(ctx context.Context, binding model.ResourceBinding) error {
	return resourcebinding.NewService(r.db).CreateBinding(ctx, &binding)
}

func (r *gormRepository) AttachGeneratedAssetSlotCandidate(ctx context.Context, input AttachGeneratedAssetSlotCandidateInput) error {
	if input.ProjectID == 0 || input.ResourceID == 0 {
		return nil
	}
	db := r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	var candidateSlot model.AssetSlot
	if input.CandidateSlot != nil {
		candidateSlot = *input.CandidateSlot
	} else if input.EntityID > 0 {
		if err := db.First(&candidateSlot, input.EntityID).Error; err != nil || candidateSlot.ProjectID != input.ProjectID {
			return nil
		}
	}

	var sourceSlot model.AssetSlot
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
	var existingBinding model.ResourceBinding
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
		}).ToModel())
	}
	var existing model.AssetSlotCandidate
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

func (r *gormRepository) ListCanvasOutputTargets(ctx context.Context, filter CanvasOutputTargetFilter) ([]model.CanvasOutput, error) {
	targets := make([]model.CanvasOutput, 0)
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
	err := q.Find(&targets).Error
	return targets, err
}

func (r *gormRepository) FindEnabledPluginTool(ctx context.Context, toolKey string) (model.PluginTool, error) {
	var tool model.PluginTool
	err := r.db.WithContext(ctx).Preload("Plugin").
		Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugin_tools.tool_key = ? AND plugin_tools.enabled = ? AND plugins.enabled = ? AND plugins.deleted_at IS NULL", strings.TrimSpace(toolKey), true, true).
		First(&tool).Error
	return tool, err
}

func saveCanvasWithRelations(db *gorm.DB, cv *model.Canvas) error {
	db = db.Session(&gorm.Session{SkipHooks: true})
	if err := db.Save(cv).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(db, cv)
}

func createAssetSlotCanvasTargetNode(tx *gorm.DB, cv *model.Canvas) error {
	var slot model.AssetSlot
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
