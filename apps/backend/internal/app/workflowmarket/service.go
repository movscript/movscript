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
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
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
type TemplateDef = domainmarket.TemplateDef
type TemplateNode = domainmarket.TemplateNode
type TemplateEdge = domainmarket.TemplateEdge
type MarketItem = domainmarket.MarketItem

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
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
	for _, tpl := range domainmarket.BuiltinTemplates() {
		items = append(items, domainmarket.TemplateMarketItem(tpl))
	}
	return items
}

func (s *Service) InstallTemplate(ctx context.Context, ownerID uint, key string, input InstallInput) (model.Canvas, error) {
	tpl, ok := domainmarket.FindTemplate(key)
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
		for _, tpl := range domainmarket.BuiltinTemplates() {
			item := domainmarket.TemplateMarketItem(tpl)
			if domainmarket.MarketItemMatches(item, query) {
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
			item := domainmarket.PublicCanvasMarketItem(cv)
			if domainmarket.MarketItemMatches(item, query) {
				items = append(items, item)
			}
		}
	}
	return items, nil
}

func (s *Service) GetByKey(ctx context.Context, key string, userID uint) (MarketItem, error) {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(key, "template:") {
		tpl, ok := domainmarket.FindTemplate(strings.TrimPrefix(key, "template:"))
		if !ok {
			return MarketItem{}, ErrWorkflowNotFound
		}
		return domainmarket.TemplateMarketItem(tpl), nil
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
	return domainmarket.PublicCanvasMarketItem(selected), nil
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
	if !domainmarket.ValidWorkflowKey(workflowKey) {
		return model.Canvas{}, ErrInvalidWorkflowKey
	}
	tagsRaw, _ := json.Marshal(domainmarket.CleanTags(input.Tags))
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

func BuiltinTemplates() []TemplateDef             { return domainmarket.BuiltinTemplates() }
func FindTemplate(key string) (TemplateDef, bool) { return domainmarket.FindTemplate(key) }
func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
	return domainmarket.TemplateNodesForCanvas(canvasID, defs)
}
func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
	return domainmarket.TemplateEdgesForCanvas(canvasID, defs)
}
func TemplateMarketItem(tpl TemplateDef) MarketItem { return domainmarket.TemplateMarketItem(tpl) }
func PublicCanvasMarketItem(cv model.Canvas) MarketItem {
	return domainmarket.PublicCanvasMarketItem(cv)
}
func CanvasWorkflowInputs(cv model.Canvas) []PortDef  { return domainmarket.CanvasWorkflowInputs(cv) }
func CanvasWorkflowOutputs(cv model.Canvas) []PortDef { return domainmarket.CanvasWorkflowOutputs(cv) }
func MarketItemMatches(item MarketItem, query string) bool {
	return domainmarket.MarketItemMatches(item, query)
}
func CleanTags(tags []string) []string { return domainmarket.CleanTags(tags) }
func DecodeTags(raw string) []string   { return domainmarket.DecodeTags(raw) }
func ValidWorkflowKey(key string) bool { return domainmarket.ValidWorkflowKey(key) }
