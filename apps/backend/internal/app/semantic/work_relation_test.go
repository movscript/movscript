package semantic

import (
	"context"
	"fmt"
	"testing"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestWorkItemPatchExpiresPreviousWorkflowRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_work_item_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.WorkItem{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstSlot := persistencemodel.AssetSlot{ProjectID: 1, Name: "First", Status: "missing"}
	secondSlot := persistencemodel.AssetSlot{ProjectID: 1, Name: "Second", Status: "missing"}
	if err := db.Create(&firstSlot).Error; err != nil {
		t.Fatalf("seed first slot: %v", err)
	}
	if err := db.Create(&secondSlot).Error; err != nil {
		t.Fatalf("seed second slot: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	auth := WorkAuth{Role: "owner", UserID: 1}
	item, err := service.CreateWorkItem(ctx, 1, auth, WorkItemInput{
		TargetType: "asset_slot",
		TargetID:   firstSlot.ID,
		Kind:       "human",
		Title:      "Generate",
		Status:     "todo",
	})
	if err != nil {
		t.Fatalf("create work item: %v", err)
	}
	if _, err := service.PatchWorkItem(ctx, 1, fmt.Sprint(item.ID), auth, WorkItemInput{
		TargetType: "asset_slot",
		TargetID:   secondSlot.ID,
		Kind:       "human",
		Title:      "Generate",
		Status:     "todo",
	}); err != nil {
		t.Fatalf("patch work item: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeTargets,
		Source:    domainrelation.NewEntityRef("work_item", item.ID),
	})
	if err != nil {
		t.Fatalf("list work item edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondSlot.ID {
		t.Fatalf("current work item target edges = %+v, want only second slot", edges)
	}
}

func TestWorkDependencyPatchExpiresPreviousWorkflowRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_work_dependency_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.WorkItem{},
		&persistencemodel.WorkDependency{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	slot := persistencemodel.AssetSlot{ProjectID: 1, Name: "Target", Status: "missing"}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("seed slot: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	auth := WorkAuth{Role: "owner", UserID: 1}
	target, err := service.CreateWorkItem(ctx, 1, auth, WorkItemInput{TargetType: "asset_slot", TargetID: slot.ID, Kind: "human", Title: "Target", Status: "todo"})
	if err != nil {
		t.Fatalf("create target work item: %v", err)
	}
	firstDependency, err := service.CreateWorkItem(ctx, 1, auth, WorkItemInput{TargetType: "asset_slot", TargetID: slot.ID, Kind: "human", Title: "First", Status: "todo"})
	if err != nil {
		t.Fatalf("create first dependency work item: %v", err)
	}
	secondDependency, err := service.CreateWorkItem(ctx, 1, auth, WorkItemInput{TargetType: "asset_slot", TargetID: slot.ID, Kind: "human", Title: "Second", Status: "todo"})
	if err != nil {
		t.Fatalf("create second dependency work item: %v", err)
	}
	dependency, err := service.CreateWorkDependency(ctx, 1, auth, WorkDependencyInput{
		WorkItemID:          target.ID,
		DependsOnWorkItemID: firstDependency.ID,
		DependencyType:      "depends_on",
	})
	if err != nil {
		t.Fatalf("create work dependency: %v", err)
	}
	if _, err := service.PatchWorkDependency(ctx, 1, fmt.Sprint(dependency.ID), auth, WorkDependencyInput{
		WorkItemID:          target.ID,
		DependsOnWorkItemID: secondDependency.ID,
		DependencyType:      "blocks",
	}); err != nil {
		t.Fatalf("patch work dependency: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeBlocks,
		Target:    domainrelation.NewEntityRef("work_item", target.ID),
	})
	if err != nil {
		t.Fatalf("list work dependency edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Source.ID != secondDependency.ID {
		t.Fatalf("current work dependency edges = %+v, want only second dependency source", edges)
	}
}

func TestWorkReviewPatchExpiresPreviousWorkflowRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_work_review_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.User{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.WorkItem{},
		&persistencemodel.WorkReview{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project", OwnerID: 1}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	user := persistencemodel.User{Username: "reviewer"}
	user.ID = 1
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	member := persistencemodel.ProjectMember{ProjectID: 1, UserID: 1, Role: "owner"}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}
	slot := persistencemodel.AssetSlot{ProjectID: 1, Name: "Target", Status: "missing"}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("seed slot: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	auth := WorkAuth{Role: "owner", UserID: 1}
	item, err := service.CreateWorkItem(ctx, 1, auth, WorkItemInput{TargetType: "asset_slot", TargetID: slot.ID, Kind: "review", Title: "Review", Status: "review"})
	if err != nil {
		t.Fatalf("create work item: %v", err)
	}
	review, err := service.CreateWorkReview(ctx, 1, auth, WorkReviewInput{WorkItemID: item.ID, Status: "pending", Comment: "first"})
	if err != nil {
		t.Fatalf("create work review: %v", err)
	}
	if _, err := service.PatchWorkReview(ctx, 1, fmt.Sprint(review.ID), auth, WorkReviewInput{WorkItemID: item.ID, Status: "approved", Comment: "done"}); err != nil {
		t.Fatalf("patch work review: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Source:    domainrelation.NewEntityRef("work_review", review.ID),
	})
	if err != nil {
		t.Fatalf("list work review edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != item.ID || edges[0].Label != "approved" {
		t.Fatalf("current work review edges = %+v, want only approved review edge", edges)
	}
}
