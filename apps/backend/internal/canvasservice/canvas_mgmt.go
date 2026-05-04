package canvasservice

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	workflowmarket "github.com/movscript/movscript/internal/app/workflowmarket"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type CanvasListFilter struct {
	OwnerID    uint
	ProjectID  string
	Stage      string
	RefType    string
	RefID      string
	CanvasType string
}

type CanvasCreateInput struct {
	OwnerID     uint
	Name        string
	Description string
	ProjectID   *uint
	CanvasType  string
	Stage       string
	RefType     string
	RefID       *uint
}

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
	canvases := make([]model.Canvas, 0)
	q := h.db.WithContext(ctx).Where("owner_id = ?", filter.OwnerID)
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

func (h *Service) FindOwnedEntityCanvas(ctx context.Context, ownerID uint, projectID *uint, canvasType string, refType string, refID uint) (model.Canvas, bool, error) {
	var existing model.Canvas
	q := h.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
		Where("owner_id = ? AND canvas_type = ? AND ref_type = ? AND ref_id = ?", ownerID, canvasType, refType, refID)
	if projectID != nil {
		q = q.Where("project_id = ?", *projectID)
	} else {
		q = q.Where("project_id IS NULL")
	}
	if err := q.Order("id asc").First(&existing).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return model.Canvas{}, false, nil
		}
		return model.Canvas{}, false, err
	}
	return existing, true, nil
}

func (h *Service) GetCanvas(ctx context.Context, id string) (model.Canvas, error) {
	var cv model.Canvas
	if err := h.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) CreateCanvas(ctx context.Context, input CanvasCreateInput) (model.Canvas, error) {
	cv := model.Canvas{
		OwnerID:     input.OwnerID,
		Name:        input.Name,
		Description: strings.TrimSpace(input.Description),
		ProjectID:   input.ProjectID,
		CanvasType:  input.CanvasType,
		Stage:       input.Stage,
		RefType:     input.RefType,
		RefID:       input.RefID,
		Visibility:  "private",
	}
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		if cv.CanvasType == "inspiration" && cv.RefType == "asset_slot" && cv.RefID != nil && *cv.RefID != 0 {
			return createAssetSlotCanvasTargetNode(tx, &cv)
		}
		if cv.CanvasType != "workflow" {
			return nil
		}

		inputData, _ := json.Marshal(map[string]any{
			"source":     "manual",
			"inputValue": "",
			"paramName":  "input",
			"paramType":  "text",
		})
		outputData, _ := json.Marshal(map[string]any{
			"source":            "manual",
			"label":             "最终输出",
			"paramName":         "final_output",
			"paramType":         "resource",
			"lockedFinalOutput": true,
		})
		nodes := []model.CanvasNode{
			{CanvasID: cv.ID, NodeID: "input", Type: "input", Label: "输入", PosX: 120, PosY: 160, Data: string(inputData)},
			{CanvasID: cv.ID, NodeID: "final-output", Type: "output", Label: "最终输出", PosX: 560, PosY: 160, Data: string(outputData)},
		}
		if err := tx.Create(&nodes).Error; err != nil {
			return err
		}
		edge := model.CanvasEdge{CanvasID: cv.ID, EdgeID: "input-output", Source: "input", Target: "final-output", SourceHandle: "value", TargetHandle: "value"}
		return tx.Create(&edge).Error
	})
	if err != nil {
		return cv, err
	}
	if err := h.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) PatchCanvas(ctx context.Context, id string, ownerID uint, input CanvasPatchInput) (model.Canvas, error) {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID)
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
	if err := h.db.WithContext(ctx).Save(&cv).Error; err != nil {
		return cv, err
	}
	if err := h.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) DeleteCanvas(ctx context.Context, id string, ownerID uint) error {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID)
	if err != nil {
		return err
	}
	if err := h.db.WithContext(ctx).Where("canvas_run_id IN (?)", h.db.Model(&model.CanvasRun{}).Select("id").Where("canvas_id = ?", cv.ID)).Delete(&model.CanvasTask{}).Error; err != nil {
		return err
	}
	if err := h.db.WithContext(ctx).Where("canvas_id = ?", cv.ID).Delete(&model.CanvasRun{}).Error; err != nil {
		return err
	}
	if err := h.db.WithContext(ctx).Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{}).Error; err != nil {
		return err
	}
	if err := h.db.WithContext(ctx).Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{}).Error; err != nil {
		return err
	}
	return h.db.WithContext(ctx).Delete(&cv).Error
}

func (h *Service) SaveCanvas(ctx context.Context, id string, ownerID uint, input CanvasSaveInput) (model.Canvas, error) {
	cv, err := h.getOwnedCanvas(ctx, id, ownerID)
	if err != nil {
		return cv, err
	}
	if input.Name != "" {
		cv.Name = input.Name
	}
	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{}).Error; err != nil {
			return err
		}
		for i := range input.Nodes {
			input.Nodes[i].CanvasID = cv.ID
			input.Nodes[i].ID = 0
		}
		for i := range input.Edges {
			input.Edges[i].CanvasID = cv.ID
			input.Edges[i].ID = 0
		}
		if len(input.Nodes) > 0 {
			if err := tx.Create(&input.Nodes).Error; err != nil {
				return err
			}
		}
		if len(input.Edges) > 0 {
			if err := tx.Create(&input.Edges).Error; err != nil {
				return err
			}
		}
		return tx.Save(&cv).Error
	})
	if err != nil {
		return cv, err
	}
	if err := h.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return cv, err
	}
	return cv, nil
}

func (h *Service) getOwnedCanvas(ctx context.Context, id string, ownerID uint) (model.Canvas, error) {
	var cv model.Canvas
	if err := h.db.WithContext(ctx).First(&cv, id).Error; err != nil {
		return cv, err
	}
	if cv.OwnerID != ownerID {
		return cv, gorm.ErrRecordNotFound
	}
	return cv, nil
}

func (h *Service) GetOwnedCanvas(ctx context.Context, id string, ownerID uint) (model.Canvas, error) {
	return h.getOwnedCanvas(ctx, id, ownerID)
}

func (h *Service) GetNode(ctx context.Context, canvasID uint, nodeID string) (model.CanvasNode, error) {
	var node model.CanvasNode
	err := h.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error
	return node, err
}

func (h *Service) ListRuns(ctx context.Context, canvasID uint, status string, pageMode bool, page int, pageSize int) (CanvasRunListPage, error) {
	q := h.db.WithContext(ctx).Model(&model.CanvasRun{}).Where("canvas_id = ?", canvasID)
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
	} else {
		if err := q.Limit(20).Find(&items).Error; err != nil {
			return CanvasRunListPage{}, err
		}
	}
	return CanvasRunListPage{Items: items, Total: total}, nil
}

func (h *Service) GetRun(ctx context.Context, canvasID uint, runID string) (model.CanvasRun, error) {
	var run model.CanvasRun
	err := h.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).Preload("Tasks.Resource").First(&run).Error
	return run, err
}

func (h *Service) ListRunTasks(ctx context.Context, canvasID uint, runID string) ([]model.CanvasTask, error) {
	var run model.CanvasRun
	if err := h.db.WithContext(ctx).Where("canvas_id = ? AND id = ?", canvasID, runID).First(&run).Error; err != nil {
		return nil, err
	}
	tasks := make([]model.CanvasTask, 0)
	err := h.db.WithContext(ctx).Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks).Error
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		h.LazyBackfillCanvasTaskOutputs(&tasks[i], tasks[i].NodeType)
	}
	return tasks, nil
}

func (h *Service) LatestNodeTask(ctx context.Context, canvasID string, nodeID string) (model.CanvasTask, string, error) {
	var node model.CanvasNode
	if err := h.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return model.CanvasTask{}, "", err
	}
	var task model.CanvasTask
	if err := h.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").First(&task).Error; err != nil {
		return task, node.Type, err
	}
	h.LazyBackfillCanvasTaskOutputs(&task, node.Type)
	return task, node.Type, nil
}

func (h *Service) ListNodeTasks(ctx context.Context, canvasID string, nodeID string) ([]model.CanvasTask, string, error) {
	var node model.CanvasNode
	if err := h.db.WithContext(ctx).Where("canvas_id = ? AND node_id = ?", canvasID, nodeID).First(&node).Error; err != nil {
		return nil, "", err
	}
	tasks := make([]model.CanvasTask, 0)
	if err := h.db.WithContext(ctx).Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks).Error; err != nil {
		return nil, node.Type, err
	}
	for i := range tasks {
		h.LazyBackfillCanvasTaskOutputs(&tasks[i], node.Type)
	}
	return tasks, node.Type, nil
}

func (h *Service) ListEntityWriteAudits(ctx context.Context, filter EntityWriteAuditFilter) (EntityWriteAuditPage, error) {
	canvasTable := h.db.NamingStrategy.TableName("Canvas")
	q := h.db.WithContext(ctx).Model(&model.CanvasEntityWriteAudit{}).
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

func createAssetSlotCanvasTargetNode(tx *gorm.DB, cv *model.Canvas) error {
	var slot model.AssetSlot
	if err := tx.First(&slot, *cv.RefID).Error; err != nil {
		return err
	}
	title := strings.TrimSpace(slot.Name)
	if title == "" {
		title = fmt.Sprintf("素材位 #%d", slot.ID)
	}
	data, _ := json.Marshal(map[string]any{
		"source":        "manual",
		"label":         title,
		"entityKind":    "asset_slot",
		"entityId":      slot.ID,
		"entityTitle":   title,
		"assetSlotKind": slot.Kind,
		"textContent":   title,
		"inputPorts": []map[string]any{
			{"id": "candidates", "type": assetSlotCanvasPortType(slot.Kind), "label": "候选集", "maxCount": 12},
			{"id": "candidate_item", "type": assetSlotCanvasPortType(slot.Kind), "label": "单个候选"},
		},
		"outputPorts": []map[string]any{
			{"id": "reference", "type": "resource", "label": "参考图"},
			{"id": "prompt_hint", "type": "text", "label": "参考说明"},
			{"id": "creative_reference_id", "type": "number", "label": "所属资料"},
		},
	})
	return tx.Create(&model.CanvasNode{
		CanvasID: cv.ID,
		NodeID:   "asset-slot-target",
		Type:     "entity_card",
		Label:    title,
		PosX:     520,
		PosY:     180,
		Data:     string(data),
	}).Error
}

func assetSlotCanvasPortType(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "image", "video", "audio", "text":
		return strings.ToLower(strings.TrimSpace(kind))
	default:
		return "resource"
	}
}
