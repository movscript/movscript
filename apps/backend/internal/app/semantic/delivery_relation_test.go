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

func TestDeliveryVersionPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_delivery_version_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.Production{},
		&persistencemodel.DeliveryVersion{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstProduction := persistencemodel.Production{ProjectID: 1, Name: "First", Status: "draft"}
	secondProduction := persistencemodel.Production{ProjectID: 1, Name: "Second", Status: "draft"}
	if err := db.Create(&firstProduction).Error; err != nil {
		t.Fatalf("seed first production: %v", err)
	}
	if err := db.Create(&secondProduction).Error; err != nil {
		t.Fatalf("seed second production: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	version, err := service.CreateDeliveryVersion(ctx, 1, DeliveryVersionInput{
		ProductionID: &firstProduction.ID,
		Name:         "Delivery",
		Status:       "draft",
	})
	if err != nil {
		t.Fatalf("create delivery version: %v", err)
	}
	if _, err := service.PatchDeliveryVersion(ctx, 1, fmt.Sprint(version.ID), DeliveryVersionInput{
		ProductionID: &secondProduction.ID,
		Name:         "Delivery",
		Status:       "draft",
	}); err != nil {
		t.Fatalf("patch delivery version: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("delivery_version", version.ID),
	})
	if err != nil {
		t.Fatalf("list delivery version edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondProduction.ID {
		t.Fatalf("current delivery version edges = %+v, want only second production", edges)
	}
}

func TestDeliveryTimelineItemPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_delivery_timeline_item_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.RawResource{},
		&persistencemodel.DeliveryVersion{},
		&persistencemodel.DeliveryTimelineItem{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstResource := persistencemodel.RawResource{Type: "image", Name: "First"}
	secondResource := persistencemodel.RawResource{Type: "image", Name: "Second"}
	if err := db.Create(&firstResource).Error; err != nil {
		t.Fatalf("seed first resource: %v", err)
	}
	if err := db.Create(&secondResource).Error; err != nil {
		t.Fatalf("seed second resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	version, err := service.CreateDeliveryVersion(ctx, 1, DeliveryVersionInput{Name: "Delivery", Status: "draft"})
	if err != nil {
		t.Fatalf("create delivery version: %v", err)
	}
	item, err := service.CreateDeliveryTimelineItem(ctx, 1, DeliveryTimelineItemInput{
		DeliveryVersionID: version.ID,
		ResourceID:        &firstResource.ID,
		Kind:              "image",
		Status:            "draft",
	})
	if err != nil {
		t.Fatalf("create delivery timeline item: %v", err)
	}
	if _, err := service.PatchDeliveryTimelineItem(ctx, 1, fmt.Sprint(item.ID), DeliveryTimelineItemInput{
		DeliveryVersionID: version.ID,
		ResourceID:        &secondResource.ID,
		Kind:              "image",
		Status:            "draft",
	}); err != nil {
		t.Fatalf("patch delivery timeline item: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeUsesResource,
		Source:    domainrelation.NewEntityRef("delivery_timeline_item", item.ID),
	})
	if err != nil {
		t.Fatalf("list delivery timeline item edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondResource.ID {
		t.Fatalf("current delivery timeline item edges = %+v, want only second resource", edges)
	}
}

func TestExportRecordPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_export_record_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.RawResource{},
		&persistencemodel.DeliveryVersion{},
		&persistencemodel.ExportRecord{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstResource := persistencemodel.RawResource{Type: "video", Name: "First"}
	secondResource := persistencemodel.RawResource{Type: "video", Name: "Second"}
	if err := db.Create(&firstResource).Error; err != nil {
		t.Fatalf("seed first resource: %v", err)
	}
	if err := db.Create(&secondResource).Error; err != nil {
		t.Fatalf("seed second resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	version, err := service.CreateDeliveryVersion(ctx, 1, DeliveryVersionInput{Name: "Delivery", Status: "draft"})
	if err != nil {
		t.Fatalf("create delivery version: %v", err)
	}
	record, err := service.CreateExportRecord(ctx, 1, ExportRecordInput{
		DeliveryVersionID: version.ID,
		ResourceID:        &firstResource.ID,
		Status:            "queued",
		Format:            "mp4",
	})
	if err != nil {
		t.Fatalf("create export record: %v", err)
	}
	if _, err := service.PatchExportRecord(ctx, 1, fmt.Sprint(record.ID), ExportRecordInput{
		DeliveryVersionID: version.ID,
		ResourceID:        &secondResource.ID,
		Status:            "done",
		Format:            "mp4",
	}); err != nil {
		t.Fatalf("patch export record: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeProduces,
		Source:    domainrelation.NewEntityRef("export_record", record.ID),
	})
	if err != nil {
		t.Fatalf("list export record edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondResource.ID {
		t.Fatalf("current export record edges = %+v, want only second resource", edges)
	}
}

func TestCanvasOutputPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_canvas_output_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.Canvas{},
		&persistencemodel.RawResource{},
		&persistencemodel.CanvasOutput{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	canvas := persistencemodel.Canvas{ProjectID: &project.ID, OwnerID: 1, Name: "Canvas"}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatalf("seed canvas: %v", err)
	}
	firstResource := persistencemodel.RawResource{Type: "image", Name: "First"}
	secondResource := persistencemodel.RawResource{Type: "image", Name: "Second"}
	if err := db.Create(&firstResource).Error; err != nil {
		t.Fatalf("seed first resource: %v", err)
	}
	if err := db.Create(&secondResource).Error; err != nil {
		t.Fatalf("seed second resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	output, err := service.CreateCanvasOutput(ctx, 1, CanvasOutputInput{
		CanvasID:    canvas.ID,
		PortID:      "result",
		OwnerType:   "canvas",
		OwnerID:     canvas.ID,
		OutputType:  "resource",
		ResourceID:  &firstResource.ID,
		TargetField: "cover",
		Status:      "attached",
	})
	if err != nil {
		t.Fatalf("create canvas output: %v", err)
	}
	if _, err := service.PatchCanvasOutput(ctx, 1, fmt.Sprint(output.ID), CanvasOutputInput{
		CanvasID:    canvas.ID,
		PortID:      "result",
		OwnerType:   "canvas",
		OwnerID:     canvas.ID,
		OutputType:  "resource",
		ResourceID:  &secondResource.ID,
		TargetField: "cover",
		Status:      "attached",
	}); err != nil {
		t.Fatalf("patch canvas output: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeProduces,
		Source:    domainrelation.NewEntityRef("canvas_output", output.ID),
	})
	if err != nil {
		t.Fatalf("list canvas output edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondResource.ID {
		t.Fatalf("current canvas output edges = %+v, want only second resource", edges)
	}
}
