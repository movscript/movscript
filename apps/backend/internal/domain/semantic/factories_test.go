package semantic

import "testing"

func TestNewSegmentAppliesDefaults(t *testing.T) {
	item := NewSegment(SegmentSpec{ProjectID: 1})
	if item.Kind != "emotional_function" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected segment defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 9
	roundTrip := SegmentFromModel(modelItem)
	if roundTrip.ID != 9 || roundTrip.Kind != "emotional_function" {
		t.Fatalf("unexpected segment round-trip: %+v", roundTrip)
	}
}

func TestNewProductionTextBlockAppliesDefaults(t *testing.T) {
	item := NewProductionTextBlock(ProductionTextBlockSpec{ProjectID: 1, ProductionID: 2})
	if item.Kind != "section" || item.SourceType != "manual" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected text block defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 8
	roundTrip := ProductionTextBlockFromModel(modelItem)
	if roundTrip.ID != 8 || roundTrip.Kind != "section" || roundTrip.SourceType != "manual" {
		t.Fatalf("unexpected text block round-trip: %+v", roundTrip)
	}
}

func TestNewContentUnitAppliesDefaults(t *testing.T) {
	item := NewContentUnit(ContentUnitSpec{ProjectID: 1})
	if item.Kind != "shot" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected content unit defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 10
	roundTrip := ContentUnitFromModel(modelItem)
	if roundTrip.ID != 10 || roundTrip.Kind != "shot" {
		t.Fatalf("unexpected content unit round-trip: %+v", roundTrip)
	}
}

func TestNewSceneMomentAppliesDefaultsAndMaps(t *testing.T) {
	item := NewSceneMoment(SceneMomentSpec{ProjectID: 1})
	if item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected scene moment defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 11
	roundTrip := SceneMomentFromModel(modelItem)
	if roundTrip.ID != 11 || roundTrip.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected scene moment round-trip: %+v", roundTrip)
	}
}

func TestNewPreviewTimelineItemAppliesDefaults(t *testing.T) {
	item := NewPreviewTimelineItem(PreviewTimelineItemSpec{ProjectID: 1, PreviewTimelineID: 2})
	if item.Kind != "keyframe" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected preview timeline item defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 12
	if roundTrip := PreviewTimelineItemFromModel(modelItem); roundTrip.ID != 12 || roundTrip.Kind != "keyframe" {
		t.Fatalf("unexpected preview timeline item round-trip: %+v", roundTrip)
	}
}

func TestNewAssetSlotAndCandidateApplyDefaults(t *testing.T) {
	slot := NewAssetSlot(AssetSlotSpec{ProjectID: 1})
	if slot.Kind != "image" || slot.Status != AssetSlotStatusMissing || slot.Priority != "normal" {
		t.Fatalf("unexpected asset slot defaults: %+v", slot)
	}

	candidate := NewAssetSlotCandidate(AssetSlotCandidateSpec{ProjectID: 1, AssetSlotID: 2, CandidateAssetSlotID: 3})
	if candidate.SourceType != CandidateDecisionSourceManual || candidate.Status != AssetSlotCandidateStatusCandidate {
		t.Fatalf("unexpected candidate defaults: %+v", candidate)
	}
}

func TestAssetSlotModelMappingRoundTrip(t *testing.T) {
	resourceID := uint(7)
	slot := NewAssetSlot(AssetSlotSpec{
		ProjectID:  1,
		OwnerType:  "scene_moment",
		Kind:       "video",
		ResourceID: &resourceID,
	})
	modelSlot := slot.ToModel()
	modelSlot.ID = 9
	roundTrip := AssetSlotFromModel(modelSlot)
	if roundTrip.ID != 9 || roundTrip.Kind != "video" || roundTrip.ResourceID == nil || *roundTrip.ResourceID != resourceID {
		t.Fatalf("unexpected asset slot round-trip: %+v", roundTrip)
	}
}

func TestAssetSlotCandidateModelMappingRoundTrip(t *testing.T) {
	sourceID := uint(11)
	candidate := NewAssetSlotCandidate(AssetSlotCandidateSpec{
		ProjectID:            1,
		AssetSlotID:          2,
		CandidateAssetSlotID: 3,
		SourceID:             &sourceID,
		Score:                0.8,
	})
	modelCandidate := candidate.ToModel()
	modelCandidate.ID = 12
	roundTrip := AssetSlotCandidateFromModel(modelCandidate)
	if roundTrip.ID != 12 || roundTrip.Score != 0.8 || roundTrip.SourceID == nil || *roundTrip.SourceID != sourceID {
		t.Fatalf("unexpected asset slot candidate round-trip: %+v", roundTrip)
	}
}

func TestNewDecisionReviewAndOutputsApplyDefaults(t *testing.T) {
	decision := NewCandidateDecision(CandidateDecisionSpec{ProjectID: 1})
	if decision.Status != "recorded" || decision.Source != CandidateDecisionSourceManual {
		t.Fatalf("unexpected decision defaults: %+v", decision)
	}
	modelDecision := decision.ToModel()
	modelDecision.ID = 13
	roundTripDecision := CandidateDecisionFromModel(modelDecision)
	if roundTripDecision.ID != 13 || roundTripDecision.Status != "recorded" || roundTripDecision.Source != CandidateDecisionSourceManual {
		t.Fatalf("unexpected decision round-trip: %+v", roundTripDecision)
	}

	event := NewReviewEvent(ReviewEventSpec{ProjectID: 1})
	if event.Source != ReviewEventSourceManual {
		t.Fatalf("unexpected review event defaults: %+v", event)
	}
	modelEvent := event.ToModel()
	modelEvent.ID = 14
	roundTripEvent := ReviewEventFromModel(modelEvent)
	if roundTripEvent.ID != 14 || roundTripEvent.Source != ReviewEventSourceManual {
		t.Fatalf("unexpected review event round-trip: %+v", roundTripEvent)
	}

	output := NewCanvasOutput(CanvasOutputSpec{ProjectID: 1})
	if output.OutputType != "resource" || output.Status != "pending" {
		t.Fatalf("unexpected canvas output defaults: %+v", output)
	}
	modelOutput := output.ToModel()
	modelOutput.ID = 15
	if roundTrip := CanvasOutputFromModel(modelOutput); roundTrip.ID != 15 || roundTrip.OutputType != "resource" {
		t.Fatalf("unexpected canvas output round-trip: %+v", roundTrip)
	}
}

func TestNewExportRecordAndWorkReviewApplyPendingDefault(t *testing.T) {
	exportRecord := NewExportRecord(ExportRecordSpec{ProjectID: 1})
	if exportRecord.Status != "pending" {
		t.Fatalf("unexpected export record defaults: %+v", exportRecord)
	}
	modelExportRecord := exportRecord.ToModel()
	modelExportRecord.ID = 16
	if roundTrip := ExportRecordFromModel(modelExportRecord); roundTrip.ID != 16 || roundTrip.Status != "pending" {
		t.Fatalf("unexpected export record round-trip: %+v", roundTrip)
	}

	review := NewWorkReview(WorkReviewSpec{ProjectID: 1, WorkItemID: 2})
	if review.Status != WorkItemApplyStatusPending {
		t.Fatalf("unexpected work review defaults: %+v", review)
	}
	modelReview := review.ToModel()
	modelReview.ID = 17
	if roundTrip := WorkReviewFromModel(modelReview); roundTrip.ID != 17 || roundTrip.Status != WorkItemApplyStatusPending {
		t.Fatalf("unexpected work review round-trip: %+v", roundTrip)
	}
}

func TestNewStoryboardFactoriesApplyDefaults(t *testing.T) {
	script := NewStoryboardScript(StoryboardScriptSpec{ProjectID: 1})
	if script.Name != "Storyboard Script" || script.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard script defaults: %+v", script)
	}
	modelScript := script.ToModel()
	modelScript.ID = 31
	if roundTrip := StoryboardScriptFromModel(modelScript); roundTrip.ID != 31 || roundTrip.Name != "Storyboard Script" {
		t.Fatalf("unexpected storyboard script round-trip: %+v", roundTrip)
	}

	version := NewStoryboardVersion(StoryboardVersionSpec{ProjectID: 1, VersionNumber: 3})
	if version.Title != "Storyboard v3" || version.Source != CandidateDecisionSourceManual || version.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard version defaults: %+v", version)
	}
	modelVersion := version.ToModel()
	modelVersion.ID = 32
	if roundTrip := StoryboardVersionFromModel(modelVersion); roundTrip.ID != 32 || roundTrip.Title != "Storyboard v3" {
		t.Fatalf("unexpected storyboard version round-trip: %+v", roundTrip)
	}

	line := NewStoryboardLine(StoryboardLineSpec{ProjectID: 1})
	if line.Kind != "beat" || line.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard line defaults: %+v", line)
	}
	modelLine := line.ToModel()
	modelLine.ID = 33
	if roundTrip := StoryboardLineFromModel(modelLine); roundTrip.ID != 33 || roundTrip.Kind != "beat" {
		t.Fatalf("unexpected storyboard line round-trip: %+v", roundTrip)
	}
}

func TestNewCreativeFactoriesApplyDefaults(t *testing.T) {
	ref := NewCreativeReference(CreativeReferenceSpec{ProjectID: 1})
	if ref.Kind != "character" || ref.Importance != "supporting" || ref.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative reference defaults: %+v", ref)
	}
	modelRef := ref.ToModel()
	modelRef.ID = 21
	if roundTrip := CreativeReferenceFromModel(modelRef); roundTrip.ID != 21 || roundTrip.Kind != "character" {
		t.Fatalf("unexpected creative reference round-trip: %+v", roundTrip)
	}

	state := NewCreativeReferenceState(CreativeReferenceStateSpec{ProjectID: 1})
	if state.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative state defaults: %+v", state)
	}
	modelState := state.ToModel()
	modelState.ID = 22
	if roundTrip := CreativeReferenceStateFromModel(modelState); roundTrip.ID != 22 || roundTrip.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative state round-trip: %+v", roundTrip)
	}

	usage := NewCreativeReferenceUsage(CreativeReferenceUsageSpec{ProjectID: 1})
	if usage.Source != CandidateDecisionSourceManual || usage.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative usage defaults: %+v", usage)
	}
	modelUsage := usage.ToModel()
	modelUsage.ID = 23
	if roundTrip := CreativeReferenceUsageFromModel(modelUsage); roundTrip.ID != 23 || roundTrip.Source != CandidateDecisionSourceManual {
		t.Fatalf("unexpected creative usage round-trip: %+v", roundTrip)
	}

	relationship := NewCreativeRelationship(CreativeRelationshipSpec{ProjectID: 1})
	if relationship.Category != "relationship" || relationship.Source != CandidateDecisionSourceManual || relationship.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative relationship defaults: %+v", relationship)
	}
	modelRelationship := relationship.ToModel()
	modelRelationship.ID = 24
	if roundTrip := CreativeRelationshipFromModel(modelRelationship); roundTrip.ID != 24 || roundTrip.Category != "relationship" {
		t.Fatalf("unexpected creative relationship round-trip: %+v", roundTrip)
	}
}

func TestNewProductionDeliveryAndScriptFactoriesApplyDefaults(t *testing.T) {
	production := NewProduction(ProductionSpec{ProjectID: 1})
	if production.Name != "未命名制作" || production.Status != "planning" || production.SourceType != "direct" || production.OwnerLabel != "导演组" {
		t.Fatalf("unexpected production defaults: %+v", production)
	}
	modelProduction := production.ToModel()
	modelProduction.ID = 41
	if roundTrip := ProductionFromModel(modelProduction); roundTrip.ID != 41 || roundTrip.Name != "未命名制作" {
		t.Fatalf("unexpected production round-trip: %+v", roundTrip)
	}

	keyframe := NewKeyframe(KeyframeSpec{ProjectID: 1})
	if keyframe.Status != "generated" {
		t.Fatalf("unexpected keyframe defaults: %+v", keyframe)
	}
	modelKeyframe := keyframe.ToModel()
	modelKeyframe.ID = 42
	if roundTrip := KeyframeFromModel(modelKeyframe); roundTrip.ID != 42 || roundTrip.Status != "generated" {
		t.Fatalf("unexpected keyframe round-trip: %+v", roundTrip)
	}

	timeline := NewPreviewTimeline(PreviewTimelineSpec{ProjectID: 1})
	if timeline.Name != "Preview" || timeline.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected preview timeline defaults: %+v", timeline)
	}
	modelTimeline := timeline.ToModel()
	modelTimeline.ID = 43
	if roundTrip := PreviewTimelineFromModel(modelTimeline); roundTrip.ID != 43 || roundTrip.Name != "Preview" {
		t.Fatalf("unexpected preview timeline round-trip: %+v", roundTrip)
	}

	delivery := NewDeliveryVersion(DeliveryVersionSpec{ProjectID: 1})
	if delivery.Name != "Delivery" || delivery.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected delivery version defaults: %+v", delivery)
	}
	modelDelivery := delivery.ToModel()
	modelDelivery.ID = 44
	if roundTrip := DeliveryVersionFromModel(modelDelivery); roundTrip.ID != 44 || roundTrip.Name != "Delivery" {
		t.Fatalf("unexpected delivery version round-trip: %+v", roundTrip)
	}

	item := NewDeliveryTimelineItem(DeliveryTimelineItemSpec{ProjectID: 1})
	if item.Kind != "video" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected delivery timeline item defaults: %+v", item)
	}
	modelItem := item.ToModel()
	modelItem.ID = 45
	if roundTrip := DeliveryTimelineItemFromModel(modelItem); roundTrip.ID != 45 || roundTrip.Kind != "video" {
		t.Fatalf("unexpected delivery timeline item round-trip: %+v", roundTrip)
	}

	version := NewScriptVersion(ScriptVersionSpec{
		ProjectID:         1,
		FallbackTitle:     "Draft",
		FallbackContent:   "content",
		FallbackRawSource: "raw source",
	})
	if version.Title != "Draft" || version.Content != "content" || version.RawSource != "raw source" || version.SourceType != "raw" || version.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected script version defaults: %+v", version)
	}
	modelVersion := version.ToModel()
	modelVersion.ID = 46
	if roundTrip := ScriptVersionFromModel(modelVersion); roundTrip.ID != 46 || roundTrip.Title != "Draft" {
		t.Fatalf("unexpected script version round-trip: %+v", roundTrip)
	}
}

func TestNewWorkDependencyAppliesDefaultType(t *testing.T) {
	dep := NewWorkDependency(WorkDependencySpec{ProjectID: 1, WorkItemID: 2, DependsOnWorkItemID: 3})
	if dep.DependencyType != "blocks" {
		t.Fatalf("unexpected dependency defaults: %+v", dep)
	}
	modelDep := dep.ToModel()
	modelDep.ID = 47
	if roundTrip := WorkDependencyFromModel(modelDep); roundTrip.ID != 47 || roundTrip.DependencyType != "blocks" {
		t.Fatalf("unexpected dependency round-trip: %+v", roundTrip)
	}
}
