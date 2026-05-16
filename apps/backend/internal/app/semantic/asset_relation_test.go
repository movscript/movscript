package semantic

import (
	"context"
	"fmt"
	"testing"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestAssetSlotPatchExpiresPreviousRelationIdentities(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.RawResource{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	ownerID := uint(1)
	slot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{
		OwnerType: "project",
		OwnerID:   &ownerID,
		Name:      "Poster",
		Kind:      "image",
		Status:    "missing",
	})
	if err != nil {
		t.Fatalf("create asset slot: %v", err)
	}

	firstResourceID := uint(42)
	if _, err := service.PatchAssetSlot(ctx, 1, fmt.Sprint(slot.ID), PatchAssetSlotInput{
		ResourceID: &firstResourceID,
		Status:     "locked",
	}); err != nil {
		t.Fatalf("patch first resource: %v", err)
	}
	secondResourceID := uint(43)
	if _, err := service.PatchAssetSlot(ctx, 1, fmt.Sprint(slot.ID), PatchAssetSlotInput{
		ResourceID: &secondResourceID,
		Status:     "locked",
	}); err != nil {
		t.Fatalf("patch second resource: %v", err)
	}

	ownerEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryAsset,
		Source:    domainrelation.NewEntityRef("project", 1),
		Target:    domainrelation.NewEntityRef("asset_slot", slot.ID),
	})
	if err != nil {
		t.Fatalf("list owner edges: %v", err)
	}
	if len(ownerEdges) != 1 || ownerEdges[0].Type != domainrelation.TypeUsesAsset {
		t.Fatalf("current owner edges = %+v, want one uses_asset edge", ownerEdges)
	}

	resourceEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeUsesResource,
		Source:    domainrelation.NewEntityRef("asset_slot", slot.ID),
	})
	if err != nil {
		t.Fatalf("list resource edges: %v", err)
	}
	if len(resourceEdges) != 1 || resourceEdges[0].Target.ID != secondResourceID {
		t.Fatalf("current resource edges = %+v, want only second resource", resourceEdges)
	}
}

func TestAssetSlotCandidatePatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Target", Kind: "image"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	firstCandidate, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate A", Kind: "image"})
	if err != nil {
		t.Fatalf("create first candidate slot: %v", err)
	}
	secondCandidate, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate B", Kind: "image"})
	if err != nil {
		t.Fatalf("create second candidate slot: %v", err)
	}
	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: firstCandidate.ID,
		Score:                0.5,
		Note:                 "first",
	}, 0)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}

	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: secondCandidate.ID,
		Score:                0.9,
		Note:                 "second",
	}); err != nil {
		t.Fatalf("patch candidate: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeCandidateFor,
		Target:    domainrelation.NewEntityRef("asset_slot", target.ID),
	})
	if err != nil {
		t.Fatalf("list candidate edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Source.ID != secondCandidate.ID {
		t.Fatalf("current candidate edges = %+v, want only second candidate slot", edges)
	}
}

func TestCandidateDecisionPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_candidate_decision_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Target", Kind: "image"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlotA, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate A", Kind: "image"})
	if err != nil {
		t.Fatalf("create first candidate slot: %v", err)
	}
	candidateSlotB, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate B", Kind: "image"})
	if err != nil {
		t.Fatalf("create second candidate slot: %v", err)
	}
	firstCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlotA.ID,
	}, 0)
	if err != nil {
		t.Fatalf("create first candidate: %v", err)
	}
	secondCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlotB.ID,
	}, 0)
	if err != nil {
		t.Fatalf("create second candidate: %v", err)
	}

	firstCandidateID := firstCandidate.ID
	targetID := target.ID
	decision, err := service.CreateCandidateDecision(ctx, 1, CandidateDecisionInput{
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   &firstCandidateID,
		TargetType:    "asset_slot",
		TargetID:      &targetID,
		Decision:      "accept",
		Status:        "recorded",
	})
	if err != nil {
		t.Fatalf("create decision: %v", err)
	}
	secondCandidateID := secondCandidate.ID
	if _, err := service.PatchCandidateDecision(ctx, 1, fmt.Sprint(decision.ID), CandidateDecisionInput{
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   &secondCandidateID,
		TargetType:    "asset_slot",
		TargetID:      &targetID,
		Decision:      "accept",
		Status:        "applied",
	}); err != nil {
		t.Fatalf("patch decision: %v", err)
	}

	decidesEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeDecides,
		Source:    domainrelation.NewEntityRef("candidate_decision", decision.ID),
	})
	if err != nil {
		t.Fatalf("list decides edges: %v", err)
	}
	if len(decidesEdges) != 1 || decidesEdges[0].Target.ID != secondCandidate.ID {
		t.Fatalf("current decides edges = %+v, want only second candidate", decidesEdges)
	}
}

func TestReviewEventPatchExpiresPreviousRelationIdentity(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_review_event_relation_patch.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.ReviewEvent{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	firstSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "First", Kind: "image"})
	if err != nil {
		t.Fatalf("create first slot: %v", err)
	}
	secondSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Second", Kind: "image"})
	if err != nil {
		t.Fatalf("create second slot: %v", err)
	}
	firstSlotID := firstSlot.ID
	event, err := service.CreateReviewEvent(ctx, 1, ReviewEventInput{
		SubjectType: "asset_slot",
		SubjectID:   &firstSlotID,
		EventType:   "status_change",
		ToStatus:    "candidate",
	})
	if err != nil {
		t.Fatalf("create review event: %v", err)
	}
	secondSlotID := secondSlot.ID
	if _, err := service.PatchReviewEvent(ctx, 1, fmt.Sprint(event.ID), ReviewEventInput{
		SubjectType: "asset_slot",
		SubjectID:   &secondSlotID,
		EventType:   "status_change",
		ToStatus:    "approved",
	}); err != nil {
		t.Fatalf("patch review event: %v", err)
	}

	edges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Source:    domainrelation.NewEntityRef("review_event", event.ID),
	})
	if err != nil {
		t.Fatalf("list review edges: %v", err)
	}
	if len(edges) != 1 || edges[0].Target.ID != secondSlot.ID {
		t.Fatalf("current review edges = %+v, want only second subject", edges)
	}
}
