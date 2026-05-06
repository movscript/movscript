package workflowmarket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

var (
	ErrNotAuthenticated   = errors.New("not authenticated")
	ErrTemplateNotFound   = errors.New("workflow template not found")
	ErrWorkflowNotFound   = errors.New("workflow not found")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidWorkflow    = errors.New("only workflow canvases can be used")
	ErrInvalidWorkflowKey = errors.New("workflow_key must not contain whitespace or path separators")
)

type PortDef = canvasruntime.PortDef
type nodeData = canvasruntime.NodeData

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type TemplateDef struct {
	Key         string         `json:"key"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Category    string         `json:"category,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
	Inputs      []PortDef      `json:"inputs,omitempty"`
	Outputs     []PortDef      `json:"outputs,omitempty"`
	Nodes       []TemplateNode `json:"nodes,omitempty"`
	Edges       []TemplateEdge `json:"edges,omitempty"`
}

type TemplateNode struct {
	NodeID string
	Type   string
	Label  string
	PosX   float64
	PosY   float64
	Data   map[string]any
}

type TemplateEdge struct {
	EdgeID       string
	Source       string
	Target       string
	SourceHandle string
	TargetHandle string
}

type MarketItem struct {
	Source      string     `json:"source"`
	CanvasID    uint       `json:"canvas_id,omitempty"`
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Category    string     `json:"category,omitempty"`
	Tags        []string   `json:"tags,omitempty"`
	Inputs      []PortDef  `json:"inputs,omitempty"`
	Outputs     []PortDef  `json:"outputs,omitempty"`
	OwnerID     uint       `json:"owner_id,omitempty"`
	NodeCount   int        `json:"node_count,omitempty"`
	EdgeCount   int        `json:"edge_count,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
}

type InstallInput struct {
	Name      string
	ProjectID *uint
	Stage     string
}

type PublishInput struct {
	WorkflowKey string
	Description string
	Tags        []string
}

type CloneInput struct {
	Name      string
	ProjectID *uint
	Stage     string
}

func (s *Service) ListTemplates() []MarketItem {
	items := make([]MarketItem, 0)
	for _, tpl := range BuiltinTemplates() {
		items = append(items, TemplateMarketItem(tpl))
	}
	return items
}

func (s *Service) InstallTemplate(ctx context.Context, ownerID uint, key string, input InstallInput) (model.Canvas, error) {
	tpl, ok := FindTemplate(key)
	if !ok {
		return model.Canvas{}, ErrTemplateNotFound
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = tpl.Name
	}
	return s.createCanvasFromTemplate(ctx, ownerID, tpl, name, input.ProjectID, input.Stage)
}

func (s *Service) ListMarket(ctx context.Context, source string, query string) ([]MarketItem, error) {
	source = strings.TrimSpace(source)
	query = strings.ToLower(strings.TrimSpace(query))
	items := make([]MarketItem, 0)
	if source == "" || source == "template" {
		for _, tpl := range BuiltinTemplates() {
			item := TemplateMarketItem(tpl)
			if MarketItemMatches(item, query) {
				items = append(items, item)
			}
		}
	}
	if source == "" || source == "public" {
		var canvases []model.Canvas
		if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
			Where("canvas_type = ? AND visibility = ?", "workflow", "public").
			Order("published_at DESC NULLS LAST, id DESC").
			Find(&canvases).Error; err != nil {
			return nil, err
		}
		for _, cv := range canvases {
			item := PublicCanvasMarketItem(cv)
			if MarketItemMatches(item, query) {
				items = append(items, item)
			}
		}
	}
	return items, nil
}

func (s *Service) GetByKey(ctx context.Context, key string, userID uint) (MarketItem, error) {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(key, "template:") {
		tpl, ok := FindTemplate(strings.TrimPrefix(key, "template:"))
		if !ok {
			return MarketItem{}, ErrWorkflowNotFound
		}
		return TemplateMarketItem(tpl), nil
	}
	var canvases []model.Canvas
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").
		Where("canvas_type = ? AND workflow_key = ?", "workflow", key).
		Where("owner_id = ? OR visibility = ?", userID, "public").
		Order("id DESC").
		Find(&canvases).Error; err != nil {
		return MarketItem{}, err
	}
	if len(canvases) == 0 {
		return MarketItem{}, ErrWorkflowNotFound
	}
	selected := canvases[0]
	for _, cv := range canvases {
		if cv.OwnerID == userID {
			selected = cv
			break
		}
	}
	return PublicCanvasMarketItem(selected), nil
}

func (s *Service) Publish(ctx context.Context, id uint, userID uint, input PublishInput) (model.Canvas, error) {
	cv, err := s.loadOwnedWorkflow(ctx, id, userID)
	if err != nil {
		return model.Canvas{}, err
	}
	workflowKey := strings.TrimSpace(input.WorkflowKey)
	if workflowKey == "" {
		workflowKey = strings.TrimSpace(cv.WorkflowKey)
	}
	if workflowKey == "" {
		workflowKey = fmt.Sprintf("user.%d.workflow.%d", userID, cv.ID)
	}
	if !ValidWorkflowKey(workflowKey) {
		return model.Canvas{}, ErrInvalidWorkflowKey
	}
	tagsRaw, _ := json.Marshal(CleanTags(input.Tags))
	now := time.Now()
	updates := map[string]any{
		"visibility":    "public",
		"workflow_key":  workflowKey,
		"workflow_tags": string(tagsRaw),
		"published_at":  &now,
	}
	if strings.TrimSpace(input.Description) != "" {
		updates["description"] = strings.TrimSpace(input.Description)
	}
	if err := s.db.WithContext(ctx).Model(&cv).Updates(updates).Error; err != nil {
		return model.Canvas{}, err
	}
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func (s *Service) Unpublish(ctx context.Context, id uint, userID uint) (model.Canvas, error) {
	cv, err := s.loadOwnedWorkflow(ctx, id, userID)
	if err != nil {
		return model.Canvas{}, err
	}
	if err := s.db.WithContext(ctx).Model(&cv).Updates(map[string]any{
		"visibility":   "private",
		"published_at": nil,
	}).Error; err != nil {
		return model.Canvas{}, err
	}
	cv.Visibility = "private"
	cv.PublishedAt = nil
	return cv, nil
}

func (s *Service) Clone(ctx context.Context, id uint, userID uint, input CloneInput) (model.Canvas, error) {
	var source model.Canvas
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&source, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Canvas{}, ErrWorkflowNotFound
		}
		return model.Canvas{}, err
	}
	if source.CanvasType != "workflow" {
		return model.Canvas{}, ErrInvalidWorkflow
	}
	if source.OwnerID != userID && source.Visibility != "public" {
		return model.Canvas{}, ErrForbidden
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = source.Name + " Copy"
	}
	return s.cloneWorkflowCanvas(ctx, source, userID, name, input.ProjectID, input.Stage)
}

func (s *Service) loadOwnedWorkflow(ctx context.Context, id uint, userID uint) (model.Canvas, error) {
	var cv model.Canvas
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Canvas{}, ErrWorkflowNotFound
		}
		return model.Canvas{}, err
	}
	if cv.OwnerID != userID {
		return model.Canvas{}, ErrForbidden
	}
	if cv.CanvasType != "workflow" {
		return model.Canvas{}, ErrInvalidWorkflow
	}
	return cv, nil
}

func (s *Service) createCanvasFromTemplate(ctx context.Context, ownerID uint, tpl TemplateDef, name string, projectID *uint, stage string) (model.Canvas, error) {
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
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		nodes := TemplateNodesForCanvas(cv.ID, tpl.Nodes)
		edges := TemplateEdgesForCanvas(cv.ID, tpl.Edges)
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
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func (s *Service) cloneWorkflowCanvas(ctx context.Context, source model.Canvas, ownerID uint, name string, projectID *uint, stage string) (model.Canvas, error) {
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
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func BuiltinTemplates() []TemplateDef {
	return []TemplateDef{
		{
			Key:         "text-generation",
			Name:        "Text Generation",
			Description: "Reusable prompt-to-text workflow with one text input and one text output.",
			Category:    "generation",
			Tags:        []string{"text", "ai", "starter"},
			Inputs:      []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []PortDef{{ID: "text", Label: "Text", Type: "text"}},
			Nodes: []TemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-text", Type: "text", Label: "Generate Text", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []PortDef{{ID: "text", Label: "Text", Type: "text"}}}},
				{NodeID: "output-text", Type: "output", Label: "Text Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "text", "paramType": "text"}},
			},
			Edges: []TemplateEdge{
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
			Inputs:      []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []PortDef{{ID: "image", Label: "Image", Type: "image"}},
			Nodes: []TemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-image", Type: "image", Label: "Generate Image", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []PortDef{{ID: "image", Label: "Image", Type: "image"}}}},
				{NodeID: "output-image", Type: "output", Label: "Image Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "image", "paramType": "image"}},
			},
			Edges: []TemplateEdge{
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
			Inputs:      []PortDef{{ID: "input", Label: "Input", Type: "text"}},
			Outputs:     []PortDef{{ID: "output", Label: "Output", Type: "resource"}},
			Nodes: []TemplateNode{
				{NodeID: "input", Type: "input", Label: "Input", PosX: 120, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "input", "paramType": "text", "inputValue": ""}},
				{NodeID: "output", Type: "output", Label: "Output", PosX: 460, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "output", "paramType": "resource"}},
			},
			Edges: []TemplateEdge{{EdgeID: "input-output", Source: "input", Target: "output", SourceHandle: "value", TargetHandle: "value"}},
		},
	}
}

func FindTemplate(key string) (TemplateDef, bool) {
	key = strings.TrimSpace(key)
	for _, tpl := range BuiltinTemplates() {
		if tpl.Key == key {
			return tpl, true
		}
	}
	return TemplateDef{}, false
}

func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
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

func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
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

func TemplateMarketItem(tpl TemplateDef) MarketItem {
	return MarketItem{
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

func PublicCanvasMarketItem(cv model.Canvas) MarketItem {
	key := strings.TrimSpace(cv.WorkflowKey)
	if key == "" {
		key = fmt.Sprintf("canvas:%d", cv.ID)
	}
	return MarketItem{
		Source:      "public",
		CanvasID:    cv.ID,
		Key:         key,
		Name:        cv.Name,
		Description: cv.Description,
		Tags:        DecodeTags(cv.WorkflowTags),
		Inputs:      CanvasWorkflowInputs(cv),
		Outputs:     CanvasWorkflowOutputs(cv),
		OwnerID:     cv.OwnerID,
		NodeCount:   len(cv.Nodes),
		EdgeCount:   len(cv.Edges),
		PublishedAt: cv.PublishedAt,
	}
}

func CanvasWorkflowInputs(cv model.Canvas) []PortDef {
	ports := make([]PortDef, 0)
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
		ports = append(ports, PortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "text")})
	}
	return ports
}

func CanvasWorkflowOutputs(cv model.Canvas) []PortDef {
	ports := make([]PortDef, 0)
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
		ports = append(ports, PortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "resource")})
	}
	return ports
}

func MarketItemMatches(item MarketItem, query string) bool {
	if query == "" {
		return true
	}
	haystack := strings.ToLower(strings.Join(append([]string{item.Key, item.Name, item.Description, item.Category}, item.Tags...), " "))
	return strings.Contains(haystack, query)
}

func CleanTags(tags []string) []string {
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

func DecodeTags(raw string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(raw), &tags); err != nil {
		return nil
	}
	return CleanTags(tags)
}

func ValidWorkflowKey(key string) bool {
	return strings.TrimSpace(key) != "" && !strings.ContainsAny(key, " \t\r\n/\\")
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
