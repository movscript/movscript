package canvas

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	workflowmarket "github.com/movscript/movscript/internal/app/workflow/market"
	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
)

var (
	ErrInvalidCanvasType = canvasdomain.ErrInvalidCanvasType
	ErrCanvasForbidden   = errors.New("canvas forbidden")
	ErrProjectNotFound   = errors.New("project not found")
	ErrProjectOutsideOrg = errors.New("project is outside current org")
)

type CanvasListFilter struct {
	OwnerID    uint
	OrgID      *uint
	ProjectID  string
	Stage      string
	CanvasType string
}

type CanvasCreateInput = canvasdomain.CanvasCreateInput

type CanvasPatchInput struct {
	Name        *string
	Description *string
	Tags        []string
}

type CanvasSaveInput struct {
	Name       string
	CanvasType string
	Nodes      []canvasdomain.CanvasNode
	Edges      []canvasdomain.CanvasEdge
}

func (h *Service) ListCanvases(ctx context.Context, filter CanvasListFilter) ([]canvasdomain.Canvas, error) {
	return h.canvasRepo().ListCanvases(ctx, filter)
}

func (h *Service) GetCanvas(ctx context.Context, id string) (canvasdomain.Canvas, error) {
	return h.canvasRepo().GetCanvas(ctx, id)
}

func (h *Service) CreateCanvas(ctx context.Context, input CanvasCreateInput) (canvasdomain.Canvas, error) {
	if err := canvasdomain.NormalizeCreateInput(&input); err != nil {
		return canvasdomain.Canvas{}, err
	}
	if err := h.ensureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return canvasdomain.Canvas{}, err
	}
	cv, err := h.canvasRepo().CreateCanvas(ctx, canvasdomain.NewCanvas(input))
	if err != nil {
		return cv, err
	}
	cv, err = h.canvasRepo().ReloadCanvas(ctx, cv)
	if err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) GetVisibleCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error) {
	return h.getVisibleCanvas(ctx, id, ownerID, orgID)
}

func (h *Service) getVisibleCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error) {
	cv, err := h.GetCanvas(ctx, id)
	if err != nil {
		return canvasdomain.Canvas{}, err
	}
	if !h.inOrgScope(ctx, cv.OrgID, orgID, cv.OwnerID, ownerID) {
		return cv, ErrCanvasForbidden
	}
	if cv.OwnerID != ownerID && !(cv.CanvasType == "workflow" && cv.Visibility == "public") {
		return cv, ErrCanvasForbidden
	}
	return cv, nil
}

func (h *Service) PatchCanvas(ctx context.Context, id string, ownerID uint, orgID *uint, input CanvasPatchInput) (canvasdomain.Canvas, error) {
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
	if err := h.canvasRepo().SaveCanvasMetadata(ctx, cv); err != nil {
		return cv, err
	}
	cv, err = h.canvasRepo().ReloadCanvas(ctx, cv)
	if err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) DeleteCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) error {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID, orgID)
	if err != nil {
		return err
	}
	return h.canvasRepo().DeleteCanvas(ctx, cv)
}

func (h *Service) SaveCanvas(ctx context.Context, id string, ownerID uint, orgID *uint, input CanvasSaveInput) (canvasdomain.Canvas, error) {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID, orgID)
	if err != nil {
		return cv, err
	}
	if input.Name != "" {
		cv.Name = input.Name
	}
	if err := h.canvasRepo().ReplaceCanvasGraph(ctx, cv, input.Nodes, input.Edges); err != nil {
		return cv, err
	}
	cv, err = h.canvasRepo().ReloadCanvas(ctx, cv)
	if err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) getOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error) {
	return h.canvasRepo().GetOwnedCanvas(ctx, id, ownerID, orgID)
}

func (h *Service) GetOwnedCanvas(ctx context.Context, id string, ownerID uint, orgID *uint) (canvasdomain.Canvas, error) {
	return h.getOwnedCanvas(ctx, id, ownerID, orgID)
}

func (h *Service) getNode(ctx context.Context, canvasID uint, nodeID string) (canvasdomain.CanvasNode, error) {
	return h.canvasRepo().GetNode(ctx, canvasID, nodeID)
}

func (h *Service) GetNode(ctx context.Context, canvasID uint, nodeID string) (canvasdomain.CanvasNode, error) {
	return h.getNode(ctx, canvasID, nodeID)
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
