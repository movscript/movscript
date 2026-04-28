package handler

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type CanvasHandler struct {
	db        *gorm.DB
	registry  *ai.Registry
	svc       *ai.AIService
	store     storage.Storage
	uploadDir string
}

func NewCanvasHandler(db *gorm.DB, registry *ai.Registry, svc *ai.AIService, store storage.Storage) *CanvasHandler {
	return &CanvasHandler{db: db, registry: registry, svc: svc, store: store, uploadDir: "/tmp/movscript-canvas"}
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
	if canvasType := c.Query("type"); canvasType != "" {
		q = q.Where("canvas_type = ?", canvasType)
	}
	q.Find(&canvases)
	c.JSON(http.StatusOK, canvases)
}

func (h *CanvasHandler) Create(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name       string `json:"name" binding:"required"`
		ProjectID  *uint  `json:"project_id"`
		CanvasType string `json:"canvas_type"`
		Stage      string `json:"stage"`
		RefType    string `json:"ref_type"`
		RefID      *uint  `json:"ref_id"`
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
	cv := model.Canvas{
		OwnerID:    user.ID,
		Name:       req.Name,
		ProjectID:  req.ProjectID,
		CanvasType: req.CanvasType,
		Stage:      req.Stage,
		RefType:    req.RefType,
		RefID:      req.RefID,
	}
	h.db.Create(&cv)
	if cv.CanvasType == "workflow" {
		inputData, _ := json.Marshal(map[string]any{
			"source":     "manual",
			"inputValue": "",
			"paramName":  "input",
			"paramType":  "text",
		})
		outputData, _ := json.Marshal(map[string]any{
			"source":    "upload",
			"paramName": "output",
			"paramType": "resource",
		})
		h.db.Create(&[]model.CanvasNode{
			{CanvasID: cv.ID, NodeID: "input", Type: "input", Label: "输入", PosX: 120, PosY: 160, Data: string(inputData)},
			{CanvasID: cv.ID, NodeID: "output", Type: "output", Label: "输出", PosX: 460, PosY: 160, Data: string(outputData)},
		})
		h.db.Create(&model.CanvasEdge{CanvasID: cv.ID, EdgeID: "input-output", Source: "input", Target: "output", SourceHandle: "value", TargetHandle: "value"})
		h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID)
	}
	c.JSON(http.StatusCreated, cv)
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
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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

	h.db.Transaction(func(tx *gorm.DB) error {
		tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasNode{})
		tx.Where("canvas_id = ?", cv.ID).Delete(&model.CanvasEdge{})
		for i := range req.Nodes {
			req.Nodes[i].CanvasID = cv.ID
			req.Nodes[i].ID = 0
		}
		for i := range req.Edges {
			req.Edges[i].CanvasID = cv.ID
			req.Edges[i].ID = 0
		}
		if len(req.Nodes) > 0 {
			tx.Create(&req.Nodes)
		}
		if len(req.Edges) > 0 {
			tx.Create(&req.Edges)
		}
		tx.Save(&cv)
		return nil
	})

	h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID)
	c.JSON(http.StatusOK, cv)
}
