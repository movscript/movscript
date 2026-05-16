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

func TestCreativeUsagePatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_creative_usage_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.CreativeReference{},
		&persistencemodel.CreativeReferenceUsage{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	service := NewService(db)
	ctx := context.Background()

	firstRef, err := service.CreateCreativeReference(ctx, 1, CreativeReferenceInput{Kind: "character", Name: "First"})
	if err != nil {
		t.Fatalf("create first reference: %v", err)
	}
	secondRef, err := service.CreateCreativeReference(ctx, 1, CreativeReferenceInput{Kind: "character", Name: "Second"})
	if err != nil {
		t.Fatalf("create second reference: %v", err)
	}
	usage, err := service.CreateCreativeReferenceUsage(ctx, 1, CreativeReferenceUsageInput{
		OwnerType:           "project",
		OwnerID:             1,
		CreativeReferenceID: firstRef.ID,
		Role:                "subject",
	})
	if err != nil {
		t.Fatalf("create usage: %v", err)
	}

	if _, err := service.PatchCreativeReferenceUsage(ctx, 1, fmt.Sprint(usage.ID), CreativeReferenceUsageInput{
		OwnerType:           "project",
		OwnerID:             1,
		CreativeReferenceID: secondRef.ID,
		Role:                "subject",
	}); err != nil {
		t.Fatalf("patch usage: %v", err)
	}

	current, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
		Source:    domainrelation.NewEntityRef("project", 1),
	})
	if err != nil {
		t.Fatalf("list current edges: %v", err)
	}
	if len(current) != 1 || current[0].Target.ID != secondRef.ID {
		t.Fatalf("current usage edges = %+v, want only second reference", current)
	}

	oldUsages, err := service.ListCreativeReferenceUsages(ctx, CreativeReferenceUsageFilter{ProjectID: 1, CreativeReferenceID: firstRef.ID})
	if err != nil {
		t.Fatalf("list old reference usages: %v", err)
	}
	if len(oldUsages) != 0 {
		t.Fatalf("old reference usages = %+v, want none", oldUsages)
	}
}
