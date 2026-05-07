package workflowmarket

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestBuiltinWorkflowTemplatesExposeReusablePorts(t *testing.T) {
	tpl, ok := domainmarket.FindTemplate("image-generation")
	if !ok {
		t.Fatal("expected image-generation workflow template")
	}
	if len(tpl.Inputs) != 1 || tpl.Inputs[0].ID != "prompt" || tpl.Inputs[0].Type != "text" {
		t.Fatalf("unexpected template inputs: %#v", tpl.Inputs)
	}
	if len(tpl.Outputs) != 1 || tpl.Outputs[0].ID != "image" || tpl.Outputs[0].Type != "image" {
		t.Fatalf("unexpected template outputs: %#v", tpl.Outputs)
	}

	nodes := domainmarket.TemplateNodesForCanvas(12, tpl.Nodes)
	edges := domainmarket.TemplateEdgesForCanvas(12, tpl.Edges)
	if len(nodes) != 3 || len(edges) != 2 {
		t.Fatalf("expected 3 nodes and 2 edges, got %d nodes and %d edges", len(nodes), len(edges))
	}
	if nodes[1].CanvasID != 12 || nodes[1].Type != "image" {
		t.Fatalf("unexpected generated node: %#v", nodes[1])
	}

	var data canvasruntime.NodeData
	if err := json.Unmarshal([]byte(nodes[1].Data), &data); err != nil {
		t.Fatalf("generated node data should be JSON: %v", err)
	}
	if data.Source != "ai" || len(data.InputPorts) != 1 || data.InputPorts[0].ID != "prompt" {
		t.Fatalf("unexpected generated node data: %#v", data)
	}
}

func TestWorkflowMarketItemMatchSearchesTags(t *testing.T) {
	item := domainmarket.MarketItem{Key: "template:image-generation", Name: "Image Generation", Tags: []string{"starter"}}
	if !domainmarket.MarketItemMatches(item, "starter") {
		t.Fatal("expected query to match tags")
	}
	if domainmarket.MarketItemMatches(item, "storyboard") {
		t.Fatal("did not expect unrelated query to match")
	}
}

func TestInstallTemplateCreatesWorkflowCanvasWithoutHooks(t *testing.T) {
	db := newWorkflowMarketTestDB(t)
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))

	cv, err := service.InstallTemplate(context.Background(), 7, "image-generation", InstallInput{Name: "Demo workflow"})
	if err != nil {
		t.Fatalf("install template: %v", err)
	}
	if cv.CanvasType != "workflow" || cv.WorkflowKey != "template:image-generation" {
		t.Fatalf("unexpected canvas: %+v", cv)
	}
	if len(cv.Nodes) == 0 || len(cv.Edges) == 0 {
		t.Fatalf("expected template nodes and edges to persist: %+v", cv)
	}
}

func newWorkflowMarketTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "workflowmarket.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.EntityRelation{}, &model.Canvas{}, &model.CanvasNode{}, &model.CanvasEdge{}); err != nil {
		t.Fatalf("migrate workflow market db: %v", err)
	}
	return db
}
