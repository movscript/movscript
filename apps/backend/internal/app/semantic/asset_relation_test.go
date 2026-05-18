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

func TestPatchAssetSlotRejectsDirectResourceAdoption(t *testing.T) {
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

	directResourceID := uint(42)
	if _, err := service.PatchAssetSlot(ctx, 1, fmt.Sprint(slot.ID), PatchAssetSlotInput{
		ResourceID: &directResourceID,
		Status:     "locked",
	}); err == nil || err.Error() != "素材资源采纳必须通过候选锁定流程" {
		t.Fatalf("patch direct resource error = %v, want candidate-lock error", err)
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
	if len(ownerEdges) != 1 || ownerEdges[0].Type != domainrelation.TypeNeedsAsset {
		t.Fatalf("current owner edges = %+v, want one needs_asset edge", ownerEdges)
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
	if len(resourceEdges) != 0 {
		t.Fatalf("current resource edges = %+v, want no direct resource edge", resourceEdges)
	}
}

func TestCreateAssetSlotRejectsDirectResourceAdoption(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_relation_create_resource.db",
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

	resourceID := uint(42)
	_, err := NewService(db).CreateAssetSlot(context.Background(), 1, AssetSlotInput{
		Name:       "Poster",
		Kind:       "image",
		Status:     "locked",
		ResourceID: &resourceID,
	})
	if err == nil || err.Error() != "素材资源采纳必须通过候选锁定流程" {
		t.Fatalf("create direct resource error = %v, want candidate-lock error", err)
	}

	var count int64
	if err := db.Model(&persistencemodel.AssetSlot{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count asset slots: %v", err)
	}
	if count != 0 {
		t.Fatalf("asset slot count = %d, want 0", count)
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
	}, nil); err != nil {
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

func TestCreateAssetSlotCandidateWithResourceCreatesCandidateSlot(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_resource_create.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.EntityRelation{},
		&persistencemodel.CanvasEntityWriteAudit{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	resource := persistencemodel.RawResource{OwnerID: 1, Type: "image", Name: "generated.png", FilePath: "/tmp/generated.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "missing"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	jobID := uint(2001)
	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID: target.ID,
		ResourceID:  &resource.ID,
		SourceType:  "job",
		SourceID:    &jobID,
		Score:       0.8,
		Note:        "由 AI 助手生成任务 #2001 加入候选",
	}, 2)
	if err != nil {
		t.Fatalf("create candidate from resource: %v", err)
	}

	if candidate.AssetSlotID != target.ID {
		t.Fatalf("candidate target slot = %d, want %d", candidate.AssetSlotID, target.ID)
	}
	if candidate.CandidateAssetSlotID == 0 || candidate.CandidateAssetSlot == nil {
		t.Fatalf("candidate asset slot was not populated: %+v", candidate)
	}
	if candidate.CandidateAssetSlot.ResourceID == nil || *candidate.CandidateAssetSlot.ResourceID != resource.ID {
		t.Fatalf("candidate slot resource_id = %v, want %d", candidate.CandidateAssetSlot.ResourceID, resource.ID)
	}
	if candidate.CandidateAssetSlot.Resource == nil || candidate.CandidateAssetSlot.Resource.ID != resource.ID {
		t.Fatalf("candidate slot resource was not reloaded: %+v", candidate.CandidateAssetSlot.Resource)
	}
	if candidate.SourceType != "job" || candidate.SourceID == nil || *candidate.SourceID != jobID {
		t.Fatalf("candidate source = %q/%v, want job/%d", candidate.SourceType, candidate.SourceID, jobID)
	}

	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusCandidate {
		t.Fatalf("target slot status = %q, want candidate", reloadedTarget.Status)
	}
	var binding persistencemodel.ResourceBinding
	if err := db.First(&binding, "project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ? AND role = ? AND slot = ?",
		1, "asset_slot", candidate.CandidateAssetSlotID, resource.ID, "output", "candidate").Error; err != nil {
		t.Fatalf("resource binding was not created for candidate slot: %v", err)
	}
}

func TestCreateAssetSlotCandidateWithExistingSlotReturnsLoadedResource(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_existing_slot_resource.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.RawResource{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	resource := persistencemodel.RawResource{OwnerID: 1, Type: "image", Name: "existing-candidate.png", FilePath: "/tmp/existing-candidate.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "missing"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlot := persistencemodel.AssetSlot{
		ProjectID:  1,
		OwnerType:  "asset_slot",
		OwnerID:    &target.ID,
		Name:       "Candidate",
		Kind:       "image",
		Status:     domainsemantic.AssetSlotStatusCandidate,
		ResourceID: &resource.ID,
	}
	if err := db.Create(&candidateSlot).Error; err != nil {
		t.Fatalf("create candidate slot: %v", err)
	}

	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                0.7,
	}, 0)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}
	if candidate.CandidateAssetSlot == nil || candidate.CandidateAssetSlot.Resource == nil || candidate.CandidateAssetSlot.Resource.ID != resource.ID {
		t.Fatalf("created candidate slot resource = %+v, want resource #%d", candidate.CandidateAssetSlot, resource.ID)
	}

	reloaded, err := service.repo.LoadAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID))
	if err != nil {
		t.Fatalf("reload candidate: %v", err)
	}
	if reloaded.CandidateAssetSlot == nil || reloaded.CandidateAssetSlot.Resource == nil || reloaded.CandidateAssetSlot.Resource.ID != resource.ID {
		t.Fatalf("reloaded candidate slot resource = %+v, want resource #%d", reloaded.CandidateAssetSlot, resource.ID)
	}
}

func TestCreateAssetSlotCandidateRejectsZeroResourceID(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_zero_resource.db",
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
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "missing"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	zero := uint(0)
	_, err = service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID: target.ID,
		ResourceID:  &zero,
	}, 2)
	if err == nil {
		t.Fatalf("CreateAssetSlotCandidate() error = nil, want ErrInvalidInput")
	}
	invalid, ok := err.(ErrInvalidInput)
	if !ok {
		t.Fatalf("CreateAssetSlotCandidate() error = %T %[1]v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "asset slot candidate resource_id must be positive" {
		t.Fatalf("CreateAssetSlotCandidate() invalid error = %v, want resource_id positive error", invalid.Err)
	}
}

func TestPatchSelectedAssetSlotCandidateLocksTargetAndRejectsSiblings(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_selected_lock.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
		&persistencemodel.ReviewEvent{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.CanvasEntityWriteAudit{},
		&persistencemodel.EntityRelation{},
	)
	project := persistencemodel.Project{Name: "Project"}
	project.ID = 1
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	resource := persistencemodel.RawResource{OwnerID: 1, Type: "image", Name: "selected.png", FilePath: "/tmp/selected.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "candidate"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlotB, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate B", Kind: "image"})
	if err != nil {
		t.Fatalf("create second candidate slot: %v", err)
	}
	firstCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID: target.ID,
		ResourceID:  &resource.ID,
		Score:       0.8,
	}, 0)
	if err != nil {
		t.Fatalf("create first candidate: %v", err)
	}
	candidateSlotAID := firstCandidate.CandidateAssetSlotID
	if candidateSlotAID == 0 {
		t.Fatalf("first candidate missing candidate asset slot: %+v", firstCandidate)
	}
	secondCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlotB.ID,
		Score:                0.7,
	}, 0)
	if err != nil {
		t.Fatalf("create second candidate: %v", err)
	}

	actorID := uint(9)
	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(firstCandidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlotAID,
		Score:                firstCandidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusSelected,
	}, &actorID); err != nil {
		t.Fatalf("select candidate: %v", err)
	}

	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusLocked {
		t.Fatalf("target status = %q, want locked", reloadedTarget.Status)
	}
	if reloadedTarget.LockedAssetSlotID == nil || *reloadedTarget.LockedAssetSlotID != candidateSlotAID {
		t.Fatalf("locked_asset_slot_id = %v, want %d", reloadedTarget.LockedAssetSlotID, candidateSlotAID)
	}
	if reloadedTarget.ResourceID == nil || *reloadedTarget.ResourceID != resource.ID {
		t.Fatalf("target resource_id = %v, want %d", reloadedTarget.ResourceID, resource.ID)
	}
	reloadedFirst, err := service.repo.LoadAssetSlotCandidate(ctx, 1, fmt.Sprint(firstCandidate.ID))
	if err != nil {
		t.Fatalf("reload first candidate: %v", err)
	}
	if reloadedFirst.Status != domainsemantic.AssetSlotCandidateStatusSelected {
		t.Fatalf("first candidate status = %q, want selected", reloadedFirst.Status)
	}
	reloadedSecond, err := service.repo.LoadAssetSlotCandidate(ctx, 1, fmt.Sprint(secondCandidate.ID))
	if err != nil {
		t.Fatalf("reload second candidate: %v", err)
	}
	if reloadedSecond.Status != domainsemantic.AssetSlotCandidateStatusRejected {
		t.Fatalf("second candidate status = %q, want rejected", reloadedSecond.Status)
	}
	decisions, err := service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   firstCandidate.ID,
		Decision:      domainsemantic.CandidateDecisionAccept,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list candidate decisions: %v", err)
	}
	if len(decisions) != 1 || decisions[0].TargetID == nil || *decisions[0].TargetID != target.ID {
		t.Fatalf("selection decisions = %+v, want one applied decision for target", decisions)
	}
	if decisions[0].DecidedByID == nil || *decisions[0].DecidedByID != actorID {
		t.Fatalf("selection decision actor = %v, want %d", decisions[0].DecidedByID, actorID)
	}
	reviewEvents, err := service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeAssetSlot,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list review events: %v", err)
	}
	if len(reviewEvents) != 1 || reviewEvents[0].ToStatus != domainsemantic.WorkItemResultLockAssetCandidate || metadataAssetSlotCandidateID(reviewEvents[0].MetadataJSON) != firstCandidate.ID {
		t.Fatalf("selection review events = %+v, want one lock_asset_candidate event for selected candidate", reviewEvents)
	}
	if reviewEvents[0].ActorID == nil || *reviewEvents[0].ActorID != actorID {
		t.Fatalf("selection review event actor = %v, want %d", reviewEvents[0].ActorID, actorID)
	}
	reviewEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Source:    domainrelation.NewEntityRef("review_event", reviewEvents[0].ID),
	})
	if err != nil {
		t.Fatalf("list review event edges: %v", err)
	}
	if len(reviewEdges) != 1 || reviewEdges[0].Target.Type != domainsemantic.WorkItemTargetTypeAssetSlot || reviewEdges[0].Target.ID != target.ID {
		t.Fatalf("selection review event edges = %+v, want review edge to target asset slot", reviewEdges)
	}

	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(firstCandidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlotAID,
		Score:                firstCandidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusSelected,
	}, &actorID); err != nil {
		t.Fatalf("select candidate again: %v", err)
	}
	decisions, err = service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   firstCandidate.ID,
		Decision:      domainsemantic.CandidateDecisionAccept,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list candidate decisions after repeat: %v", err)
	}
	if len(decisions) != 1 {
		t.Fatalf("selection decisions after repeat = %+v, want idempotent single decision", decisions)
	}
	reviewEvents, err = service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeAssetSlot,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list review events after repeat: %v", err)
	}
	if len(reviewEvents) != 1 {
		t.Fatalf("selection review events after repeat = %+v, want idempotent single event", reviewEvents)
	}
}

func TestPatchSelectedAssetSlotCandidateRejectsMissingCandidateResource(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_selected_missing_resource.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.RawResource{},
		&persistencemodel.CandidateDecision{},
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
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "candidate"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate without resource", Kind: "image"})
	if err != nil {
		t.Fatalf("create candidate slot: %v", err)
	}
	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                0.8,
	}, 0)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}

	_, err = service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                candidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusSelected,
	}, nil)
	if err == nil {
		t.Fatalf("select candidate error = nil, want missing resource error")
	}
	invalid, ok := err.(ErrInvalidInput)
	if !ok || invalid.Err == nil || invalid.Err.Error() != "素材候选缺少资源" {
		t.Fatalf("select candidate error = %T %[1]v, want missing resource ErrInvalidInput", err)
	}
	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusCandidate || reloadedTarget.LockedAssetSlotID != nil || reloadedTarget.ResourceID != nil {
		t.Fatalf("target changed after failed selection: %+v", reloadedTarget)
	}
	reloadedCandidate, err := service.repo.LoadAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID))
	if err != nil {
		t.Fatalf("reload candidate: %v", err)
	}
	if reloadedCandidate.Status == domainsemantic.AssetSlotCandidateStatusSelected {
		t.Fatalf("candidate was selected despite missing resource: %+v", reloadedCandidate)
	}
}

func TestPatchSelectedAssetSlotCandidateRejectsUnknownCandidateResource(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_selected_unknown_resource.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.RawResource{},
		&persistencemodel.CandidateDecision{},
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
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "candidate"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	missingResourceID := uint(999)
	candidateSlot := persistencemodel.AssetSlot{
		ProjectID:  1,
		OwnerType:  "asset_slot",
		OwnerID:    &target.ID,
		Name:       "Candidate with stale resource",
		Kind:       "image",
		Status:     domainsemantic.AssetSlotStatusCandidate,
		ResourceID: &missingResourceID,
	}
	if err := db.Create(&candidateSlot).Error; err != nil {
		t.Fatalf("create candidate slot: %v", err)
	}
	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                0.8,
	}, 0)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}

	_, err = service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                candidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusSelected,
	}, nil)
	if err == nil {
		t.Fatalf("select candidate error = nil, want unknown resource error")
	}
	invalid, ok := err.(ErrInvalidInput)
	if !ok || invalid.Err == nil || invalid.Err.Error() != "素材候选资源不存在" {
		t.Fatalf("select candidate error = %T %[1]v, want unknown resource ErrInvalidInput", err)
	}
	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target slot: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusCandidate || reloadedTarget.LockedAssetSlotID != nil || reloadedTarget.ResourceID != nil {
		t.Fatalf("target changed after failed selection: %+v", reloadedTarget)
	}
}

func TestPatchRejectedAssetSlotCandidateRecordsDecision(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_rejected_decision.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
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
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "candidate"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	candidateSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate", Kind: "image"})
	if err != nil {
		t.Fatalf("create candidate slot: %v", err)
	}
	candidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                0.7,
		Note:                 "needs better framing",
	}, 0)
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}

	actorID := uint(11)
	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                candidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusRejected,
		Note:                 candidate.Note,
	}, &actorID); err != nil {
		t.Fatalf("reject candidate: %v", err)
	}

	decisions, err := service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   candidate.ID,
		Decision:      domainsemantic.CandidateDecisionReject,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list rejection decisions: %v", err)
	}
	if len(decisions) != 1 || decisions[0].TargetID == nil || *decisions[0].TargetID != target.ID {
		t.Fatalf("rejection decisions = %+v, want one applied decision for target", decisions)
	}
	if decisions[0].DecidedByID == nil || *decisions[0].DecidedByID != actorID {
		t.Fatalf("rejection decision actor = %v, want %d", decisions[0].DecidedByID, actorID)
	}
	if decisions[0].Note != candidate.Note || metadataAssetSlotCandidateID(decisions[0].MetadataJSON) != candidate.ID {
		t.Fatalf("rejection decision metadata/note = %+v", decisions[0])
	}
	decidesEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeDecides,
		Source:    domainrelation.NewEntityRef("candidate_decision", decisions[0].ID),
	})
	if err != nil {
		t.Fatalf("list rejection decision edges: %v", err)
	}
	if len(decidesEdges) != 1 || decidesEdges[0].Target.Type != "asset_slot_candidate" || decidesEdges[0].Target.ID != candidate.ID {
		t.Fatalf("rejection decision edges = %+v, want edge to rejected candidate", decidesEdges)
	}
	reviewEvents, err := service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeAssetSlot,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list rejection review events: %v", err)
	}
	if len(reviewEvents) != 1 || reviewEvents[0].ToStatus != domainsemantic.CandidateDecisionReject || metadataAssetSlotCandidateID(reviewEvents[0].MetadataJSON) != candidate.ID {
		t.Fatalf("rejection review events = %+v, want one reject event for rejected candidate", reviewEvents)
	}
	if reviewEvents[0].ActorID == nil || *reviewEvents[0].ActorID != actorID {
		t.Fatalf("rejection review event actor = %v, want %d", reviewEvents[0].ActorID, actorID)
	}
	reviewEdges, err := service.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: 1,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Source:    domainrelation.NewEntityRef("review_event", reviewEvents[0].ID),
	})
	if err != nil {
		t.Fatalf("list rejection review event edges: %v", err)
	}
	if len(reviewEdges) != 1 || reviewEdges[0].Target.Type != domainsemantic.WorkItemTargetTypeAssetSlot || reviewEdges[0].Target.ID != target.ID {
		t.Fatalf("rejection review event edges = %+v, want review edge to target asset slot", reviewEdges)
	}

	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(candidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		Score:                candidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusRejected,
		Note:                 candidate.Note,
	}, &actorID); err != nil {
		t.Fatalf("reject candidate again: %v", err)
	}
	decisions, err = service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   candidate.ID,
		Decision:      domainsemantic.CandidateDecisionReject,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list rejection decisions after repeat: %v", err)
	}
	if len(decisions) != 1 {
		t.Fatalf("rejection decisions after repeat = %+v, want idempotent single decision", decisions)
	}
	reviewEvents, err = service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeAssetSlot,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list rejection review events after repeat: %v", err)
	}
	if len(reviewEvents) != 1 {
		t.Fatalf("rejection review events after repeat = %+v, want idempotent single event", reviewEvents)
	}
	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target after candidate rejection: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusMissing {
		t.Fatalf("target status after last candidate rejection = %q, want missing", reloadedTarget.Status)
	}
}

func TestPatchRejectedAssetSlotCandidateKeepsTargetCandidateWhenActiveSiblingRemains(t *testing.T) {
	db := testutil.OpenSQLite(t,
		"semantic_asset_slot_candidate_rejected_sibling.db",
		&persistencemodel.Project{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
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
	target, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Poster", Kind: "image", Status: "candidate"})
	if err != nil {
		t.Fatalf("create target slot: %v", err)
	}
	firstSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate A", Kind: "image"})
	if err != nil {
		t.Fatalf("create first candidate slot: %v", err)
	}
	secondSlot, err := service.CreateAssetSlot(ctx, 1, AssetSlotInput{Name: "Candidate B", Kind: "image"})
	if err != nil {
		t.Fatalf("create second candidate slot: %v", err)
	}
	firstCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: firstSlot.ID,
		Score:                0.8,
	}, 0)
	if err != nil {
		t.Fatalf("create first candidate: %v", err)
	}
	secondCandidate, err := service.CreateAssetSlotCandidate(ctx, 1, AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: secondSlot.ID,
		Score:                0.7,
	}, 0)
	if err != nil {
		t.Fatalf("create second candidate: %v", err)
	}

	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(firstCandidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: firstSlot.ID,
		Score:                firstCandidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusRejected,
	}, nil); err != nil {
		t.Fatalf("reject first candidate: %v", err)
	}
	reloadedTarget, err := service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target with sibling: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusCandidate {
		t.Fatalf("target status with active sibling = %q, want candidate", reloadedTarget.Status)
	}

	if _, err := service.PatchAssetSlotCandidate(ctx, 1, fmt.Sprint(secondCandidate.ID), AssetSlotCandidateInput{
		AssetSlotID:          target.ID,
		CandidateAssetSlotID: secondSlot.ID,
		Score:                secondCandidate.Score,
		Status:               domainsemantic.AssetSlotCandidateStatusRejected,
	}, nil); err != nil {
		t.Fatalf("reject second candidate: %v", err)
	}
	reloadedTarget, err = service.repo.LoadAssetSlot(ctx, 1, fmt.Sprint(target.ID))
	if err != nil {
		t.Fatalf("reload target after all rejected: %v", err)
	}
	if reloadedTarget.Status != domainsemantic.AssetSlotStatusMissing {
		t.Fatalf("target status after all candidates rejected = %q, want missing", reloadedTarget.Status)
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
