package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	workflowmarket "github.com/movscript/movscript/internal/app/workflowmarket"
	"github.com/movscript/movscript/internal/canvasservice"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"github.com/movscript/movscript/internal/workflow"
	"gorm.io/gorm"
)

type CanvasHandler struct {
	CanvasExecService canvasservice.Service
	db                *gorm.DB
	registry          *ai.Registry
	svc               *ai.AIService
	entityIO          *workflow.EntityIOService
	store             storage.Storage
	uploadDir         string
}

func NewCanvasHandler(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, store storage.Storage) *CanvasHandler {
	entityIO := workflow.NewEntityIOService(db)
	return &CanvasHandler{
		CanvasExecService: canvasservice.NewService(db, registry, svc, entityIO, store),
		db:                db,
		registry:          registry,
		svc:               svc,
		entityIO:          entityIO,
		store:             store,
		uploadDir:         "/tmp/movscript-canvas",
	}
}

func (h *CanvasHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var canvases []model.Canvas
	q := h.db.Where("owner_id = ?", user.ID)
	if pid := c.Query("project_id"); pid != "" {
		q = q.Where("project_id = ?", pid)
	}
	if stage := c.Query("stage"); stage != "" {
		q = q.Where("stage = ?", stage)
	}
	if refType := strings.TrimSpace(c.Query("ref_type")); refType != "" {
		q = q.Where("ref_type = ?", refType)
	}
	if refID := strings.TrimSpace(c.Query("ref_id")); refID != "" {
		q = q.Where("ref_id = ?", refID)
	}
	if canvasType := c.Query("type"); canvasType != "" {
		q = q.Where("canvas_type = ?", canvasType)
	}
	if err := q.Find(&canvases).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, canvases)
}

func (h *CanvasHandler) Create(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		ProjectID   *uint  `json:"project_id"`
		CanvasType  string `json:"canvas_type"`
		Stage       string `json:"stage"`
		RefType     string `json:"ref_type"`
		RefID       *uint  `json:"ref_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.CanvasType == "" {
		req.CanvasType = "inspiration"
	}
	if !slices.Contains([]string{"inspiration", "workflow"}, req.CanvasType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "canvas_type must be inspiration or workflow"})
		return
	}
	req.RefType = strings.TrimSpace(req.RefType)
	if req.RefType != "" && req.RefID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ref_id is required when ref_type is set"})
		return
	}
	if req.RefType != "" && !slices.Contains([]string{"script", "setting", "asset_slot", "content_unit"}, req.RefType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported ref_type"})
		return
	}
	if singleCanvasRefType(req.RefType) && req.RefID != nil {
		existing, ok, err := h.findOwnedEntityCanvas(user.ID, req.ProjectID, req.CanvasType, req.RefType, *req.RefID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if ok {
			c.JSON(http.StatusOK, existing)
			return
		}
	}
	cv := model.Canvas{
		OwnerID:     user.ID,
		Name:        req.Name,
		Description: strings.TrimSpace(req.Description),
		ProjectID:   req.ProjectID,
		CanvasType:  req.CanvasType,
		Stage:       req.Stage,
		RefType:     req.RefType,
		RefID:       req.RefID,
		Visibility:  "private",
	}
	if err := h.createCanvas(&cv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cv)
}

func singleCanvasRefType(refType string) bool {
	return refType == "asset_slot" || refType == "content_unit"
}

func (h *CanvasHandler) findOwnedEntityCanvas(ownerID uint, projectID *uint, canvasType string, refType string, refID uint) (model.Canvas, bool, error) {
	var existing model.Canvas
	q := h.db.Preload("Nodes").Preload("Edges").
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

func (h *CanvasHandler) createCanvas(cv *model.Canvas) error {
	return h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(cv).Error; err != nil {
			return err
		}
		if cv.CanvasType == "inspiration" && cv.RefType == "asset_slot" && cv.RefID != nil && *cv.RefID != 0 {
			return createAssetSlotCanvasTargetNode(tx, cv)
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

func (h *CanvasHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID && !(cv.CanvasType == "workflow" && cv.Visibility == "public") {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.JSON(http.StatusOK, cv)
}

func (h *CanvasHandler) Patch(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req struct {
		Name        *string  `json:"name"`
		Description *string  `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		cv.Name = name
	}
	if req.Description != nil {
		cv.Description = strings.TrimSpace(*req.Description)
	}
	if req.Tags != nil && cv.CanvasType == "workflow" {
		tagsRaw, _ := json.Marshal(workflowmarket.CleanTags(req.Tags))
		cv.WorkflowTags = string(tagsRaw)
	}
	if err := h.db.Save(&cv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cv)
}

func (h *CanvasHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	h.db.Where("canvas_run_id IN (?)", h.db.Model(&model.CanvasRun{}).Select("id").Where("canvas_id = ?", cv.ID)).Delete(&model.CanvasTask{})
	h.db.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasRun{})
	h.db.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{})
	h.db.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{})
	h.db.Delete(&cv)
	c.Status(http.StatusNoContent)
}

// Save performs a full replace of nodes + edges for a canvas.
func (h *CanvasHandler) Save(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var req struct {
		Name       string             `json:"name"`
		CanvasType string             `json:"canvas_type"`
		Nodes      []model.CanvasNode `json:"nodes"`
		Edges      []model.CanvasEdge `json:"edges"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		cv.Name = req.Name
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{}).Error; err != nil {
			return err
		}
		if err := tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{}).Error; err != nil {
			return err
		}
		for i := range req.Nodes {
			req.Nodes[i].CanvasID = cv.ID
			req.Nodes[i].ID = 0
		}
		for i := range req.Edges {
			req.Edges[i].CanvasID = cv.ID
			req.Edges[i].ID = 0
		}
		if len(req.Nodes) > 0 {
			if err := tx.Create(&req.Nodes).Error; err != nil {
				return err
			}
		}
		if len(req.Edges) > 0 {
			if err := tx.Create(&req.Edges).Error; err != nil {
				return err
			}
		}
		return tx.Save(&cv).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cv)
}
