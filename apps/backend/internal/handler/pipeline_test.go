package handler

import (
	"testing"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func TestVisibleHierarchyRootCountIgnoresDependencyEdges(t *testing.T) {
	nodes := []model.PipelineNode{
		{Model: modelWithID(1), Type: "script_writing"},
		{Model: modelWithID(2), Type: "main_script"},
		{Model: modelWithID(3), Type: "episode_script"},
	}
	edges := []model.PipelineEdge{
		{FromNodeID: 1, ToNodeID: 2, RelationType: "hierarchy"},
		{FromNodeID: 2, ToNodeID: 3, RelationType: "dependency"},
	}

	if got := visibleHierarchyRootCount(nodes, edges, 0); got != 2 {
		t.Fatalf("root count = %d, want 2", got)
	}
}

func TestDeletingLeafDoesNotBreakAlreadyMultiRootPipeline(t *testing.T) {
	nodes := []model.PipelineNode{
		{Model: modelWithID(1), Type: "script_writing"},
		{Model: modelWithID(2), Type: "main_script"},
		{Model: modelWithID(3), Type: "episode_script"},
		{Model: modelWithID(4), Type: "episode_script"},
	}
	edges := []model.PipelineEdge{
		{FromNodeID: 1, ToNodeID: 2, RelationType: "hierarchy"},
		{FromNodeID: 3, ToNodeID: 4, RelationType: "hierarchy"},
	}

	before := visibleHierarchyRootCount(nodes, edges, 0)
	after := visibleHierarchyRootCount(nodes, edges, 2)
	if before != 2 || after != 2 {
		t.Fatalf("before/after root count = %d/%d, want 2/2", before, after)
	}
	if after > 1 && after > before {
		t.Fatal("deleting a leaf should not be treated as creating additional roots")
	}
}

func TestDeletingParentWithChildBreaksSingleRootPipeline(t *testing.T) {
	nodes := []model.PipelineNode{
		{Model: modelWithID(1), Type: "script_writing"},
		{Model: modelWithID(2), Type: "main_script"},
		{Model: modelWithID(3), Type: "episode_script"},
	}
	edges := []model.PipelineEdge{
		{FromNodeID: 1, ToNodeID: 2, RelationType: "hierarchy"},
		{FromNodeID: 1, ToNodeID: 3, RelationType: "hierarchy"},
	}

	before := visibleHierarchyRootCount(nodes, edges, 0)
	after := visibleHierarchyRootCount(nodes, edges, 1)
	if before != 1 || after != 2 {
		t.Fatalf("before/after root count = %d/%d, want 1/2", before, after)
	}
	if !(after > 1 && after > before) {
		t.Fatal("deleting a parent with children should be treated as creating additional roots")
	}
}

func modelWithID(id uint) gorm.Model {
	return gorm.Model{ID: id}
}
