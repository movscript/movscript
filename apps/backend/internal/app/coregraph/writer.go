package coregraph

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type Writer struct {
	db        *gorm.DB
	relations *relationapp.Service
}

func NewWriter(db *gorm.DB) *Writer {
	return &Writer{db: db, relations: relationapp.NewService(db)}
}

func (w *Writer) Write(ctx context.Context, item any) error {
	switch v := item.(type) {
	case *persistencemodel.AssetSlot:
		return w.writeAssetSlot(ctx, w.loadAssetSlot(ctx, *v))
	case *persistencemodel.AssetSlotCandidate:
		return w.writeAssetSlotCandidate(ctx, w.loadAssetSlotCandidate(ctx, *v))
	case *persistencemodel.CandidateDecision:
		return w.writeCandidateDecision(ctx, *v)
	case *persistencemodel.ReviewEvent:
		return w.writeReviewEvent(ctx, *v)
	case *persistencemodel.ResourceBinding:
		return w.writeResourceBinding(ctx, w.loadResourceBinding(ctx, *v))
	case *persistencemodel.Production:
		return w.writeProduction(ctx, *v)
	case *persistencemodel.ProductionTextBlock:
		return w.writeProductionTextBlock(ctx, *v)
	case *persistencemodel.Segment:
		return w.writeSegment(ctx, w.loadSegment(ctx, *v))
	case *persistencemodel.SceneMoment:
		return w.writeSceneMoment(ctx, w.loadSceneMoment(ctx, *v))
	case *persistencemodel.ContentUnit:
		return w.writeContentUnit(ctx, w.loadContentUnit(ctx, *v))
	case *persistencemodel.ScriptBlock:
		return w.writeScriptBlock(ctx, *v)
	case *persistencemodel.CreativeReference:
		return w.writeCreativeReference(ctx, w.loadCreativeReference(ctx, *v))
	case *persistencemodel.CreativeReferenceState:
		return w.writeCreativeReferenceState(ctx, *v)
	case *persistencemodel.CreativeReferenceUsage:
		return w.writeCreativeReferenceUsage(ctx, *v)
	case *persistencemodel.CreativeRelationship:
		return w.writeCreativeRelationship(ctx, *v)
	case *persistencemodel.ScriptVersion:
		return w.writeScriptVersion(ctx, w.loadScriptVersion(ctx, *v))
	case *persistencemodel.StoryboardScript:
		return w.writeStoryboardScript(ctx, *v)
	case *persistencemodel.StoryboardVersion:
		return w.writeStoryboardVersion(ctx, *v)
	case *persistencemodel.Keyframe:
		return w.writeKeyframe(ctx, *v)
	case *persistencemodel.PreviewTimeline:
		return w.writePreviewTimeline(ctx, *v)
	case *persistencemodel.PreviewTimelineItem:
		return w.writePreviewTimelineItem(ctx, *v)
	case *persistencemodel.WorkItem:
		return w.writeWorkItem(ctx, *v)
	case *persistencemodel.WorkReview:
		return w.writeWorkReview(ctx, *v)
	case *persistencemodel.WorkDependency:
		return w.writeWorkDependency(ctx, *v)
	case *persistencemodel.DeliveryVersion:
		return w.writeDeliveryVersion(ctx, *v)
	case *persistencemodel.DeliveryTimelineItem:
		return w.writeDeliveryTimelineItem(ctx, *v)
	case *persistencemodel.ExportRecord:
		return w.writeExportRecord(ctx, *v)
	case *persistencemodel.Canvas:
		return w.writeCanvas(ctx, w.loadCanvas(ctx, *v))
	case *persistencemodel.CanvasRun:
		return w.writeCanvasRun(ctx, w.loadCanvasRun(ctx, *v))
	case *persistencemodel.CanvasOutput:
		return w.writeCanvasOutput(ctx, w.loadCanvasOutput(ctx, *v))
	default:
		return nil
	}
}

func (w *Writer) Expire(ctx context.Context, item any) error {
	for _, filter := range w.expireFilters(ctx, item) {
		if filter.ProjectID == 0 {
			continue
		}
		if err := w.expire(ctx, filter); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) expireFilters(ctx context.Context, item any) []relationapp.EdgeFilter {
	switch v := item.(type) {
	case *persistencemodel.ScriptVersion:
		return entityExpireFilters(v.ProjectID, "script_version", v.ID)
	case *persistencemodel.ScriptBlock:
		return entityExpireFilters(v.ProjectID, "script_block", v.ID)
	case *persistencemodel.Production:
		return entityExpireFilters(v.ProjectID, "production", v.ID)
	case *persistencemodel.ProductionTextBlock:
		return entityExpireFilters(v.ProjectID, "production_text_block", v.ID)
	case *persistencemodel.CreativeReference:
		return entityExpireFilters(v.ProjectID, "creative_reference", v.ID)
	case *persistencemodel.CreativeReferenceState:
		return entityExpireFilters(v.ProjectID, "creative_reference_state", v.ID)
	case *persistencemodel.CreativeReferenceUsage:
		return metadataExpireFilters(v.ProjectID, "creative_reference_usage_id", v.ID)
	case *persistencemodel.CreativeRelationship:
		return metadataExpireFilters(v.ProjectID, "creative_relationship_id", v.ID)
	case *persistencemodel.Segment:
		return entityExpireFilters(v.ProjectID, "segment", v.ID)
	case *persistencemodel.SceneMoment:
		return entityExpireFilters(v.ProjectID, "scene_moment", v.ID)
	case *persistencemodel.ContentUnit:
		return entityExpireFilters(v.ProjectID, "content_unit", v.ID)
	case *persistencemodel.AssetSlot:
		return entityExpireFilters(v.ProjectID, "asset_slot", v.ID)
	case *persistencemodel.StoryboardScript:
		return entityExpireFilters(v.ProjectID, "storyboard_script", v.ID)
	case *persistencemodel.StoryboardVersion:
		return entityExpireFilters(v.ProjectID, "storyboard_version", v.ID)
	case *persistencemodel.Keyframe:
		return entityExpireFilters(v.ProjectID, "keyframe", v.ID)
	case *persistencemodel.PreviewTimeline:
		return entityExpireFilters(v.ProjectID, "preview_timeline", v.ID)
	case *persistencemodel.PreviewTimelineItem:
		return entityExpireFilters(v.ProjectID, "preview_timeline_item", v.ID)
	case *persistencemodel.AssetSlotCandidate:
		return metadataExpireFilters(v.ProjectID, "asset_slot_candidate_id", v.ID)
	case *persistencemodel.CandidateDecision:
		return entityExpireFilters(v.ProjectID, "candidate_decision", v.ID)
	case *persistencemodel.ReviewEvent:
		return entityExpireFilters(v.ProjectID, "review_event", v.ID)
	case *persistencemodel.WorkItem:
		return entityExpireFilters(v.ProjectID, "work_item", v.ID)
	case *persistencemodel.WorkReview:
		return entityExpireFilters(v.ProjectID, "work_review", v.ID)
	case *persistencemodel.WorkDependency:
		return metadataExpireFilters(v.ProjectID, "work_dependency_id", v.ID)
	case *persistencemodel.DeliveryVersion:
		return entityExpireFilters(v.ProjectID, "delivery_version", v.ID)
	case *persistencemodel.DeliveryTimelineItem:
		return entityExpireFilters(v.ProjectID, "delivery_timeline_item", v.ID)
	case *persistencemodel.ExportRecord:
		return entityExpireFilters(v.ProjectID, "export_record", v.ID)
	case *persistencemodel.Canvas:
		if v.ProjectID == nil {
			return nil
		}
		return entityExpireFilters(*v.ProjectID, "canvas", v.ID)
	case *persistencemodel.CanvasRun:
		projectID := w.canvasProjectID(ctx, v.CanvasID)
		if projectID == 0 {
			return nil
		}
		return entityExpireFilters(projectID, "canvas_run", v.ID)
	case *persistencemodel.CanvasOutput:
		return entityExpireFilters(v.ProjectID, "canvas_output", v.ID)
	case *persistencemodel.ResourceBinding:
		return metadataExpireFilters(v.ProjectID, "resource_binding_id", v.ID)
	default:
		return nil
	}
}

func entityExpireFilters(projectID uint, entityType string, id uint) []relationapp.EdgeFilter {
	if projectID == 0 || entityType == "" || id == 0 {
		return nil
	}
	return []relationapp.EdgeFilter{
		{ProjectID: projectID, Source: ref(entityType, id)},
		{ProjectID: projectID, Target: ref(entityType, id)},
	}
}

func metadataExpireFilters(projectID uint, marker string, id uint) []relationapp.EdgeFilter {
	if projectID == 0 || marker == "" || id == 0 {
		return nil
	}
	return []relationapp.EdgeFilter{
		{ProjectID: projectID, MetadataContains: metadataMarker(marker, id)},
	}
}

func (w *Writer) canvasProjectID(ctx context.Context, canvasID uint) uint {
	if canvasID == 0 {
		return 0
	}
	var canvas persistencemodel.Canvas
	if err := w.db.WithContext(ctx).First(&canvas, canvasID).Error; err != nil || canvas.ProjectID == nil {
		return 0
	}
	return *canvas.ProjectID
}

func (w *Writer) loadAssetSlot(ctx context.Context, item persistencemodel.AssetSlot) persistencemodel.AssetSlot {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadAssetSlotCandidate(ctx context.Context, item persistencemodel.AssetSlotCandidate) persistencemodel.AssetSlotCandidate {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadResourceBinding(ctx context.Context, item persistencemodel.ResourceBinding) persistencemodel.ResourceBinding {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadSegment(ctx context.Context, item persistencemodel.Segment) persistencemodel.Segment {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadSceneMoment(ctx context.Context, item persistencemodel.SceneMoment) persistencemodel.SceneMoment {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadContentUnit(ctx context.Context, item persistencemodel.ContentUnit) persistencemodel.ContentUnit {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadCreativeReference(ctx context.Context, item persistencemodel.CreativeReference) persistencemodel.CreativeReference {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadScriptVersion(ctx context.Context, item persistencemodel.ScriptVersion) persistencemodel.ScriptVersion {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadCanvas(ctx context.Context, item persistencemodel.Canvas) persistencemodel.Canvas {
	if item.ProjectID != nil || item.ID == 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadCanvasRun(ctx context.Context, item persistencemodel.CanvasRun) persistencemodel.CanvasRun {
	if item.CanvasID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) loadCanvasOutput(ctx context.Context, item persistencemodel.CanvasOutput) persistencemodel.CanvasOutput {
	if item.ProjectID != 0 {
		return item
	}
	_ = w.db.WithContext(ctx).First(&item, item.ID).Error
	return item
}

func (w *Writer) expire(ctx context.Context, filter relationapp.EdgeFilter) error {
	return w.relations.ExpireEdges(ctx, filter)
}

func (w *Writer) upsert(ctx context.Context, input relationapp.EdgeInput) error {
	_, err := w.relations.UpsertEdge(ctx, input)
	return err
}

func (w *Writer) writeScriptBlock(ctx context.Context, item persistencemodel.ScriptBlock) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("script_block", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "script_version", item.ScriptVersionID, "script_block", item.ID, domainrelation.CategoryStructure, domainrelation.TypeContains, "", item.Status)
	input.Order = item.Order
	if err := w.upsert(ctx, input); err != nil {
		return err
	}
	if item.ParentBlockID != nil {
		parent := edge(item.ProjectID, "script_block", *item.ParentBlockID, "script_block", item.ID, domainrelation.CategoryStructure, domainrelation.TypeContains, "", item.Status)
		parent.Order = item.Order
		return w.upsert(ctx, parent)
	}
	return nil
}

func (w *Writer) writeProduction(ctx context.Context, item persistencemodel.Production) error {
	for _, edgeType := range []string{domainrelation.TypeDerivedFrom, domainrelation.TypeUsesPreview} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: edgeType, Source: ref("production", item.ID)}); err != nil {
			return err
		}
	}
	if item.ScriptVersionID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "production", item.ID, "script_version", *item.ScriptVersionID, domainrelation.CategoryStructure, domainrelation.TypeDerivedFrom, "", item.Status)); err != nil {
			return err
		}
	}
	if item.PreviewTimelineID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "production", item.ID, "preview_timeline", *item.PreviewTimelineID, domainrelation.CategoryStructure, domainrelation.TypeUsesPreview, "", item.Status))
	}
	return nil
}

func (w *Writer) writeProductionTextBlock(ctx context.Context, item persistencemodel.ProductionTextBlock) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("production_text_block", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "production", item.ProductionID, "production_text_block", item.ID, domainrelation.CategoryStructure, domainrelation.TypeContains, "", item.Status)
	input.Order = item.Order
	if err := w.upsert(ctx, input); err != nil {
		return err
	}
	if item.ParentBlockID != nil {
		parent := edge(item.ProjectID, "production_text_block", *item.ParentBlockID, "production_text_block", item.ID, domainrelation.CategoryStructure, domainrelation.TypeContains, "", item.Status)
		parent.Order = item.Order
		return w.upsert(ctx, parent)
	}
	return nil
}

func (w *Writer) writeAssetSlot(ctx context.Context, item persistencemodel.AssetSlot) error {
	for _, edgeType := range []string{domainrelation.TypeHasAsset, domainrelation.TypeNeedsAsset, domainrelation.TypeUsesAsset} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryAsset, Type: edgeType, Target: ref("asset_slot", item.ID)}); err != nil {
			return err
		}
	}
	for _, edgeType := range []string{domainrelation.TypeUsesResource, domainrelation.TypeLocks} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryAsset, Type: edgeType, Source: ref("asset_slot", item.ID)}); err != nil {
			return err
		}
	}
	if item.ProductionID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "production", *item.ProductionID, "asset_slot", item.ID, domainrelation.CategoryAsset, domainrelation.TypeNeedsAsset, item.SlotKey, item.Status)); err != nil {
			return err
		}
	}
	if item.CreativeReferenceID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "creative_reference", *item.CreativeReferenceID, "asset_slot", item.ID, domainrelation.CategoryAsset, domainrelation.TypeHasAsset, item.SlotKey, item.Status)); err != nil {
			return err
		}
	}
	if item.CreativeReferenceStateID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "creative_reference_state", *item.CreativeReferenceStateID, "asset_slot", item.ID, domainrelation.CategoryAsset, domainrelation.TypeHasAsset, item.SlotKey, item.Status)); err != nil {
			return err
		}
	}
	if item.OwnerID != nil && strings.TrimSpace(item.OwnerType) != "" {
		input := edge(item.ProjectID, item.OwnerType, *item.OwnerID, "asset_slot", item.ID, domainrelation.CategoryAsset, assetOwnerType(item), item.SlotKey, item.Status)
		input.Metadata = metadata(map[string]any{"asset_slot_id": item.ID, "status": item.Status, "kind": item.Kind})
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	if item.ResourceID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "asset_slot", item.ID, "raw_resource", *item.ResourceID, domainrelation.CategoryAsset, domainrelation.TypeUsesResource, "", item.Status)); err != nil {
			return err
		}
	}
	if item.LockedAssetSlotID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "asset_slot", item.ID, "asset_slot", *item.LockedAssetSlotID, domainrelation.CategoryAsset, domainrelation.TypeLocks, "", item.Status))
	}
	return nil
}

func (w *Writer) writeAssetSlotCandidate(ctx context.Context, item persistencemodel.AssetSlotCandidate) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, MetadataContains: metadataMarker("asset_slot_candidate_id", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "asset_slot", item.CandidateAssetSlotID, "asset_slot", item.AssetSlotID, domainrelation.CategoryAsset, domainrelation.TypeCandidateFor, "", item.Status)
	input.Weight = item.Score
	input.Origin = relationOrigin(item.SourceType)
	input.Evidence = item.Note
	input.Metadata = metadata(map[string]any{"asset_slot_candidate_id": item.ID, "source_id": item.SourceID})
	return w.upsert(ctx, input)
}

func (w *Writer) writeCandidateDecision(ctx context.Context, item persistencemodel.CandidateDecision) error {
	for _, edgeType := range []string{domainrelation.TypeDecides, domainrelation.TypeAppliesTo} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: edgeType, Source: ref("candidate_decision", item.ID)}); err != nil {
			return err
		}
	}
	if item.CandidateID != nil && strings.TrimSpace(item.CandidateType) != "" {
		input := edge(item.ProjectID, "candidate_decision", item.ID, item.CandidateType, *item.CandidateID, domainrelation.CategoryWorkflow, domainrelation.TypeDecides, item.Decision, item.Status)
		input.Origin = relationOrigin(item.Source)
		input.Evidence = item.Reason
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	if item.TargetID != nil && strings.TrimSpace(item.TargetType) != "" {
		input := edge(item.ProjectID, "candidate_decision", item.ID, item.TargetType, *item.TargetID, domainrelation.CategoryWorkflow, domainrelation.TypeAppliesTo, item.Decision, item.Status)
		input.Origin = relationOrigin(item.Source)
		input.Evidence = item.Note
		return w.upsert(ctx, input)
	}
	return nil
}

func (w *Writer) writeReviewEvent(ctx context.Context, item persistencemodel.ReviewEvent) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeReviews, Source: ref("review_event", item.ID)}); err != nil {
		return err
	}
	if item.SubjectID == nil || strings.TrimSpace(item.SubjectType) == "" {
		return nil
	}
	input := edge(item.ProjectID, "review_event", item.ID, item.SubjectType, *item.SubjectID, domainrelation.CategoryWorkflow, domainrelation.TypeReviews, item.EventType, item.ToStatus)
	input.Origin = relationOrigin(item.Source)
	input.Evidence = item.Comment
	input.Metadata = metadata(map[string]any{"from_status": item.FromStatus, "to_status": item.ToStatus, "reason": item.Reason})
	return w.upsert(ctx, input)
}

func (w *Writer) writeResourceBinding(ctx context.Context, item persistencemodel.ResourceBinding) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, MetadataContains: metadataMarker("resource_binding_id", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, item.OwnerType, item.OwnerID, "raw_resource", item.ResourceID, domainrelation.CategoryAsset, domainrelation.TypeUsesResource, item.Role, item.Status)
	input.Order = item.SortOrder
	input.Origin = relationOrigin(item.SourceType)
	input.Metadata = metadata(map[string]any{"resource_binding_id": item.ID, "role": item.Role, "slot": item.Slot, "version": item.Version})
	input.CreatedByID = item.CreatedByID
	return w.upsert(ctx, input)
}

func (w *Writer) writeSegment(ctx context.Context, item persistencemodel.Segment) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("segment", item.ID)}); err != nil {
		return err
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeBasedOn, Source: ref("segment", item.ID)}); err != nil {
		return err
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "production", item.ProductionID, "segment", item.ID, domainrelation.TypeContains, item.Order, item.Status),
		optionalEdge(item.ProjectID, "segment", item.ParentSegmentID, "segment", item.ID, domainrelation.TypeContains, item.Order, item.Status),
		optionalEdge(item.ProjectID, "segment", &item.ID, "script_block", ptrValue(item.ScriptBlockID), domainrelation.TypeBasedOn, item.Order, item.Status),
		optionalEdge(item.ProjectID, "segment", &item.ID, "production_text_block", ptrValue(item.TextBlockID), domainrelation.TypeBasedOn, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writeSceneMoment(ctx context.Context, item persistencemodel.SceneMoment) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("scene_moment", item.ID)}); err != nil {
		return err
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeBasedOn, Source: ref("scene_moment", item.ID)}); err != nil {
		return err
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "segment", item.SegmentID, "scene_moment", item.ID, domainrelation.TypeContains, item.Order, item.Status),
		optionalEdge(item.ProjectID, "scene_moment", &item.ID, "script_block", ptrValue(item.ScriptBlockID), domainrelation.TypeBasedOn, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writeContentUnit(ctx context.Context, item persistencemodel.ContentUnit) error {
	for _, filter := range []relationapp.EdgeFilter{
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("content_unit", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeBasedOn, Source: ref("content_unit", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeCompilesTo, Target: ref("content_unit", item.ID)},
	} {
		if err := w.expire(ctx, filter); err != nil {
			return err
		}
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "production", item.ProductionID, "content_unit", item.ID, domainrelation.TypeContains, item.Order, item.Status),
		optionalEdge(item.ProjectID, "segment", item.SegmentID, "content_unit", item.ID, domainrelation.TypeContains, item.Order, item.Status),
		optionalEdge(item.ProjectID, "content_unit", &item.ID, "scene_moment", ptrValue(item.SceneMomentID), domainrelation.TypeBasedOn, item.Order, item.Status),
		optionalEdge(item.ProjectID, "content_unit", &item.ID, "script_block", ptrValue(item.ScriptBlockID), domainrelation.TypeBasedOn, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writeCreativeReference(ctx context.Context, item persistencemodel.CreativeReference) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryCreative, Type: domainrelation.TypeOwns, Target: ref("creative_reference", item.ID)}); err != nil {
		return err
	}
	return w.upsert(ctx, edge(item.ProjectID, "project", item.ProjectID, "creative_reference", item.ID, domainrelation.CategoryCreative, domainrelation.TypeOwns, "", item.Status))
}

func (w *Writer) writeCreativeReferenceState(ctx context.Context, item persistencemodel.CreativeReferenceState) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryCreative, Type: domainrelation.TypeHasState, Target: ref("creative_reference_state", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "creative_reference", item.CreativeReferenceID, "creative_reference_state", item.ID, domainrelation.CategoryCreative, domainrelation.TypeHasState, "", item.Status)
	input.Scope = semanticScope(item.ScopeType, item.ScopeID)
	return w.upsert(ctx, input)
}

func (w *Writer) writeCreativeReferenceUsage(ctx context.Context, item persistencemodel.CreativeReferenceUsage) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, MetadataContains: metadataMarker("creative_reference_usage_id", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, item.OwnerType, item.OwnerID, "creative_reference", item.CreativeReferenceID, domainrelation.CategoryCreative, domainrelation.TypeUses, item.Role, item.Status)
	input.Order = item.Order
	input.Origin = relationOrigin(item.Source)
	input.Evidence = item.Evidence
	input.Metadata = metadata(map[string]any{"creative_reference_usage_id": item.ID, "role": item.Role, "creative_reference_state_id": item.CreativeReferenceStateID})
	return w.upsert(ctx, input)
}

func (w *Writer) writeCreativeRelationship(ctx context.Context, item persistencemodel.CreativeRelationship) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, MetadataContains: metadataMarker("creative_relationship_id", item.ID)}); err != nil {
		return err
	}
	relationType := strings.TrimSpace(item.Type)
	if relationType == "" {
		relationType = domainrelation.TypeRelatedTo
	}
	category := strings.TrimSpace(item.Category)
	if category == "" || category == "relationship" {
		category = domainrelation.CategoryCreative
	}
	input := edge(item.ProjectID, "creative_reference", item.SourceCreativeReferenceID, "creative_reference", item.TargetCreativeReferenceID, category, relationType, item.Label, item.Status)
	input.Scope = semanticScope(item.ScopeType, item.ScopeID)
	input.Origin = relationOrigin(item.Source)
	input.Evidence = item.Evidence
	input.Metadata = metadata(map[string]any{"creative_relationship_id": item.ID, "description": item.Description})
	return w.upsert(ctx, input)
}

func (w *Writer) writeScriptVersion(ctx context.Context, item persistencemodel.ScriptVersion) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Target: ref("script_version", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "script", item.ScriptID, "script_version", item.ID, domainrelation.CategoryStructure, domainrelation.TypeHasVersion, "", item.Status)
	input.Order = item.VersionNumber
	if err := w.upsert(ctx, input); err != nil {
		return err
	}
	if item.ParentVersionID != nil {
		parent := edge(item.ProjectID, "script_version", item.ID, "script_version", *item.ParentVersionID, domainrelation.CategoryStructure, domainrelation.TypeDerivedFrom, "", item.Status)
		parent.Order = item.VersionNumber
		return w.upsert(ctx, parent)
	}
	return nil
}

func (w *Writer) writeStoryboardScript(ctx context.Context, item persistencemodel.StoryboardScript) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeBasedOn, Source: ref("storyboard_script", item.ID)}); err != nil {
		return err
	}
	if item.ScriptVersionID == nil {
		return nil
	}
	return w.upsert(ctx, edge(item.ProjectID, "storyboard_script", item.ID, "script_version", *item.ScriptVersionID, domainrelation.CategoryStructure, domainrelation.TypeBasedOn, "", item.Status))
}

func (w *Writer) writeStoryboardVersion(ctx context.Context, item persistencemodel.StoryboardVersion) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Target: ref("storyboard_version", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "storyboard_script", item.StoryboardScriptID, "storyboard_version", item.ID, domainrelation.CategoryStructure, domainrelation.TypeHasVersion, "", item.Status)
	input.Order = item.VersionNumber
	if err := w.upsert(ctx, input); err != nil {
		return err
	}
	if item.ParentVersionID != nil {
		parent := edge(item.ProjectID, "storyboard_version", item.ID, "storyboard_version", *item.ParentVersionID, domainrelation.CategoryStructure, domainrelation.TypeDerivedFrom, "", item.Status)
		parent.Order = item.VersionNumber
		return w.upsert(ctx, parent)
	}
	return nil
}

func (w *Writer) writeKeyframe(ctx context.Context, item persistencemodel.Keyframe) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeHasKeyframe, Target: ref("keyframe", item.ID)}); err != nil {
		return err
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryAsset, Type: domainrelation.TypeUsesResource, Source: ref("keyframe", item.ID)}); err != nil {
		return err
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeCandidateFor, Source: ref("keyframe", item.ID)}); err != nil {
		return err
	}
	if targetID := generatedKeyframeCandidateTargetID(item.MetadataJSON); targetID > 0 {
		for _, input := range []relationapp.EdgeInput{
			optionalCategoryEdge(item.ProjectID, "keyframe", &item.ID, "raw_resource", ptrValue(item.ResourceID), domainrelation.CategoryAsset, domainrelation.TypeUsesResource, item.Order, item.Status),
			optionalCategoryEdge(item.ProjectID, "keyframe", &item.ID, "keyframe", targetID, domainrelation.CategoryWorkflow, domainrelation.TypeCandidateFor, item.Order, item.Status),
		} {
			if input.Source.ID == 0 || input.Target.ID == 0 {
				continue
			}
			if input.Type == domainrelation.TypeCandidateFor {
				input.Metadata = metadata(map[string]any{
					"keyframe_candidate_id": item.ID,
					"source":                "ai_generated_keyframe_candidate",
					"target_keyframe_id":    targetID,
				})
			}
			if err := w.upsert(ctx, input); err != nil {
				return err
			}
		}
		return nil
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "production", item.ProductionID, "keyframe", item.ID, domainrelation.TypeHasKeyframe, item.Order, item.Status),
		optionalEdge(item.ProjectID, "scene_moment", item.SceneMomentID, "keyframe", item.ID, domainrelation.TypeHasKeyframe, item.Order, item.Status),
		optionalEdge(item.ProjectID, "content_unit", item.ContentUnitID, "keyframe", item.ID, domainrelation.TypeHasKeyframe, item.Order, item.Status),
		optionalCategoryEdge(item.ProjectID, "keyframe", &item.ID, "raw_resource", ptrValue(item.ResourceID), domainrelation.CategoryAsset, domainrelation.TypeUsesResource, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func generatedKeyframeCandidateTargetID(metadataJSON string) uint {
	var payload struct {
		Source           string `json:"source"`
		TargetKeyframeID uint   `json:"target_keyframe_id"`
	}
	if err := json.Unmarshal([]byte(metadataJSON), &payload); err != nil {
		return 0
	}
	if payload.Source != "ai_generated_keyframe_candidate" {
		return 0
	}
	return payload.TargetKeyframeID
}

func (w *Writer) writePreviewTimeline(ctx context.Context, item persistencemodel.PreviewTimeline) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeDerivedFrom, Source: ref("preview_timeline", item.ID)}); err != nil {
		return err
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "preview_timeline", &item.ID, "production", ptrValue(item.ProductionID), domainrelation.TypeDerivedFrom, 0, item.Status),
		optionalEdge(item.ProjectID, "preview_timeline", &item.ID, "script_version", ptrValue(item.ScriptVersionID), domainrelation.TypeDerivedFrom, 0, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writePreviewTimelineItem(ctx context.Context, item persistencemodel.PreviewTimelineItem) error {
	for _, filter := range []relationapp.EdgeFilter{
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeContains, Target: ref("preview_timeline_item", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeRepresents, Source: ref("preview_timeline_item", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryStructure, Type: domainrelation.TypeUses, Source: ref("preview_timeline_item", item.ID)},
	} {
		if err := w.expire(ctx, filter); err != nil {
			return err
		}
	}
	contains := edge(item.ProjectID, "preview_timeline", item.PreviewTimelineID, "preview_timeline_item", item.ID, domainrelation.CategoryStructure, domainrelation.TypeContains, "", item.Status)
	contains.Order = item.Order
	if err := w.upsert(ctx, contains); err != nil {
		return err
	}
	for _, input := range []relationapp.EdgeInput{
		optionalEdge(item.ProjectID, "preview_timeline_item", &item.ID, "segment", ptrValue(item.SegmentID), domainrelation.TypeRepresents, item.Order, item.Status),
		optionalEdge(item.ProjectID, "preview_timeline_item", &item.ID, "scene_moment", ptrValue(item.SceneMomentID), domainrelation.TypeRepresents, item.Order, item.Status),
		optionalEdge(item.ProjectID, "preview_timeline_item", &item.ID, "content_unit", ptrValue(item.ContentUnitID), domainrelation.TypeRepresents, item.Order, item.Status),
		optionalEdge(item.ProjectID, "preview_timeline_item", &item.ID, "keyframe", ptrValue(item.KeyframeID), domainrelation.TypeUses, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writeCanvas(ctx context.Context, item persistencemodel.Canvas) error {
	if item.ProjectID == nil {
		return nil
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: *item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeAttachedTo, Source: ref("canvas", item.ID)}); err != nil {
		return err
	}
	if item.RefID == nil || strings.TrimSpace(item.RefType) == "" {
		return nil
	}
	return w.upsert(ctx, edge(*item.ProjectID, "canvas", item.ID, item.RefType, *item.RefID, domainrelation.CategoryWorkflow, domainrelation.TypeAttachedTo, item.Stage, "active"))
}

func (w *Writer) writeCanvasRun(ctx context.Context, item persistencemodel.CanvasRun) error {
	var canvas persistencemodel.Canvas
	if err := w.db.WithContext(ctx).Select("id, project_id").First(&canvas, item.CanvasID).Error; err != nil || canvas.ProjectID == nil {
		return nil
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: *canvas.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeDerivedFrom, Source: ref("canvas_run", item.ID)}); err != nil {
		return err
	}
	return w.upsert(ctx, edge(*canvas.ProjectID, "canvas_run", item.ID, "canvas", item.CanvasID, domainrelation.CategoryWorkflow, domainrelation.TypeDerivedFrom, "", item.Status))
}

func (w *Writer) writeCanvasOutput(ctx context.Context, item persistencemodel.CanvasOutput) error {
	for _, edgeType := range []string{domainrelation.TypeAppliesTo, domainrelation.TypeProduces} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: edgeType, Source: ref("canvas_output", item.ID)}); err != nil {
			return err
		}
	}
	if err := w.upsert(ctx, edge(item.ProjectID, "canvas_output", item.ID, item.OwnerType, item.OwnerID, domainrelation.CategoryWorkflow, domainrelation.TypeAppliesTo, item.OutputType, item.Status)); err != nil {
		return err
	}
	if item.ResourceID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "canvas_output", item.ID, "raw_resource", *item.ResourceID, domainrelation.CategoryWorkflow, domainrelation.TypeProduces, item.OutputType, item.Status))
	}
	return nil
}

func (w *Writer) writeWorkItem(ctx context.Context, item persistencemodel.WorkItem) error {
	for _, edgeType := range []string{domainrelation.TypeTargets, domainrelation.TypeProduces} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: edgeType, Source: ref("work_item", item.ID)}); err != nil {
			return err
		}
	}
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeContains, Target: ref("work_item", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "work_item", item.ID, item.TargetType, item.TargetID, domainrelation.CategoryWorkflow, domainrelation.TypeTargets, item.Kind, item.Status)
	input.Metadata = metadata(map[string]any{"priority": item.Priority, "result_type": item.ResultType})
	if err := w.upsert(ctx, input); err != nil {
		return err
	}
	if item.ProductionID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "production", *item.ProductionID, "work_item", item.ID, domainrelation.CategoryWorkflow, domainrelation.TypeContains, "", item.Status))
	}
	return nil
}

func (w *Writer) writeWorkReview(ctx context.Context, item persistencemodel.WorkReview) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryWorkflow, Type: domainrelation.TypeReviews, Source: ref("work_review", item.ID)}); err != nil {
		return err
	}
	input := edge(item.ProjectID, "work_review", item.ID, "work_item", item.WorkItemID, domainrelation.CategoryWorkflow, domainrelation.TypeReviews, item.Status, item.Status)
	input.Evidence = item.Comment
	input.Metadata = metadata(map[string]any{"reviewer_id": item.ReviewerID})
	return w.upsert(ctx, input)
}

func (w *Writer) writeWorkDependency(ctx context.Context, item persistencemodel.WorkDependency) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, MetadataContains: metadataMarker("work_dependency_id", item.ID)}); err != nil {
		return err
	}
	relationType := domainrelation.TypeDependsOn
	if strings.TrimSpace(item.DependencyType) == "blocks" {
		relationType = domainrelation.TypeBlocks
	}
	input := edge(item.ProjectID, "work_item", item.DependsOnWorkItemID, "work_item", item.WorkItemID, domainrelation.CategoryWorkflow, relationType, item.DependencyType, domainrelation.StatusConfirmed)
	input.Metadata = metadata(map[string]any{"work_dependency_id": item.ID})
	return w.upsert(ctx, input)
}

func (w *Writer) writeDeliveryVersion(ctx context.Context, item persistencemodel.DeliveryVersion) error {
	if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryDelivery, Type: domainrelation.TypeDerivedFrom, Source: ref("delivery_version", item.ID)}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := w.upsert(ctx, edge(item.ProjectID, "delivery_version", item.ID, "production", *item.ProductionID, domainrelation.CategoryDelivery, domainrelation.TypeDerivedFrom, "", item.Status)); err != nil {
			return err
		}
	}
	if item.PreviewTimelineID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "delivery_version", item.ID, "preview_timeline", *item.PreviewTimelineID, domainrelation.CategoryDelivery, domainrelation.TypeDerivedFrom, "", item.Status))
	}
	return nil
}

func (w *Writer) writeDeliveryTimelineItem(ctx context.Context, item persistencemodel.DeliveryTimelineItem) error {
	for _, filter := range []relationapp.EdgeFilter{
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryDelivery, Type: domainrelation.TypeContains, Target: ref("delivery_timeline_item", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryDelivery, Type: domainrelation.TypeUses, Source: ref("delivery_timeline_item", item.ID)},
		{ProjectID: item.ProjectID, Category: domainrelation.CategoryDelivery, Type: domainrelation.TypeUsesResource, Source: ref("delivery_timeline_item", item.ID)},
	} {
		if err := w.expire(ctx, filter); err != nil {
			return err
		}
	}
	contains := edge(item.ProjectID, "delivery_version", item.DeliveryVersionID, "delivery_timeline_item", item.ID, domainrelation.CategoryDelivery, domainrelation.TypeContains, "", item.Status)
	contains.Order = item.Order
	if err := w.upsert(ctx, contains); err != nil {
		return err
	}
	for _, input := range []relationapp.EdgeInput{
		optionalCategoryEdge(item.ProjectID, "delivery_timeline_item", &item.ID, "content_unit", ptrValue(item.ContentUnitID), domainrelation.CategoryDelivery, domainrelation.TypeUses, item.Order, item.Status),
		optionalCategoryEdge(item.ProjectID, "delivery_timeline_item", &item.ID, "asset_slot", ptrValue(item.AssetSlotID), domainrelation.CategoryDelivery, domainrelation.TypeUses, item.Order, item.Status),
		optionalCategoryEdge(item.ProjectID, "delivery_timeline_item", &item.ID, "raw_resource", ptrValue(item.ResourceID), domainrelation.CategoryDelivery, domainrelation.TypeUsesResource, item.Order, item.Status),
	} {
		if input.Source.ID == 0 || input.Target.ID == 0 {
			continue
		}
		if err := w.upsert(ctx, input); err != nil {
			return err
		}
	}
	return nil
}

func (w *Writer) writeExportRecord(ctx context.Context, item persistencemodel.ExportRecord) error {
	for _, edgeType := range []string{domainrelation.TypeExports, domainrelation.TypeProduces} {
		if err := w.expire(ctx, relationapp.EdgeFilter{ProjectID: item.ProjectID, Category: domainrelation.CategoryDelivery, Type: edgeType, Source: ref("export_record", item.ID)}); err != nil {
			return err
		}
	}
	if err := w.upsert(ctx, edge(item.ProjectID, "export_record", item.ID, "delivery_version", item.DeliveryVersionID, domainrelation.CategoryDelivery, domainrelation.TypeExports, "", item.Status)); err != nil {
		return err
	}
	if item.ResourceID != nil {
		return w.upsert(ctx, edge(item.ProjectID, "export_record", item.ID, "raw_resource", *item.ResourceID, domainrelation.CategoryDelivery, domainrelation.TypeProduces, "", item.Status))
	}
	return nil
}

func edge(projectID uint, sourceType string, sourceID uint, targetType string, targetID uint, category string, edgeType string, label string, status string) relationapp.EdgeInput {
	return relationapp.EdgeInput{
		ProjectID: projectID,
		Source:    ref(sourceType, sourceID),
		Target:    ref(targetType, targetID),
		Category:  category,
		Type:      edgeType,
		Label:     strings.TrimSpace(label),
		Status:    relationStatus(status),
	}
}

func optionalEdge(projectID uint, sourceType string, sourceID *uint, targetType string, targetID uint, edgeType string, order int, status string) relationapp.EdgeInput {
	return optionalCategoryEdge(projectID, sourceType, sourceID, targetType, targetID, domainrelation.CategoryStructure, edgeType, order, status)
}

func optionalCategoryEdge(projectID uint, sourceType string, sourceID *uint, targetType string, targetID uint, category string, edgeType string, order int, status string) relationapp.EdgeInput {
	if sourceID == nil {
		return relationapp.EdgeInput{}
	}
	input := edge(projectID, sourceType, *sourceID, targetType, targetID, category, edgeType, "", status)
	input.Order = order
	return input
}

func ref(entityType string, id uint) domainrelation.EntityRef {
	return domainrelation.NewEntityRef(entityType, id)
}

func ptrValue(value *uint) uint {
	if value == nil {
		return 0
	}
	return *value
}

func semanticScope(scopeType string, scopeID *uint) domainrelation.EntityRef {
	scope := domainrelation.EntityRef{Type: strings.TrimSpace(scopeType)}
	if scopeID != nil {
		scope.ID = *scopeID
	}
	return scope
}

func relationStatus(status string) string {
	switch trimmed := strings.TrimSpace(status); trimmed {
	case "", "active", "locked", "selected", "approved", "confirmed":
		return domainrelation.StatusConfirmed
	case "ignored", "rejected", "archived":
		return trimmed
	default:
		return trimmed
	}
}

func relationOrigin(origin string) string {
	if trimmed := strings.TrimSpace(origin); trimmed != "" {
		return trimmed
	}
	return domainrelation.OriginSystem
}

func assetOwnerType(slot persistencemodel.AssetSlot) string {
	switch strings.TrimSpace(slot.Status) {
	case "locked", "selected", "approved", "final":
		return domainrelation.TypeUsesAsset
	default:
		if slot.ResourceID != nil || slot.LockedAssetSlotID != nil {
			return domainrelation.TypeUsesAsset
		}
		return domainrelation.TypeNeedsAsset
	}
}

func metadata(payload map[string]any) string {
	data, _ := json.Marshal(payload)
	return string(data)
}

func metadataMarker(key string, id uint) string {
	return fmt.Sprintf(`"%s":%d`, key, id)
}
