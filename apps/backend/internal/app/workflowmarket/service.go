package workflowmarket

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
	"github.com/movscript/movscript/internal/infra/entityrelation"
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
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		if err := entityrelation.SyncCoreEntityRelations(tx, &cv); err != nil {
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

func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
	return domainmarket.TemplateNodesForCanvas(canvasID, defs)
}

func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
	return domainmarket.TemplateEdgesForCanvas(canvasID, defs)
}

func BuiltinTemplates() []TemplateDef               { return domainmarket.BuiltinTemplates() }
func FindTemplate(key string) (TemplateDef, bool)   { return domainmarket.FindTemplate(key) }
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
