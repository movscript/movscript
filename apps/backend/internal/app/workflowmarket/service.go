package workflowmarket

import (
	"context"
	"errors"
	"strings"

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
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
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
	return s.repo.CreateCanvasFromTemplate(ctx, ownerID, tpl, name, input.ProjectID, input.Stage)
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
		canvases, err := s.repo.ListPublicCanvases(ctx)
		if err != nil {
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
	canvases, err := s.repo.FindWorkflowCanvasesByKey(ctx, key, userID)
	if err != nil {
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

func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
	domainNodes := domainmarket.TemplateNodesForCanvas(canvasID, defs)
	nodes := make([]model.CanvasNode, 0, len(domainNodes))
	for _, node := range domainNodes {
		nodes = append(nodes, node.ToModel())
	}
	return nodes
}

func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
	domainEdges := domainmarket.TemplateEdgesForCanvas(canvasID, defs)
	edges := make([]model.CanvasEdge, 0, len(domainEdges))
	for _, edge := range domainEdges {
		edges = append(edges, edge.ToModel())
	}
	return edges
}

func BuiltinTemplates() []TemplateDef               { return domainmarket.BuiltinTemplates() }
func FindTemplate(key string) (TemplateDef, bool)   { return domainmarket.FindTemplate(key) }
func TemplateMarketItem(tpl TemplateDef) MarketItem { return domainmarket.TemplateMarketItem(tpl) }
func PublicCanvasMarketItem(cv model.Canvas) MarketItem {
	return domainmarket.PublicCanvasMarketItem(publicCanvasFromModel(cv))
}
func CanvasWorkflowInputs(cv model.Canvas) []PortDef {
	return domainmarket.CanvasWorkflowInputs(publicCanvasFromModel(cv))
}
func CanvasWorkflowOutputs(cv model.Canvas) []PortDef {
	return domainmarket.CanvasWorkflowOutputs(publicCanvasFromModel(cv))
}
func publicCanvasFromModel(cv model.Canvas) domainmarket.PublicCanvas {
	nodes := make([]canvasruntime.CanvasNode, 0, len(cv.Nodes))
	for _, node := range cv.Nodes {
		nodes = append(nodes, canvasruntime.CanvasNodeFromModel(node))
	}
	edges := make([]canvasruntime.CanvasEdge, 0, len(cv.Edges))
	for _, edge := range cv.Edges {
		edges = append(edges, canvasruntime.CanvasEdgeFromModel(edge))
	}
	return domainmarket.PublicCanvas{
		Canvas: canvasruntime.CanvasFromModel(cv),
		Nodes:  nodes,
		Edges:  edges,
	}
}
func MarketItemMatches(item MarketItem, query string) bool {
	return domainmarket.MarketItemMatches(item, query)
}
func CleanTags(tags []string) []string { return domainmarket.CleanTags(tags) }
func DecodeTags(raw string) []string   { return domainmarket.DecodeTags(raw) }
func ValidWorkflowKey(key string) bool { return domainmarket.ValidWorkflowKey(key) }
