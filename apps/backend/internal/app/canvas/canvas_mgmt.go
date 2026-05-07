package canvas

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	workflowmarket "github.com/movscript/movscript/internal/app/workflowmarket"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

var (
	ErrInvalidCanvasType  = canvasruntime.ErrInvalidCanvasType
	ErrRefIDRequired      = canvasruntime.ErrRefIDRequired
	ErrUnsupportedRefType = canvasruntime.ErrUnsupportedRefType
	ErrCanvasForbidden    = errors.New("canvas forbidden")
	ErrProjectNotFound    = errors.New("project not found")
	ErrProjectOutsideOrg  = errors.New("project is outside current org")
)

type CanvasListFilter struct {
	OwnerID    uint
	OrgID      *uint
	ProjectID  string
	Stage      string
	RefType    string
	RefID      string
	CanvasType string
}

type CanvasCreateInput = canvasruntime.CanvasCreateInput

type CanvasPatchInput struct {
	Name        *string
	Description *string
	Tags        []string
}

type CanvasSaveInput struct {
	Name       string
	CanvasType string
	Nodes      []model.CanvasNode
	Edges      []model.CanvasEdge
}

type CanvasRunListPage struct {
	Items []model.CanvasRun
	Total int64
}

type EntityWriteAuditFilter struct {
	OwnerID     uint
	CanvasID    uint
	CanvasRunID uint
	EntityKind  string
	EntityID    uint
	UserID      uint
	Page        int
	PageSize    int
}

type EntityWriteAuditPage struct {
	Items    []model.CanvasEntityWriteAudit
	Total    int64
	Page     int
	PageSize int
}

func (h *Service) ListCanvases(ctx context.Context, filter CanvasListFilter) ([]model.Canvas, error) {
	return h.canvasRepo().ListCanvases(ctx, filter)
}

func (h *Service) FindOwnedEntityCanvas(ctx context.Context, ownerID uint, orgID *uint, projectID *uint, canvasType string, refType string, refID uint) (model.Canvas, bool, error) {
	return h.canvasRepo().FindOwnedEntityCanvas(ctx, ownerID, orgID, projectID, canvasType, refType, refID)
}

func (h *Service) GetCanvas(ctx context.Context, id string) (model.Canvas, error) {
	return h.canvasRepo().GetCanvas(ctx, id)
}

func (h *Service) CreateCanvas(ctx context.Context, input CanvasCreateInput) (model.Canvas, error) {
	if err := canvasruntime.NormalizeCreateInput(&input); err != nil {
		return model.Canvas{}, err
	}
	if err := h.ensureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return model.Canvas{}, err
	}
	cv := canvasruntime.NewCanvas(input).ToModel()
	if err := h.canvasRepo().CreateCanvas(ctx, &cv); err != nil {
		return cv, err
	}
	if err := h.canvasRepo().ReloadCanvas(ctx, &cv); err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) FindExistingSingleCanvas(ctx context.Context, input CanvasCreateInput) (model.Canvas, bool, error) {
	input.RefType = strings.TrimSpace(input.RefType)
	if input.RefID == nil || !canvasruntime.SingleCanvasRefType(input.RefType) {
		return model.Canvas{}, false, nil
	}
	canvasType := input.CanvasType
	if canvasType == "" {
		canvasType = "inspiration"
	}
	return h.FindOwnedEntityCanvas(ctx, input.OwnerID, input.OrgID, input.ProjectID, canvasType, input.RefType, *input.RefID)
}

func (h *Service) GetVisibleCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (model.Canvas, error) {
	cv, err := h.GetCanvas(ctx, id)
	if err != nil {
		return cv, err
	}
	if !h.inOrgScope(ctx, cv.OrgID, orgID, cv.OwnerID, ownerID) {
		return cv, ErrCanvasForbidden
	}
	if cv.OwnerID != ownerID && !(cv.CanvasType == "workflow" && cv.Visibility == "public") {
		return cv, ErrCanvasForbidden
	}
	return cv, nil
}

func (h *Service) PatchCanvas(ctx context.Context, id string, ownerID uint, orgID *uint, input CanvasPatchInput) (model.Canvas, error) {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID, orgID)
	if err != nil {
		return cv, err
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return cv, fmt.Errorf("name is required")
		}
		cv.Name = name
	}
	if input.Description != nil {
		cv.Description = strings.TrimSpace(*input.Description)
	}
	if input.Tags != nil && cv.CanvasType == "workflow" {
		tagsRaw, _ := json.Marshal(workflowmarket.CleanTags(input.Tags))
		cv.WorkflowTags = string(tagsRaw)
	}
	if err := h.canvasRepo().SaveCanvasMetadata(ctx, &cv); err != nil {
		return cv, err
	}
	if err := h.canvasRepo().ReloadCanvas(ctx, &cv); err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) DeleteCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) error {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID, orgID)
	if err != nil {
		return err
	}
	return h.canvasRepo().DeleteCanvas(ctx, &cv)
}

func (h *Service) SaveCanvas(ctx context.Context, id string, ownerID uint, orgID *uint, input CanvasSaveInput) (model.Canvas, error) {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID, orgID)
	if err != nil {
		return cv, err
	}
	if input.Name != "" {
		cv.Name = input.Name
	}
	if err := h.canvasRepo().ReplaceCanvasGraph(ctx, &cv, input.Nodes, input.Edges); err != nil {
		return cv, err
	}
	if err := h.canvasRepo().ReloadCanvas(ctx, &cv); err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) getOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (model.Canvas, error) {
	return h.canvasRepo().GetOwnedCanvas(ctx, id, ownerID, orgID)
}

func (h *Service) GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (model.Canvas, error) {
	return h.getOwnedCanvas(ctx, id, ownerID, orgID)
}

func (h *Service) GetNode(ctx context.Context, canvasID uint, nodeID string) (model.CanvasNode, error) {
	return h.canvasRepo().GetNode(ctx, canvasID, nodeID)
}

func (h *Service) ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error) {
	return h.canvasRepo().ListRuns(ctx, canvasID, status, pageMode, page, pageSize)
}

func (h *Service) GetRun(ctx context.Context, canvasID uint, runID string) (model.CanvasRun, error) {
	return h.canvasRepo().GetRun(ctx, canvasID, runID)
}

func (h *Service) ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]model.CanvasTask, error) {
	tasks, err := h.canvasRepo().ListRunTasks(ctx, canvasID, runID)
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		h.LazyBackfillCanvasTaskOutputs(&tasks[i], tasks[i].NodeType)
	}
	return tasks, nil
}

func (h *Service) LatestNodeTask(ctx context.Context, canvasID string, ownerID uint, orgID *uint, nodeID string) (model.CanvasTask, string, error) {
	if _, err := h.GetOwnedCanvas(ctx, canvasID, ownerID, orgID); err != nil {
		return model.CanvasTask{}, "", err
	}
	node, task, err := h.canvasRepo().LatestNodeTask(ctx, canvasID, nodeID)
	if err != nil {
		return task, node.Type, err
	}
	h.LazyBackfillCanvasTaskOutputs(&task, node.Type)
	return task, node.Type, nil
}

func (h *Service) ListNodeTasks(ctx context.Context, canvasID string, ownerID uint, orgID *uint, nodeID string) ([]model.CanvasTask, string, error) {
	if _, err := h.GetOwnedCanvas(ctx, canvasID, ownerID, orgID); err != nil {
		return nil, "", err
	}
	node, tasks, err := h.canvasRepo().ListNodeTasks(ctx, canvasID, nodeID)
	if err != nil {
		return nil, node.Type, err
	}
	for i := range tasks {
		h.LazyBackfillCanvasTaskOutputs(&tasks[i], node.Type)
	}
	return tasks, node.Type, nil
}

func (h *Service) inOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool {
	return h.canvasRepo().IsInOrgScope(ctx, entityOrgID, currentOrgID, ownerID, userID)
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (h *Service) ensureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	return h.canvasRepo().EnsureProjectInOrg(ctx, projectID, orgID)
}

func (h *Service) ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error) {
	return h.canvasRepo().ListEntityWriteAudits(ctx, filter)
}
