package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type WorkflowMarketHandler struct {
	db *gorm.DB
}

func NewWorkflowMarketHandler(db *gorm.DB) *WorkflowMarketHandler {
	return &WorkflowMarketHandler{db: db}
}

type workflowTemplateDef struct {
	Key         string                 `json:"key"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Category    string                 `json:"category,omitempty"`
	Tags        []string               `json:"tags,omitempty"`
	Inputs      []canvasPortDef        `json:"inputs,omitempty"`
	Outputs     []canvasPortDef        `json:"outputs,omitempty"`
	Nodes       []workflowTemplateNode `json:"nodes,omitempty"`
	Edges       []workflowTemplateEdge `json:"edges,omitempty"`
}

type workflowTemplateNode struct {
	NodeID string
	Type   string
	Label  string
	PosX   float64
	PosY   float64
	Data   map[string]any
}

type workflowTemplateEdge struct {
	EdgeID       string
	Source       string
	Target       string
	SourceHandle string
	TargetHandle string
}

type workflowMarketItem struct {
	Source      string          `json:"source"`
	CanvasID    uint            `json:"canvas_id,omitempty"`
	Key         string          `json:"key"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Category    string          `json:"category,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Inputs      []canvasPortDef `json:"inputs,omitempty"`
	Outputs     []canvasPortDef `json:"outputs,omitempty"`
	OwnerID     uint            `json:"owner_id,omitempty"`
	NodeCount   int             `json:"node_count,omitempty"`
	EdgeCount   int             `json:"edge_count,omitempty"`
	PublishedAt *time.Time      `json:"published_at,omitempty"`
}

func (h *WorkflowMarketHandler) ListTemplates(c *gin.Context) {
	items := make([]workflowMarketItem, 0)
	for _, tpl := range builtinWorkflowTemplates() {
		items = append(items, workflowTemplateMarketItem(tpl))
	}
	c.JSON(http.StatusOK, items)
}

func (h *WorkflowMarketHandler) InstallTemplate(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	tpl, ok := findWorkflowTemplate(c.Param("key"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow template not found"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		ProjectID *uint  `json:"project_id"`
		Stage     string `json:"stage"`
	}
	if !bindOptionalWorkflowJSON(c, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = tpl.Name
	}
	cv, err := h.createCanvasFromTemplate(user.ID, tpl, name, req.ProjectID, req.Stage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cv)
}

func (h *WorkflowMarketHandler) ListMarket(c *gin.Context) {
	source := strings.TrimSpace(c.Query("source"))
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	items := make([]workflowMarketItem, 0)
	if source == "" || source == "template" {
		for _, tpl := range builtinWorkflowTemplates() {
			item := workflowTemplateMarketItem(tpl)
			if workflowMarketItemMatches(item, query) {
				items = append(items, item)
			}
		}
	}
	if source == "" || source == "public" {
		var canvases []model.Canvas
		h.db.Preload("Nodes").Preload("Edges").
			Where("canvas_type = ? AND visibility = ?", "workflow", "public").
			Order("published_at DESC NULLS LAST, id DESC").
			Find(&canvases)
		for _, cv := range canvases {
			item := publicCanvasMarketItem(cv)
			if workflowMarketItemMatches(item, query) {
				items = append(items, item)
			}
		}
	}
	c.JSON(http.StatusOK, items)
}

func (h *WorkflowMarketHandler) GetByKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	key := strings.TrimSpace(c.Param("key"))
	if strings.HasPrefix(key, "template:") {
		tpl, ok := findWorkflowTemplate(strings.TrimPrefix(key, "template:"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
			return
		}
		c.JSON(http.StatusOK, workflowTemplateMarketItem(tpl))
		return
	}
	var canvases []model.Canvas
	h.db.Preload("Nodes").Preload("Edges").
		Where("canvas_type = ? AND workflow_key = ?", "workflow", key).
		Where("owner_id = ? OR visibility = ?", user.ID, "public").
		Order("id DESC").
		Find(&canvases)
	if len(canvases) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}
	selected := canvases[0]
	for _, cv := range canvases {
		if cv.OwnerID == user.ID {
			selected = cv
			break
		}
	}
	c.JSON(http.StatusOK, publicCanvasMarketItem(selected))
}

func (h *WorkflowMarketHandler) Publish(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	cv, ok := h.loadOwnedWorkflow(c, user.ID)
	if !ok {
		return
	}
	var req struct {
		WorkflowKey string   `json:"workflow_key"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if !bindOptionalWorkflowJSON(c, &req) {
		return
	}
	workflowKey := strings.TrimSpace(req.WorkflowKey)
	if workflowKey == "" {
		workflowKey = strings.TrimSpace(cv.WorkflowKey)
	}
	if workflowKey == "" {
		workflowKey = fmt.Sprintf("user.%d.workflow.%d", user.ID, cv.ID)
	}
	if !validWorkflowKey(workflowKey) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow_key must not contain whitespace or path separators"})
		return
	}
	tagsRaw, _ := json.Marshal(cleanWorkflowTags(req.Tags))
	now := time.Now()
	updates := map[string]any{
		"visibility":    "public",
		"workflow_key":  workflowKey,
		"workflow_tags": string(tagsRaw),
		"published_at":  &now,
	}
	if strings.TrimSpace(req.Description) != "" {
		updates["description"] = strings.TrimSpace(req.Description)
	}
	if err := h.db.Model(&cv).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID)
	c.JSON(http.StatusOK, cv)
}

func (h *WorkflowMarketHandler) Unpublish(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	cv, ok := h.loadOwnedWorkflow(c, user.ID)
	if !ok {
		return
	}
	if err := h.db.Model(&cv).Updates(map[string]any{
		"visibility":   "private",
		"published_at": nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cv.Visibility = "private"
	cv.PublishedAt = nil
	c.JSON(http.StatusOK, cv)
}

func (h *WorkflowMarketHandler) Clone(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		ProjectID *uint  `json:"project_id"`
		Stage     string `json:"stage"`
	}
	if !bindOptionalWorkflowJSON(c, &req) {
		return
	}
	var source model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&source, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}
	if source.CanvasType != "workflow" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only workflow canvases can be cloned"})
		return
	}
	if source.OwnerID != user.ID && source.Visibility != "public" {
		c.JSON(http.StatusForbidden, gin.H{"error": "workflow is not accessible"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = source.Name + " Copy"
	}
	cv, err := h.cloneWorkflowCanvas(source, user.ID, name, req.ProjectID, req.Stage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cv)
}

func (h *WorkflowMarketHandler) loadOwnedWorkflow(c *gin.Context, userID uint) (model.Canvas, bool) {
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return model.Canvas{}, false
	}
	if cv.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return model.Canvas{}, false
	}
	if cv.CanvasType != "workflow" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only workflow canvases can be published"})
		return model.Canvas{}, false
	}
	return cv, true
}

func (h *WorkflowMarketHandler) createCanvasFromTemplate(ownerID uint, tpl workflowTemplateDef, name string, projectID *uint, stage string) (model.Canvas, error) {
	tagsRaw, _ := json.Marshal(tpl.Tags)
	cv := model.Canvas{
		OwnerID:      ownerID,
		Name:         name,
		Description:  tpl.Description,
		CanvasType:   "workflow",
		ProjectID:    projectID,
		Stage:        stage,
		Visibility:   "private",
		WorkflowKey:  "template:" + tpl.Key,
		WorkflowTags: string(tagsRaw),
	}
	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		nodes := templateNodesForCanvas(cv.ID, tpl.Nodes)
		edges := templateEdgesForCanvas(cv.ID, tpl.Edges)
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
		return model.Canvas{}, err
	}
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func (h *WorkflowMarketHandler) cloneWorkflowCanvas(source model.Canvas, ownerID uint, name string, projectID *uint, stage string) (model.Canvas, error) {
	cv := model.Canvas{
		OwnerID:      ownerID,
		Name:         name,
		Description:  source.Description,
		CanvasType:   "workflow",
		ProjectID:    projectID,
		Stage:        stage,
		Visibility:   "private",
		WorkflowTags: source.WorkflowTags,
	}
	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		nodes := make([]model.CanvasNode, 0, len(source.Nodes))
		for _, node := range source.Nodes {
			node.ID = 0
			node.CanvasID = cv.ID
			node.CreatedAt = time.Time{}
			node.UpdatedAt = time.Time{}
			node.DeletedAt = gorm.DeletedAt{}
			nodes = append(nodes, node)
		}
		edges := make([]model.CanvasEdge, 0, len(source.Edges))
		for _, edge := range source.Edges {
			edge.ID = 0
			edge.CanvasID = cv.ID
			edge.CreatedAt = time.Time{}
			edge.UpdatedAt = time.Time{}
			edge.DeletedAt = gorm.DeletedAt{}
			edges = append(edges, edge)
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
		return nil
	})
	if err != nil {
		return model.Canvas{}, err
	}
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func builtinWorkflowTemplates() []workflowTemplateDef {
	return []workflowTemplateDef{
		{
			Key:         "text-generation",
			Name:        "Text Generation",
			Description: "Reusable prompt-to-text workflow with one text input and one text output.",
			Category:    "generation",
			Tags:        []string{"text", "ai", "starter"},
			Inputs:      []canvasPortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []canvasPortDef{{ID: "text", Label: "Text", Type: "text"}},
			Nodes: []workflowTemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-text", Type: "text", Label: "Generate Text", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []canvasPortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []canvasPortDef{{ID: "text", Label: "Text", Type: "text"}}}},
				{NodeID: "output-text", Type: "output", Label: "Text Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "text", "paramType": "text"}},
			},
			Edges: []workflowTemplateEdge{
				{EdgeID: "prompt-to-text", Source: "input-prompt", Target: "generate-text", SourceHandle: "value", TargetHandle: "prompt"},
				{EdgeID: "text-to-output", Source: "generate-text", Target: "output-text", SourceHandle: "text", TargetHandle: "value"},
			},
		},
		{
			Key:         "image-generation",
			Name:        "Image Generation",
			Description: "Reusable prompt-to-image workflow with a typed image output.",
			Category:    "generation",
			Tags:        []string{"image", "ai", "starter"},
			Inputs:      []canvasPortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []canvasPortDef{{ID: "image", Label: "Image", Type: "image"}},
			Nodes: []workflowTemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-image", Type: "image", Label: "Generate Image", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []canvasPortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []canvasPortDef{{ID: "image", Label: "Image", Type: "image"}}}},
				{NodeID: "output-image", Type: "output", Label: "Image Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "image", "paramType": "image"}},
			},
			Edges: []workflowTemplateEdge{
				{EdgeID: "prompt-to-image", Source: "input-prompt", Target: "generate-image", SourceHandle: "value", TargetHandle: "prompt"},
				{EdgeID: "image-to-output", Source: "generate-image", Target: "output-image", SourceHandle: "image", TargetHandle: "value"},
			},
		},
		{
			Key:         "input-output",
			Name:        "Input Output",
			Description: "Minimal workflow shell for plugin authors to fork into custom reusable flows.",
			Category:    "utility",
			Tags:        []string{"starter", "utility"},
			Inputs:      []canvasPortDef{{ID: "input", Label: "Input", Type: "text"}},
			Outputs:     []canvasPortDef{{ID: "output", Label: "Output", Type: "resource"}},
			Nodes: []workflowTemplateNode{
				{NodeID: "input", Type: "input", Label: "Input", PosX: 120, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "input", "paramType": "text", "inputValue": ""}},
				{NodeID: "output", Type: "output", Label: "Output", PosX: 460, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "output", "paramType": "resource"}},
			},
			Edges: []workflowTemplateEdge{{EdgeID: "input-output", Source: "input", Target: "output", SourceHandle: "value", TargetHandle: "value"}},
		},
	}
}

func findWorkflowTemplate(key string) (workflowTemplateDef, bool) {
	key = strings.TrimSpace(key)
	for _, tpl := range builtinWorkflowTemplates() {
		if tpl.Key == key {
			return tpl, true
		}
	}
	return workflowTemplateDef{}, false
}

func templateNodesForCanvas(canvasID uint, defs []workflowTemplateNode) []model.CanvasNode {
	nodes := make([]model.CanvasNode, 0, len(defs))
	for _, def := range defs {
		raw, _ := json.Marshal(def.Data)
		nodes = append(nodes, model.CanvasNode{
			CanvasID: canvasID,
			NodeID:   def.NodeID,
			Type:     def.Type,
			Label:    def.Label,
			PosX:     def.PosX,
			PosY:     def.PosY,
			Data:     string(raw),
		})
	}
	return nodes
}

func templateEdgesForCanvas(canvasID uint, defs []workflowTemplateEdge) []model.CanvasEdge {
	edges := make([]model.CanvasEdge, 0, len(defs))
	for _, def := range defs {
		edges = append(edges, model.CanvasEdge{
			CanvasID:     canvasID,
			EdgeID:       def.EdgeID,
			Source:       def.Source,
			Target:       def.Target,
			SourceHandle: def.SourceHandle,
			TargetHandle: def.TargetHandle,
		})
	}
	return edges
}

func workflowTemplateMarketItem(tpl workflowTemplateDef) workflowMarketItem {
	return workflowMarketItem{
		Source:      "template",
		Key:         "template:" + tpl.Key,
		Name:        tpl.Name,
		Description: tpl.Description,
		Category:    tpl.Category,
		Tags:        tpl.Tags,
		Inputs:      tpl.Inputs,
		Outputs:     tpl.Outputs,
		NodeCount:   len(tpl.Nodes),
		EdgeCount:   len(tpl.Edges),
	}
}

func publicCanvasMarketItem(cv model.Canvas) workflowMarketItem {
	key := strings.TrimSpace(cv.WorkflowKey)
	if key == "" {
		key = fmt.Sprintf("canvas:%d", cv.ID)
	}
	return workflowMarketItem{
		Source:      "public",
		CanvasID:    cv.ID,
		Key:         key,
		Name:        cv.Name,
		Description: cv.Description,
		Tags:        decodeWorkflowTags(cv.WorkflowTags),
		Inputs:      canvasWorkflowInputs(cv),
		Outputs:     canvasWorkflowOutputs(cv),
		OwnerID:     cv.OwnerID,
		NodeCount:   len(cv.Nodes),
		EdgeCount:   len(cv.Edges),
		PublishedAt: cv.PublishedAt,
	}
}

func canvasWorkflowInputs(cv model.Canvas) []canvasPortDef {
	ports := make([]canvasPortDef, 0)
	for _, node := range cv.Nodes {
		if node.Type != "input" {
			continue
		}
		var nd nodeData
		_ = json.Unmarshal([]byte(node.Data), &nd)
		id := strings.TrimSpace(nd.ParamName)
		if id == "" {
			id = node.NodeID
		}
		ports = append(ports, canvasPortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "text")})
	}
	return ports
}

func canvasWorkflowOutputs(cv model.Canvas) []canvasPortDef {
	ports := make([]canvasPortDef, 0)
	for _, node := range cv.Nodes {
		if node.Type != "output" {
			continue
		}
		var nd nodeData
		_ = json.Unmarshal([]byte(node.Data), &nd)
		id := strings.TrimSpace(nd.ParamName)
		if id == "" {
			id = node.NodeID
		}
		ports = append(ports, canvasPortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "resource")})
	}
	return ports
}

func workflowMarketItemMatches(item workflowMarketItem, query string) bool {
	if query == "" {
		return true
	}
	haystack := strings.ToLower(strings.Join(append([]string{item.Key, item.Name, item.Description, item.Category}, item.Tags...), " "))
	return strings.Contains(haystack, query)
}

func cleanWorkflowTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func decodeWorkflowTags(raw string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(raw), &tags); err != nil {
		return nil
	}
	return cleanWorkflowTags(tags)
}

func validWorkflowKey(key string) bool {
	return strings.TrimSpace(key) != "" && !strings.ContainsAny(key, " \t\r\n/\\")
}

func bindOptionalWorkflowJSON(c *gin.Context, out any) bool {
	if c.Request == nil || c.Request.Body == nil || c.Request.ContentLength == 0 {
		return true
	}
	if err := c.ShouldBindJSON(out); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return false
	}
	return true
}
