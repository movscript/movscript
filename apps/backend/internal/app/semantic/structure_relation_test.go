package semantic

import (
	"context"
	"fmt"
	"testing"

	"github.com/movscript/movscript/internal/app/coregraph"
	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestSegmentPatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_segment_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ScriptBlock{},
		&persistencemodel.Segment{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstBlock := persistencemodel.ScriptBlock{ProjectID: 1, ScriptID: 1, ScriptVersionID: 1, Kind: "action", Content: "First", Status: "active"}
	secondBlock := persistencemodel.ScriptBlock{ProjectID: 1, ScriptID: 1, ScriptVersionID: 1, Kind: "action", Content: "Second", Status: "active"}
	if err := db.Create(&firstBlock).Error; err != nil {
		t.Fatalf("seed first script block: %v", err)
	}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("seed second script block: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	segment, err := service.CreateSegment(ctx, 1, CreateSegmentInput{
		ScriptBlockID: &firstBlock.ID,
		Title:         "Segment",
		Status:        "draft",
	})
	if err != nil {
		t.Fatalf("create segment: %v", err)
	}
	if _, err := service.PatchSegment(ctx, 1, fmt.Sprint(segment.ID), PatchSegmentInput{
		ScriptBlockID: &secondBlock.ID,
		Title:         "Segment",
		Status:        "draft",
	}); err != nil {
		t.Fatalf("patch segment: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("segment", segment.ID),
	})
	if err != nil {
		t.Fatalf("list segment edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondBlock.ID {
		t.Fatalf("current segment based_on edges = %+v, want only second script block", edges)
	}
}

func TestProductionPatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_production_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ScriptVersion{},
		&persistencemodel.Production{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstVersion := persistencemodel.ScriptVersion{ProjectID: 1, ScriptID: 1, VersionNumber: 1, Title: "First", Status: "active"}
	secondVersion := persistencemodel.ScriptVersion{ProjectID: 1, ScriptID: 1, VersionNumber: 2, Title: "Second", Status: "active"}
	if err := db.Create(&firstVersion).Error; err != nil {
		t.Fatalf("seed first version: %v", err)
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("seed second version: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	production, err := service.CreateProduction(ctx, 1, ProductionInput{
		ScriptVersionID: &firstVersion.ID,
		Name:            "Production",
		Status:          "draft",
	})
	if err != nil {
		t.Fatalf("create production: %v", err)
	}
	if _, err := service.PatchProduction(ctx, 1, fmt.Sprint(production.ID), ProductionInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Production",
		Status:          "draft",
	}); err != nil {
		t.Fatalf("patch production: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("production", production.ID),
	})
	if err != nil {
		t.Fatalf("list production edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondVersion.ID {
		t.Fatalf("current production derived_from edges = %+v, want only second version", edges)
	}
}

func TestContentUnitPatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_content_unit_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ScriptBlock{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstBlock := persistencemodel.ScriptBlock{ProjectID: 1, ScriptID: 1, ScriptVersionID: 1, Kind: "action", Content: "First", Status: "active"}
	secondBlock := persistencemodel.ScriptBlock{ProjectID: 1, ScriptID: 1, ScriptVersionID: 1, Kind: "action", Content: "Second", Status: "active"}
	if err := db.Create(&firstBlock).Error; err != nil {
		t.Fatalf("seed first script block: %v", err)
	}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("seed second script block: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	unit, err := service.CreateContentUnit(ctx, 1, ContentUnitInput{
		ScriptBlockID: &firstBlock.ID,
		Title:         "Unit",
		Status:        "draft",
	})
	if err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if _, err := service.PatchContentUnit(ctx, 1, fmt.Sprint(unit.ID), ContentUnitInput{
		ScriptBlockID: &secondBlock.ID,
		Title:         "Unit",
		Status:        "draft",
	}); err != nil {
		t.Fatalf("patch content unit: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("content_unit", unit.ID),
	})
	if err != nil {
		t.Fatalf("list content unit edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondBlock.ID {
		t.Fatalf("current content unit based_on edges = %+v, want only second script block", edges)
	}
}

func TestKeyframePatchExpiresPreviousStructureAndAssetRelationIdentities(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_keyframe_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.Keyframe{},
		&persistencemodel.RawResource{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstUnit := persistencemodel.ContentUnit{ProjectID: 1, Title: "First", Status: "draft"}
	secondUnit := persistencemodel.ContentUnit{ProjectID: 1, Title: "Second", Status: "draft"}
	if err := db.Create(&firstUnit).Error; err != nil {
		t.Fatalf("seed first content unit: %v", err)
	}
	if err := db.Create(&secondUnit).Error; err != nil {
		t.Fatalf("seed second content unit: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	firstResourceID := uint(101)
	keyframeModel := persistencemodel.Keyframe{
		ProjectID:     1,
		ContentUnitID: &firstUnit.ID,
		ResourceID:    &firstResourceID,
		Title:         "Keyframe",
		Status:        "draft",
	}
	if err := db.Create(&keyframeModel).Error; err != nil {
		t.Fatalf("create keyframe: %v", err)
	}
	keyframe := domainsemantic.KeyframeFromModel(keyframeModel)
	if err := service.upsertKeyframeRelations(ctx, keyframe); err != nil {
		t.Fatalf("sync keyframe relations: %v", err)
	}
	secondResourceID := uint(102)
	if _, err := service.PatchKeyframe(ctx, 1, fmt.Sprint(keyframe.ID), KeyframeInput{
		ContentUnitID: &secondUnit.ID,
		Title:         "Keyframe",
		Status:        "draft",
	}); err != nil {
		t.Fatalf("patch keyframe: %v", err)
	}
	if _, err := service.PatchKeyframe(ctx, 1, fmt.Sprint(keyframe.ID), KeyframeInput{
		ResourceID: &secondResourceID,
		Status:     "draft",
	}); err == nil || err.Error() != "关键帧资源采纳必须通过候选采纳流程" {
		t.Fatalf("patch direct keyframe resource error = %v, want candidate-accept error", err)
	}

	structureEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Target:    domainrelation.NewEntityRef("keyframe", keyframe.ID),
	})
	if err != nil {
		t.Fatalf("list structure edges: %v", err)
	}
	if len(structureEdges) != 1 || structureEdges[0].Source.ID != secondUnit.ID {
		t.Fatalf("current keyframe structure edges = %+v, want only second content unit", structureEdges)
	}

	resourceEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeUsesResource,
		Source:    domainrelation.NewEntityRef("keyframe", keyframe.ID),
	})
	if err != nil {
		t.Fatalf("list resource edges: %v", err)
	}
	if len(resourceEdges) != 1 || resourceEdges[0].Target.ID != firstResourceID {
		t.Fatalf("current keyframe resource edges = %+v, want original resource", resourceEdges)
	}
}

func TestGeneratedKeyframeCandidateDoesNotCreateOfficialStructureRelations(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_generated_keyframe_candidate_relations.db",
		&persistencemodel.Project{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.Keyframe{},
		&persistencemodel.RawResource{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	unit := persistencemodel.ContentUnit{ProjectID: 1, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("seed content unit: %v", err)
	}
	resource := persistencemodel.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ContentUnitID: &unit.ID,
		Title:         "Official keyframe",
		Status:        "draft",
	})
	if err != nil {
		t.Fatalf("create official keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ContentUnitID: &unit.ID,
		ResourceID:    &resource.ID,
		Title:         "Generated candidate",
		Status:        "candidate",
		MetadataJSON:  `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + fmt.Sprint(target.ID) + `}`,
	})
	if err != nil {
		t.Fatalf("create generated candidate: %v", err)
	}
	if err := service.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: 1,
		Source:    domainrelation.NewEntityRef("content_unit", unit.ID),
		Target:    domainrelation.NewEntityRef("keyframe", candidate.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Status:    "candidate",
	}); err != nil {
		t.Fatalf("seed stale candidate structure edge: %v", err)
	}
	if _, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ContentUnitID: &unit.ID,
		ResourceID:    &resource.ID,
		Title:         "Generated candidate",
		Status:        "candidate",
		MetadataJSON:  `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + fmt.Sprint(target.ID) + `}`,
	}); err != nil {
		t.Fatalf("reattach generated candidate: %v", err)
	}
	if err := service.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: 1,
		Source:    domainrelation.NewEntityRef("content_unit", unit.ID),
		Target:    domainrelation.NewEntityRef("keyframe", candidate.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Status:    "candidate",
	}); err != nil {
		t.Fatalf("seed stale candidate structure edge before coregraph rewrite: %v", err)
	}
	var candidateModel persistencemodel.Keyframe
	if err := db.First(&candidateModel, candidate.ID).Error; err != nil {
		t.Fatalf("load candidate model: %v", err)
	}
	if err := coregraph.NewWriter(db).Write(ctx, &candidateModel); err != nil {
		t.Fatalf("rewrite candidate graph: %v", err)
	}

	structureEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Target:    domainrelation.NewEntityRef("keyframe", candidate.ID),
	})
	if err != nil {
		t.Fatalf("list candidate structure edges: %v", err)
	}
	if len(structureEdges) != 0 {
		t.Fatalf("candidate structure edges = %+v, want none", structureEdges)
	}
	resourceEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeUsesResource,
		Source:    domainrelation.NewEntityRef("keyframe", candidate.ID),
	})
	if err != nil {
		t.Fatalf("list candidate resource edges: %v", err)
	}
	if len(resourceEdges) != 1 || resourceEdges[0].Target.ID != resource.ID {
		t.Fatalf("candidate resource edges = %+v, want generated resource", resourceEdges)
	}
	candidateEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeCandidateFor,
		Source:    domainrelation.NewEntityRef("keyframe", candidate.ID),
	})
	if err != nil {
		t.Fatalf("list candidate_for edges: %v", err)
	}
	if len(candidateEdges) != 1 || candidateEdges[0].Target.Type != "keyframe" || candidateEdges[0].Target.ID != target.ID {
		t.Fatalf("candidate_for edges = %+v, want candidate linked to target keyframe", candidateEdges)
	}
}

func TestPreviewTimelinePatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_preview_timeline_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.Production{},
		&persistencemodel.PreviewTimeline{},
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
	timeline, err := service.CreatePreviewTimeline(ctx, 1, PreviewTimelineInput{
		ProductionID: &firstProduction.ID,
		Name:         "Preview",
		Status:       "draft",
	})
	if err != nil {
		t.Fatalf("create preview timeline: %v", err)
	}
	if _, err := service.PatchPreviewTimeline(ctx, 1, fmt.Sprint(timeline.ID), PreviewTimelineInput{
		ProductionID: &secondProduction.ID,
		Name:         "Preview",
		Status:       "draft",
	}); err != nil {
		t.Fatalf("patch preview timeline: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("preview_timeline", timeline.ID),
	})
	if err != nil {
		t.Fatalf("list preview timeline edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondProduction.ID {
		t.Fatalf("current preview timeline edges = %+v, want only second production", edges)
	}
}

func TestPreviewTimelineItemPatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_preview_timeline_item_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.PreviewTimeline{},
		&persistencemodel.PreviewTimelineItem{},
		&persistencemodel.Keyframe{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstKeyframe := persistencemodel.Keyframe{ProjectID: 1, Title: "First", Status: "draft"}
	secondKeyframe := persistencemodel.Keyframe{ProjectID: 1, Title: "Second", Status: "draft"}
	if err := db.Create(&firstKeyframe).Error; err != nil {
		t.Fatalf("seed first keyframe: %v", err)
	}
	if err := db.Create(&secondKeyframe).Error; err != nil {
		t.Fatalf("seed second keyframe: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	timeline, err := service.CreatePreviewTimeline(ctx, 1, PreviewTimelineInput{Name: "Preview", Status: "draft"})
	if err != nil {
		t.Fatalf("create preview timeline: %v", err)
	}
	item, err := service.CreatePreviewTimelineItem(ctx, 1, timeline.ID, PreviewTimelineItemInput{
		KeyframeID: &firstKeyframe.ID,
		Kind:       "keyframe",
		Status:     "draft",
	})
	if err != nil {
		t.Fatalf("create preview timeline item: %v", err)
	}
	if _, err := service.PatchPreviewTimelineItem(ctx, 1, fmt.Sprint(item.ID), timeline.ID, PreviewTimelineItemInput{
		KeyframeID: &secondKeyframe.ID,
		Kind:       "keyframe",
		Status:     "draft",
	}); err != nil {
		t.Fatalf("patch preview timeline item: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeUses,
		Source:    domainrelation.NewEntityRef("preview_timeline_item", item.ID),
	})
	if err != nil {
		t.Fatalf("list preview timeline item edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondKeyframe.ID {
		t.Fatalf("current preview timeline item edges = %+v, want only second keyframe", edges)
	}
}

func TestStoryboardScriptPatchExpiresPreviousStructureRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_storyboard_script_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.ScriptVersion{},
		&persistencemodel.StoryboardScript{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	firstVersion := persistencemodel.ScriptVersion{ProjectID: 1, ScriptID: 1, VersionNumber: 1, Title: "First", Status: "active"}
	secondVersion := persistencemodel.ScriptVersion{ProjectID: 1, ScriptID: 1, VersionNumber: 2, Title: "Second", Status: "active"}
	if err := db.Create(&firstVersion).Error; err != nil {
		t.Fatalf("seed first version: %v", err)
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("seed second version: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	storyboard, err := service.CreateStoryboardScript(ctx, 1, StoryboardScriptInput{
		ScriptVersionID: &firstVersion.ID,
		Name:            "Storyboard",
		Status:          "draft",
	})
	if err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	if _, err := service.PatchStoryboardScript(ctx, 1, fmt.Sprint(storyboard.ID), StoryboardScriptInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Storyboard",
		Status:          "draft",
	}); err != nil {
		t.Fatalf("patch storyboard script: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("storyboard_script", storyboard.ID),
	})
	if err != nil {
		t.Fatalf("list storyboard script edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondVersion.ID {
		t.Fatalf("current storyboard script edges = %+v, want only second script version", edges)
	}
}

func TestStoryboardVersionCreateWritesStructureRelations(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_storyboard_version_relation_create.db",
		&persistencemodel.Project{},
		&persistencemodel.StoryboardScript{},
		&persistencemodel.StoryboardVersion{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	storyboard, err := service.CreateStoryboardScript(ctx, 1, StoryboardScriptInput{Name: "Storyboard", Status: "draft"})
	if err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	firstVersion, err := service.CreateStoryboardVersion(ctx, 1, StoryboardVersionInput{
		StoryboardScriptID: storyboard.ID,
		Title:              "First",
		Status:             "draft",
	})
	if err != nil {
		t.Fatalf("create first storyboard version: %v", err)
	}
	secondVersion, err := service.CreateStoryboardVersion(ctx, 1, StoryboardVersionInput{
		StoryboardScriptID: storyboard.ID,
		ParentVersionID:    &firstVersion.ID,
		Title:              "Second",
		Status:             "draft",
	})
	if err != nil {
		t.Fatalf("create second storyboard version: %v", err)
	}

	hasVersion, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasVersion,
		Target:    domainrelation.NewEntityRef("storyboard_version", secondVersion.ID),
	})
	if err != nil {
		t.Fatalf("list storyboard has_version edges: %v", err)
	}
	if len(hasVersion) != 1 || hasVersion[0].Source.ID != storyboard.ID {
		t.Fatalf("storyboard has_version edges = %+v, want storyboard script source", hasVersion)
	}

	derivedFrom, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("storyboard_version", secondVersion.ID),
	})
	if err != nil {
		t.Fatalf("list storyboard derived_from edges: %v", err)
	}
	if len(derivedFrom) != 1 || derivedFrom[0].Target.ID != firstVersion.ID {
		t.Fatalf("storyboard derived_from edges = %+v, want first version target", derivedFrom)
	}
}
