package semantic

import "testing"

func TestNewSegmentAppliesDefaults(t *testing.T) {
	item := NewSegment(SegmentSpec{ProjectID: 1})
	if item.Kind != "section" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected segment defaults: %+v", item)
	}
}

func TestNewProductionTextBlockAppliesDefaults(t *testing.T) {
	item := NewProductionTextBlock(ProductionTextBlockSpec{ProjectID: 1, ProductionID: 2})
	if item.Kind != "section" || item.SourceType != "manual" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected text block defaults: %+v", item)
	}
}

func TestNewContentUnitAppliesDefaults(t *testing.T) {
	item := NewContentUnit(ContentUnitSpec{ProjectID: 1})
	if item.Kind != "shot" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected content unit defaults: %+v", item)
	}
}

func TestNewPreviewTimelineItemAppliesDefaults(t *testing.T) {
	item := NewPreviewTimelineItem(PreviewTimelineItemSpec{ProjectID: 1, PreviewTimelineID: 2})
	if item.Kind != "keyframe" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected preview timeline item defaults: %+v", item)
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

func TestNewDecisionReviewAndOutputsApplyDefaults(t *testing.T) {
	decision := NewCandidateDecision(CandidateDecisionSpec{ProjectID: 1})
	if decision.Status != "recorded" || decision.Source != CandidateDecisionSourceManual {
		t.Fatalf("unexpected decision defaults: %+v", decision)
	}

	event := NewReviewEvent(ReviewEventSpec{ProjectID: 1})
	if event.Source != ReviewEventSourceManual {
		t.Fatalf("unexpected review event defaults: %+v", event)
	}

	output := NewCanvasOutput(CanvasOutputSpec{ProjectID: 1})
	if output.OutputType != "resource" || output.Status != "pending" {
		t.Fatalf("unexpected canvas output defaults: %+v", output)
	}
}

func TestNewExportRecordAndWorkReviewApplyPendingDefault(t *testing.T) {
	exportRecord := NewExportRecord(ExportRecordSpec{ProjectID: 1})
	if exportRecord.Status != "pending" {
		t.Fatalf("unexpected export record defaults: %+v", exportRecord)
	}

	review := NewWorkReview(WorkReviewSpec{ProjectID: 1, WorkItemID: 2})
	if review.Status != WorkItemApplyStatusPending {
		t.Fatalf("unexpected work review defaults: %+v", review)
	}
}

func TestNewStoryboardFactoriesApplyDefaults(t *testing.T) {
	script := NewStoryboardScript(StoryboardScriptSpec{ProjectID: 1})
	if script.Name != "Storyboard Script" || script.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard script defaults: %+v", script)
	}

	version := NewStoryboardVersion(StoryboardVersionSpec{ProjectID: 1, VersionNumber: 3})
	if version.Title != "Storyboard v3" || version.Source != CandidateDecisionSourceManual || version.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard version defaults: %+v", version)
	}

	line := NewStoryboardLine(StoryboardLineSpec{ProjectID: 1})
	if line.Kind != "beat" || line.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected storyboard line defaults: %+v", line)
	}
}

func TestNewCreativeFactoriesApplyDefaults(t *testing.T) {
	ref := NewCreativeReference(CreativeReferenceSpec{ProjectID: 1})
	if ref.Kind != "character" || ref.Importance != "supporting" || ref.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative reference defaults: %+v", ref)
	}

	state := NewCreativeReferenceState(CreativeReferenceStateSpec{ProjectID: 1})
	if state.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative state defaults: %+v", state)
	}

	usage := NewCreativeReferenceUsage(CreativeReferenceUsageSpec{ProjectID: 1})
	if usage.Source != CandidateDecisionSourceManual || usage.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative usage defaults: %+v", usage)
	}

	relationship := NewCreativeRelationship(CreativeRelationshipSpec{ProjectID: 1})
	if relationship.Category != "relationship" || relationship.Source != CandidateDecisionSourceManual || relationship.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected creative relationship defaults: %+v", relationship)
	}
}

func TestNewProductionDeliveryAndScriptFactoriesApplyDefaults(t *testing.T) {
	production := NewProduction(ProductionSpec{ProjectID: 1})
	if production.Name != "未命名制作" || production.Status != "planning" || production.SourceType != "direct" || production.OwnerLabel != "导演组" {
		t.Fatalf("unexpected production defaults: %+v", production)
	}

	keyframe := NewKeyframe(KeyframeSpec{ProjectID: 1})
	if keyframe.Status != "generated" {
		t.Fatalf("unexpected keyframe defaults: %+v", keyframe)
	}

	timeline := NewPreviewTimeline(PreviewTimelineSpec{ProjectID: 1})
	if timeline.Name != "Preview" || timeline.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected preview timeline defaults: %+v", timeline)
	}

	delivery := NewDeliveryVersion(DeliveryVersionSpec{ProjectID: 1})
	if delivery.Name != "Delivery" || delivery.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected delivery version defaults: %+v", delivery)
	}

	item := NewDeliveryTimelineItem(DeliveryTimelineItemSpec{ProjectID: 1})
	if item.Kind != "video" || item.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected delivery timeline item defaults: %+v", item)
	}

	version := NewScriptVersion(ScriptVersionSpec{ProjectID: 1})
	if version.SourceType != "raw" || version.Status != ProposalDraftStatusValue {
		t.Fatalf("unexpected script version defaults: %+v", version)
	}
}

func TestNewWorkDependencyAppliesDefaultType(t *testing.T) {
	dep := NewWorkDependency(WorkDependencySpec{ProjectID: 1, WorkItemID: 2, DependsOnWorkItemID: 3})
	if dep.DependencyType != "blocks" {
		t.Fatalf("unexpected dependency defaults: %+v", dep)
	}
}
