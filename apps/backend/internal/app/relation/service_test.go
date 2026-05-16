package relation

import (
	"context"
	"testing"

	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestUpsertEdgeCreatesZipperRevisions(t *testing.T) {
	db := testutil.OpenSQLite(t, "relation_upsert_zipper.db", &persistencemodel.EntityRelation{})
	service := NewService(db)
	ctx := context.Background()

	input := EdgeInput{
		ProjectID: 1,
		Source:    domainrelation.NewEntityRef("production", 10),
		Target:    domainrelation.NewEntityRef("content_unit", 20),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Label:     "draft",
		Order:     1,
	}
	first, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	if first.Revision != 1 || first.ValidFrom.IsZero() || first.ValidTo != nil {
		t.Fatalf("first edge validity = revision %d valid_from %v valid_to %v", first.Revision, first.ValidFrom, first.ValidTo)
	}

	input.Label = "confirmed"
	second, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if second.ID == first.ID {
		t.Fatalf("second upsert reused row id %d, want zipper revision row", second.ID)
	}
	if second.Revision != 2 || second.PreviousID == nil || *second.PreviousID != first.ID || second.ValidTo != nil {
		t.Fatalf("second edge = %+v, want revision 2 linked to first active edge", second)
	}

	current, err := service.ListEdges(ctx, EdgeFilter{ProjectID: 1, Source: input.Source})
	if err != nil {
		t.Fatalf("list current: %v", err)
	}
	if len(current) != 1 || current[0].ID != second.ID {
		t.Fatalf("current edges = %+v, want only second revision", current)
	}

	all, err := service.ListEdges(ctx, EdgeFilter{ProjectID: 1, Source: input.Source, AllVersions: true})
	if err != nil {
		t.Fatalf("list all versions: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("all versions count = %d, want 2: %+v", len(all), all)
	}
	if all[0].ValidTo == nil {
		t.Fatalf("first listed historical edge has nil valid_to: %+v", all[0])
	}
}

func TestUpsertEdgeReturnsActiveWhenRelationPayloadIsUnchanged(t *testing.T) {
	db := testutil.OpenSQLite(t, "relation_upsert_same_payload.db", &persistencemodel.EntityRelation{})
	service := NewService(db)
	ctx := context.Background()

	input := EdgeInput{
		ProjectID: 1,
		Source:    domainrelation.NewEntityRef("creative_reference", 10),
		Target:    domainrelation.NewEntityRef("creative_reference_state", 20),
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeHasState,
	}
	first, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	second, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if second.ID != first.ID || second.Revision != 1 {
		t.Fatalf("same payload upsert = %+v, want original edge %+v", second, first)
	}
}

func TestExpireEdgesClosesActiveRowsAndUpsertContinuesRevision(t *testing.T) {
	db := testutil.OpenSQLite(t, "relation_expire_edges.db", &persistencemodel.EntityRelation{})
	service := NewService(db)
	ctx := context.Background()

	input := EdgeInput{
		ProjectID: 1,
		Source:    domainrelation.NewEntityRef("scene_moment", 10),
		Target:    domainrelation.NewEntityRef("creative_reference", 20),
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
		Metadata:  `{"creative_reference_usage_id":7}`,
	}
	first, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := service.ExpireEdges(ctx, EdgeFilter{
		ProjectID:        1,
		Category:         domainrelation.CategoryCreative,
		MetadataContains: `"creative_reference_usage_id":7`,
	}); err != nil {
		t.Fatalf("expire: %v", err)
	}
	current, err := service.ListEdges(ctx, EdgeFilter{ProjectID: 1, Category: domainrelation.CategoryCreative})
	if err != nil {
		t.Fatalf("list current: %v", err)
	}
	if len(current) != 0 {
		t.Fatalf("current edges after expire = %+v, want none", current)
	}
	second, err := service.UpsertEdge(ctx, input)
	if err != nil {
		t.Fatalf("upsert after expire: %v", err)
	}
	if second.ID == first.ID || second.Revision != 2 || second.PreviousID == nil || *second.PreviousID != first.ID {
		t.Fatalf("second edge = %+v, want revision 2 linked to expired first %+v", second, first)
	}
}
