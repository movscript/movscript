package semantic

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/app/workflowio"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	WithTx(ctx context.Context, fn func(repository) error) error
	PatchProjectStyle(ctx context.Context, projectID uint, patch ProjectStylePatch) (domainproject.Project, error)
	ListRelations(ctx context.Context, filter RelationFilter) ([]domainsemantic.EntityRelation, error)
	ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]domainsemantic.ScriptVersion, error)
	LoadScriptForProject(ctx context.Context, projectID uint, scriptID uint) (domainscript.ScriptSnapshot, error)
	CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (domainsemantic.ScriptVersion, error)
	LoadScriptVersion(ctx context.Context, projectID uint, id string) (domainsemantic.ScriptVersion, error)
	PatchScriptVersion(ctx context.Context, item domainsemantic.ScriptVersion, patch domainsemantic.ScriptVersionPatch) (domainsemantic.ScriptVersion, error)
	NextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int
	ListScriptBlocks(ctx context.Context, filter ScriptBlockFilter) ([]domainsemantic.ScriptBlock, error)
	CreateScriptBlock(ctx context.Context, item domainsemantic.ScriptBlock) (domainsemantic.ScriptBlock, error)
	LoadScriptBlock(ctx context.Context, projectID uint, id string) (domainsemantic.ScriptBlock, error)
	PatchScriptBlock(ctx context.Context, item domainsemantic.ScriptBlock, patch domainsemantic.ScriptBlockPatch) (domainsemantic.ScriptBlock, error)
	ListSegments(ctx context.Context, filter SegmentFilter) ([]domainsemantic.Segment, error)
	CreateSegment(ctx context.Context, item domainsemantic.Segment) (domainsemantic.Segment, error)
	LoadSegment(ctx context.Context, projectID uint, id string) (domainsemantic.Segment, error)
	PatchSegment(ctx context.Context, item domainsemantic.Segment, patch domainsemantic.SegmentPatch) (domainsemantic.Segment, error)
	ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]domainsemantic.ProductionTextBlock, error)
	CreateProductionTextBlock(ctx context.Context, item domainsemantic.ProductionTextBlock) (domainsemantic.ProductionTextBlock, error)
	LoadProductionTextBlock(ctx context.Context, projectID uint, id string) (domainsemantic.ProductionTextBlock, error)
	PatchProductionTextBlock(ctx context.Context, item domainsemantic.ProductionTextBlock, patch domainsemantic.ProductionTextBlockPatch) (domainsemantic.ProductionTextBlock, error)
	ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]domainsemantic.SceneMoment, error)
	CreateSceneMoment(ctx context.Context, item domainsemantic.SceneMoment) (domainsemantic.SceneMoment, error)
	LoadSceneMoment(ctx context.Context, projectID uint, id string) (domainsemantic.SceneMoment, error)
	PatchSceneMoment(ctx context.Context, item domainsemantic.SceneMoment, patch domainsemantic.SceneMomentPatch) (domainsemantic.SceneMoment, error)
	ResolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error)
	ListProductions(ctx context.Context, filter ProductionFilter) ([]domainsemantic.Production, error)
	CreateProduction(ctx context.Context, item domainsemantic.Production) (domainsemantic.Production, error)
	LoadProduction(ctx context.Context, projectID uint, id string) (domainsemantic.Production, error)
	PatchProduction(ctx context.Context, item domainsemantic.Production, patch domainsemantic.ProductionPatch) (domainsemantic.Production, error)
	ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error)
	CreateContentUnit(ctx context.Context, item domainsemantic.ContentUnit) (domainsemantic.ContentUnit, error)
	LoadContentUnit(ctx context.Context, projectID uint, id string) (domainsemantic.ContentUnit, error)
	PatchContentUnit(ctx context.Context, item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) (domainsemantic.ContentUnit, error)
	ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]domainsemantic.Keyframe, error)
	CreateKeyframe(ctx context.Context, item domainsemantic.Keyframe) (domainsemantic.Keyframe, error)
	LoadKeyframe(ctx context.Context, projectID uint, id string) (domainsemantic.Keyframe, error)
	PatchKeyframe(ctx context.Context, item domainsemantic.Keyframe, patch domainsemantic.KeyframePatch) (domainsemantic.Keyframe, error)
	ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]domainsemantic.PreviewTimeline, error)
	CreatePreviewTimeline(ctx context.Context, item domainsemantic.PreviewTimeline) (domainsemantic.PreviewTimeline, error)
	LoadPreviewTimeline(ctx context.Context, projectID uint, id string) (domainsemantic.PreviewTimeline, error)
	PatchPreviewTimeline(ctx context.Context, item domainsemantic.PreviewTimeline, patch domainsemantic.PreviewTimelinePatch) (domainsemantic.PreviewTimeline, error)
	ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]domainsemantic.PreviewTimelineItem, error)
	CreatePreviewTimelineItem(ctx context.Context, item domainsemantic.PreviewTimelineItem) (domainsemantic.PreviewTimelineItem, error)
	LoadPreviewTimelineItem(ctx context.Context, projectID uint, id string) (domainsemantic.PreviewTimelineItem, error)
	PatchPreviewTimelineItem(ctx context.Context, item domainsemantic.PreviewTimelineItem, patch domainsemantic.PreviewTimelineItemPatch) (domainsemantic.PreviewTimelineItem, error)
	ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]domainsemantic.StoryboardScript, error)
	CreateStoryboardScript(ctx context.Context, item domainsemantic.StoryboardScript) (domainsemantic.StoryboardScript, error)
	LoadStoryboardScript(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardScript, error)
	PatchStoryboardScript(ctx context.Context, item domainsemantic.StoryboardScript, patch domainsemantic.StoryboardScriptPatch) (domainsemantic.StoryboardScript, error)
	ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]domainsemantic.StoryboardVersion, error)
	CreateStoryboardVersion(ctx context.Context, item domainsemantic.StoryboardVersion) (domainsemantic.StoryboardVersion, error)
	LoadStoryboardVersion(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardVersion, error)
	PatchStoryboardVersion(ctx context.Context, item domainsemantic.StoryboardVersion, patch domainsemantic.StoryboardVersionPatch) (domainsemantic.StoryboardVersion, error)
	ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]domainsemantic.StoryboardLine, error)
	CreateStoryboardLine(ctx context.Context, item domainsemantic.StoryboardLine) (domainsemantic.StoryboardLine, error)
	LoadStoryboardLine(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardLine, error)
	PatchStoryboardLine(ctx context.Context, item domainsemantic.StoryboardLine, patch domainsemantic.StoryboardLinePatch) (domainsemantic.StoryboardLine, error)
	NextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int
	ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]domainsemantic.WorkItem, error)
	CreateWorkItem(ctx context.Context, item domainsemantic.WorkItem) (domainsemantic.WorkItem, error)
	LoadWorkItem(ctx context.Context, projectID uint, id string) (domainsemantic.WorkItem, error)
	PatchWorkItem(ctx context.Context, item domainsemantic.WorkItem, patch domainsemantic.WorkItemPatch) (domainsemantic.WorkItem, error)
	DeleteWorkItem(ctx context.Context, item domainsemantic.WorkItem) error
	CompleteWorkItem(ctx context.Context, projectID uint, item domainsemantic.WorkItem, patch domainsemantic.WorkItemPatch, actorID *uint) (domainsemantic.WorkItem, error)
	ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]domainsemantic.WorkReview, error)
	CreateWorkReview(ctx context.Context, item domainsemantic.WorkReview) (domainsemantic.WorkReview, error)
	LoadWorkReview(ctx context.Context, projectID uint, id string) (domainsemantic.WorkReview, error)
	PatchWorkReview(ctx context.Context, item domainsemantic.WorkReview, patch domainsemantic.WorkReviewPatch) (domainsemantic.WorkReview, error)
	DeleteWorkReview(ctx context.Context, item domainsemantic.WorkReview) error
	ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]domainsemantic.WorkDependency, error)
	CreateWorkDependency(ctx context.Context, item domainsemantic.WorkDependency) (domainsemantic.WorkDependency, error)
	LoadWorkDependency(ctx context.Context, projectID uint, id string) (domainsemantic.WorkDependency, error)
	PatchWorkDependency(ctx context.Context, item domainsemantic.WorkDependency, patch domainsemantic.WorkDependencyPatch) (domainsemantic.WorkDependency, error)
	DeleteWorkDependency(ctx context.Context, item domainsemantic.WorkDependency) error
	ListDeliveryVersions(ctx context.Context, filter DeliveryVersionFilter) ([]domainsemantic.DeliveryVersion, error)
	CreateDeliveryVersion(ctx context.Context, item domainsemantic.DeliveryVersion) (domainsemantic.DeliveryVersion, error)
	LoadDeliveryVersion(ctx context.Context, projectID uint, id string) (domainsemantic.DeliveryVersion, error)
	PatchDeliveryVersion(ctx context.Context, item domainsemantic.DeliveryVersion, patch domainsemantic.DeliveryVersionPatch) (domainsemantic.DeliveryVersion, error)
	ListDeliveryTimelineItems(ctx context.Context, filter DeliveryTimelineItemFilter) ([]domainsemantic.DeliveryTimelineItem, error)
	CreateDeliveryTimelineItem(ctx context.Context, item domainsemantic.DeliveryTimelineItem) (domainsemantic.DeliveryTimelineItem, error)
	LoadDeliveryTimelineItem(ctx context.Context, projectID uint, id string) (domainsemantic.DeliveryTimelineItem, error)
	PatchDeliveryTimelineItem(ctx context.Context, item domainsemantic.DeliveryTimelineItem, patch domainsemantic.DeliveryTimelineItemPatch) (domainsemantic.DeliveryTimelineItem, error)
	ListExportRecords(ctx context.Context, filter ExportRecordFilter) ([]domainsemantic.ExportRecord, error)
	CreateExportRecord(ctx context.Context, item domainsemantic.ExportRecord) (domainsemantic.ExportRecord, error)
	LoadExportRecord(ctx context.Context, projectID uint, id string) (domainsemantic.ExportRecord, error)
	PatchExportRecord(ctx context.Context, item domainsemantic.ExportRecord, patch domainsemantic.ExportRecordPatch) (domainsemantic.ExportRecord, error)
	ListCanvasOutputs(ctx context.Context, filter CanvasOutputFilter) ([]domainsemantic.CanvasOutput, error)
	CreateCanvasOutput(ctx context.Context, item domainsemantic.CanvasOutput) (domainsemantic.CanvasOutput, error)
	LoadCanvasOutput(ctx context.Context, projectID uint, id string) (domainsemantic.CanvasOutput, error)
	PatchCanvasOutput(ctx context.Context, item domainsemantic.CanvasOutput, patch domainsemantic.CanvasOutputPatch) (domainsemantic.CanvasOutput, error)
	ListAssetSlots(ctx context.Context, filter AssetSlotFilter) ([]domainsemantic.AssetSlot, error)
	CreateAssetSlot(ctx context.Context, item domainsemantic.AssetSlot) (domainsemantic.AssetSlot, error)
	LoadAssetSlot(ctx context.Context, projectID uint, id string) (domainsemantic.AssetSlot, error)
	PatchAssetSlot(ctx context.Context, item domainsemantic.AssetSlot, patch domainsemantic.AssetSlotPatch) (domainsemantic.AssetSlot, error)
	ListAssetSlotCandidates(ctx context.Context, filter AssetSlotCandidateFilter) ([]domainsemantic.AssetSlotCandidate, error)
	CreateAssetSlotCandidate(ctx context.Context, item domainsemantic.AssetSlotCandidate) (domainsemantic.AssetSlotCandidate, error)
	LoadAssetSlotCandidate(ctx context.Context, projectID uint, id string) (domainsemantic.AssetSlotCandidate, error)
	PatchAssetSlotCandidate(ctx context.Context, item domainsemantic.AssetSlotCandidate, patch domainsemantic.AssetSlotCandidatePatch) (domainsemantic.AssetSlotCandidate, error)
	AttachAssetSlotCandidate(ctx context.Context, input workflowio.AttachAssetSlotCandidateInput) (workflowio.AttachAssetSlotCandidateResult, error)
	ReloadAssetSlotCandidate(ctx context.Context, candidate domainsemantic.AssetSlotCandidate) (domainsemantic.AssetSlotCandidate, error)
	ListCandidateDecisions(ctx context.Context, filter CandidateDecisionFilter) ([]domainsemantic.CandidateDecision, error)
	CreateCandidateDecision(ctx context.Context, item domainsemantic.CandidateDecision) (domainsemantic.CandidateDecision, error)
	LoadCandidateDecision(ctx context.Context, projectID uint, id string) (domainsemantic.CandidateDecision, error)
	PatchCandidateDecision(ctx context.Context, item domainsemantic.CandidateDecision, patch domainsemantic.CandidateDecisionPatch) (domainsemantic.CandidateDecision, error)
	ListReviewEvents(ctx context.Context, filter ReviewEventFilter) ([]domainsemantic.ReviewEvent, error)
	CreateReviewEvent(ctx context.Context, item domainsemantic.ReviewEvent) (domainsemantic.ReviewEvent, error)
	LoadReviewEvent(ctx context.Context, projectID uint, id string) (domainsemantic.ReviewEvent, error)
	PatchReviewEvent(ctx context.Context, item domainsemantic.ReviewEvent, patch domainsemantic.ReviewEventPatch) (domainsemantic.ReviewEvent, error)
	ListCreativeReferences(ctx context.Context, filter CreativeReferenceFilter) ([]domainsemantic.CreativeReference, error)
	CreateCreativeReference(ctx context.Context, item domainsemantic.CreativeReference) (domainsemantic.CreativeReference, error)
	LoadCreativeReference(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReference, error)
	PatchCreativeReference(ctx context.Context, item domainsemantic.CreativeReference, patch domainsemantic.CreativeReferencePatch) (domainsemantic.CreativeReference, error)
	ListCreativeReferenceStates(ctx context.Context, filter CreativeReferenceStateFilter) ([]domainsemantic.CreativeReferenceState, error)
	CreateCreativeReferenceState(ctx context.Context, item domainsemantic.CreativeReferenceState) (domainsemantic.CreativeReferenceState, error)
	LoadCreativeReferenceState(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReferenceState, error)
	PatchCreativeReferenceState(ctx context.Context, item domainsemantic.CreativeReferenceState, patch domainsemantic.CreativeReferenceStatePatch) (domainsemantic.CreativeReferenceState, error)
	ListCreativeReferenceUsages(ctx context.Context, filter CreativeReferenceUsageFilter) ([]domainsemantic.CreativeReferenceUsage, error)
	CreateCreativeReferenceUsage(ctx context.Context, item domainsemantic.CreativeReferenceUsage) (domainsemantic.CreativeReferenceUsage, error)
	LoadCreativeReferenceUsage(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReferenceUsage, error)
	PatchCreativeReferenceUsage(ctx context.Context, item domainsemantic.CreativeReferenceUsage, patch domainsemantic.CreativeReferenceUsagePatch) (domainsemantic.CreativeReferenceUsage, error)
	ListCreativeRelationships(ctx context.Context, filter CreativeRelationshipFilter) ([]domainsemantic.CreativeRelationship, error)
	CreateCreativeRelationship(ctx context.Context, item domainsemantic.CreativeRelationship) (domainsemantic.CreativeRelationship, error)
	LoadCreativeRelationship(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeRelationship, error)
	PatchCreativeRelationship(ctx context.Context, item domainsemantic.CreativeRelationship, patch domainsemantic.CreativeRelationshipPatch) (domainsemantic.CreativeRelationship, error)
	DeleteProjectItemByKind(ctx context.Context, projectID uint, kind string, id string) (uint, error)
	EnsureProductionInProject(ctx context.Context, projectID uint, productionID uint) error
	EnsureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error
	EnsureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error
	EnsureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error
	EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error
	EnsureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error
	EnsureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error
	EnsureCreativeReferenceInProject(ctx context.Context, projectID uint, referenceID uint) error
	EnsureCreativeReferenceStateInProject(ctx context.Context, projectID uint, stateID uint) error
	EnsureAssetSlotInProject(ctx context.Context, projectID uint, assetSlotID uint) error
	EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error
	EnsureCanvasInProject(ctx context.Context, projectID uint, canvasID uint) error
	EnsureCanvasRunInProject(ctx context.Context, projectID uint, runID uint) error
	EnsureUserInProject(ctx context.Context, projectID uint, userID uint) error
	EnsureJobInProject(ctx context.Context, projectID uint, jobID uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) *gormRepository {
	return &gormRepository{db: db}
}

func (r *gormRepository) WithTx(ctx context.Context, fn func(repository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(newRepository(tx))
	})
}

func (r *gormRepository) PatchProjectStyle(ctx context.Context, projectID uint, patch ProjectStylePatch) (domainproject.Project, error) {
	var project persistencemodel.Project
	if err := r.db.WithContext(ctx).Where("id = ?", projectID).First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Project{}, ErrNotFound
		}
		return domainproject.Project{}, err
	}
	if patch.AspectRatio != nil {
		project.AspectRatio = strings.TrimSpace(*patch.AspectRatio)
	}
	if patch.VisualStyle != nil {
		project.VisualStyle = strings.TrimSpace(*patch.VisualStyle)
	}
	projectStyle, err := mergeProjectStyleJSON(project.ProjectStyle, patch)
	if err != nil {
		return domainproject.Project{}, ErrInvalidInput{Err: err}
	}
	project.ProjectStyle = projectStyle
	if err := r.db.WithContext(ctx).Save(&project).Error; err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) ListRelations(ctx context.Context, filter RelationFilter) ([]domainsemantic.EntityRelation, error) {
	items := make([]persistencemodel.EntityRelation, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if category := strings.TrimSpace(filter.Category); category != "" {
		q = q.Where("category = ?", category)
	}
	if relationType := strings.TrimSpace(filter.Type); relationType != "" {
		q = q.Where("type = ?", relationType)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	if filter.SourceID > 0 {
		q = q.Where("source_id = ?", filter.SourceID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if filter.TargetID > 0 {
		q = q.Where("target_id = ?", filter.TargetID)
	}
	if source := strings.TrimSpace(filter.Source); source != "" {
		q = q.Where("source = ?", source)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return entityRelationsFromModels(items), nil
}

func entityRelationsFromModels(items []persistencemodel.EntityRelation) []domainsemantic.EntityRelation {
	result := make([]domainsemantic.EntityRelation, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.EntityRelationFromModel(item))
	}
	return result
}

func (r *gormRepository) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]domainsemantic.ScriptVersion, error) {
	items := make([]persistencemodel.ScriptVersion, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptID > 0 {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("script_id, version_number desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return scriptVersionsFromModels(items), nil
}

func scriptVersionsFromModels(items []persistencemodel.ScriptVersion) []domainsemantic.ScriptVersion {
	result := make([]domainsemantic.ScriptVersion, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ScriptVersionFromModel(item))
	}
	return result
}

func (r *gormRepository) LoadScriptForProject(ctx context.Context, projectID uint, scriptID uint) (domainscript.ScriptSnapshot, error) {
	var script persistencemodel.Script
	if err := r.db.WithContext(ctx).Select("id, project_id, title, raw_source, content").First(&script, scriptID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainscript.ScriptSnapshot{}, ErrScriptNotFound
		}
		return domainscript.ScriptSnapshot{}, err
	}
	if script.ProjectID != projectID {
		return domainscript.ScriptSnapshot{}, ErrScriptNotFound
	}
	return domainscript.ScriptSnapshotFromModel(script), nil
}

func (r *gormRepository) loadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (r *gormRepository) DeleteProjectItemByKind(ctx context.Context, projectID uint, kind string, id string) (uint, error) {
	if strings.TrimSpace(kind) == domainworkflow.EntityKindScriptVersion {
		return 0, ErrForbidden{Message: "剧本版本创建后不可删除，请保留历史版本以保证引用稳定"}
	}
	item, err := newDeleteItemModel(kind)
	if err != nil {
		return 0, err
	}
	if err := r.loadProjectItem(ctx, projectID, item, id); err != nil {
		return 0, err
	}
	if err := r.deleteItem(ctx, item); err != nil {
		return 0, err
	}
	return projectID, nil
}

func newDeleteItemModel(kind string) (any, error) {
	switch kind {
	case domainworkflow.EntityKindScriptVersion:
		return &persistencemodel.ScriptVersion{}, nil
	case "script_block":
		return &persistencemodel.ScriptBlock{}, nil
	case domainworkflow.EntityKindSegment:
		return &persistencemodel.Segment{}, nil
	case "production_text_block":
		return &persistencemodel.ProductionTextBlock{}, nil
	case domainworkflow.EntityKindSceneMoment:
		return &persistencemodel.SceneMoment{}, nil
	case "storyboard_script":
		return &persistencemodel.StoryboardScript{}, nil
	case "storyboard_version":
		return &persistencemodel.StoryboardVersion{}, nil
	case "storyboard_line":
		return &persistencemodel.StoryboardLine{}, nil
	case "production":
		return &persistencemodel.Production{}, nil
	case domainworkflow.EntityKindContentUnit:
		return &persistencemodel.ContentUnit{}, nil
	case domainworkflow.EntityKindKeyframe:
		return &persistencemodel.Keyframe{}, nil
	case "preview_timeline":
		return &persistencemodel.PreviewTimeline{}, nil
	case "preview_timeline_item":
		return &persistencemodel.PreviewTimelineItem{}, nil
	case domainworkflow.EntityKindCreativeReference:
		return &persistencemodel.CreativeReference{}, nil
	case "creative_reference_state":
		return &persistencemodel.CreativeReferenceState{}, nil
	case "creative_reference_usage":
		return &persistencemodel.CreativeReferenceUsage{}, nil
	case "creative_relationship":
		return &persistencemodel.CreativeRelationship{}, nil
	case domainworkflow.EntityKindAssetSlot:
		return &persistencemodel.AssetSlot{}, nil
	case "asset_slot_candidate":
		return &persistencemodel.AssetSlotCandidate{}, nil
	case "candidate_decision":
		return &persistencemodel.CandidateDecision{}, nil
	case "review_event":
		return &persistencemodel.ReviewEvent{}, nil
	case domainworkflow.EntityKindDeliveryVersion:
		return &persistencemodel.DeliveryVersion{}, nil
	case "delivery_timeline_item":
		return &persistencemodel.DeliveryTimelineItem{}, nil
	case "export_record":
		return &persistencemodel.ExportRecord{}, nil
	case "canvas_output":
		return &persistencemodel.CanvasOutput{}, nil
	default:
		return nil, fmt.Errorf("%w: unsupported delete kind %q", ErrOwnerInvalidType, kind)
	}
}

func (r *gormRepository) createItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) patchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(item).Error; err != nil {
			return err
		}
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) deleteItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Delete(item).Error; err != nil {
			return err
		}
		return entityrelation.DeleteCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (domainsemantic.ScriptVersion, error) {
	script, err := r.LoadScriptForProject(ctx, projectID, input.ScriptID)
	if err != nil {
		return domainsemantic.ScriptVersion{}, err
	}
	domainItem := domainsemantic.NewScriptVersion(domainsemantic.ScriptVersionSpec{
		ProjectID:         projectID,
		ScriptID:          input.ScriptID,
		ParentVersionID:   input.ParentVersionID,
		VersionNumber:     input.VersionNumber,
		Title:             input.Title,
		FallbackTitle:     script.Title,
		SourceType:        input.SourceType,
		Content:           input.Content,
		FallbackContent:   script.Content,
		RawSource:         input.RawSource,
		FallbackRawSource: script.RawSource,
		Summary:           input.Summary,
		Status:            input.Status,
		CreatedByID:       createdByID,
	})
	if domainItem.VersionNumber == 0 {
		domainItem.VersionNumber = r.NextScriptVersionNumber(ctx, projectID, input.ScriptID)
	}
	item := domainItem.ToModel()
	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return domainsemantic.ScriptVersionFromModel(item), err
	}
	return domainsemantic.ScriptVersionFromModel(item), nil
}

func (r *gormRepository) LoadScriptVersion(ctx context.Context, projectID uint, id string) (domainsemantic.ScriptVersion, error) {
	var item persistencemodel.ScriptVersion
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ScriptVersion{}, err
	}
	return domainsemantic.ScriptVersionFromModel(item), nil
}

func (r *gormRepository) PatchScriptVersion(ctx context.Context, item domainsemantic.ScriptVersion, patch domainsemantic.ScriptVersionPatch) (domainsemantic.ScriptVersion, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, scriptVersionPatchColumns(patch)); err != nil {
		return domainsemantic.ScriptVersionFromModel(modelItem), err
	}
	return domainsemantic.ScriptVersionFromModel(modelItem), nil
}

func scriptVersionPatchColumns(patch domainsemantic.ScriptVersionPatch) map[string]any {
	if patch.Empty() {
		return map[string]any{}
	}
	updates := map[string]any{}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.SourceType) != "" {
		updates["source_type"] = patch.SourceType
	}
	if strings.TrimSpace(patch.Content) != "" {
		updates["content"] = patch.Content
	}
	if strings.TrimSpace(patch.RawSource) != "" {
		updates["raw_source"] = patch.RawSource
	}
	if strings.TrimSpace(patch.Summary) != "" {
		updates["summary"] = patch.Summary
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if patch.ParentVersionID != nil {
		updates["parent_version_id"] = patch.ParentVersionID
	}
	return updates
}

func (r *gormRepository) NextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	var maxVersion int
	r.db.WithContext(ctx).
		Model(&persistencemodel.ScriptVersion{}).
		Where("project_id = ? AND script_id = ?", projectID, scriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

func (r *gormRepository) ListScriptBlocks(ctx context.Context, filter ScriptBlockFilter) ([]domainsemantic.ScriptBlock, error) {
	items := make([]persistencemodel.ScriptBlock, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptID > 0 {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	if filter.ScriptVersionID > 0 {
		q = q.Where("script_version_id = ?", filter.ScriptVersionID)
	}
	if filter.ParentBlockID > 0 {
		q = q.Where("parent_block_id = ?", filter.ParentBlockID)
	}
	if kind := strings.TrimSpace(filter.Kind); kind != "" {
		q = q.Where("kind = ?", kind)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`script_version_id, "order", start_line, id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return scriptBlocksFromModels(items), nil
}

func scriptBlocksFromModels(items []persistencemodel.ScriptBlock) []domainsemantic.ScriptBlock {
	result := make([]domainsemantic.ScriptBlock, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ScriptBlockFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateScriptBlock(ctx context.Context, item domainsemantic.ScriptBlock) (domainsemantic.ScriptBlock, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ScriptBlockFromModel(modelItem), err
	}
	return domainsemantic.ScriptBlockFromModel(modelItem), nil
}

func (r *gormRepository) LoadScriptBlock(ctx context.Context, projectID uint, id string) (domainsemantic.ScriptBlock, error) {
	var item persistencemodel.ScriptBlock
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ScriptBlock{}, err
	}
	return domainsemantic.ScriptBlockFromModel(item), nil
}

func (r *gormRepository) PatchScriptBlock(ctx context.Context, item domainsemantic.ScriptBlock, patch domainsemantic.ScriptBlockPatch) (domainsemantic.ScriptBlock, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, scriptBlockPatchColumns(patch)); err != nil {
		return domainsemantic.ScriptBlockFromModel(modelItem), err
	}
	return domainsemantic.ScriptBlockFromModel(modelItem), nil
}

func scriptBlockPatchColumns(patch domainsemantic.ScriptBlockPatch) map[string]any {
	updates := map[string]any{
		"order": patch.Order,
	}
	if patch.ParentBlockID != nil {
		updates["parent_block_id"] = patch.ParentBlockID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Speaker) != "" {
		updates["speaker"] = patch.Speaker
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListSegments(ctx context.Context, filter SegmentFilter) ([]domainsemantic.Segment, error) {
	items := make([]persistencemodel.Segment, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.TextBlockID > 0 {
		q = q.Where("text_block_id = ?", filter.TextBlockID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`production_id, text_block_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return segmentsFromModels(items), nil
}

func segmentsFromModels(items []persistencemodel.Segment) []domainsemantic.Segment {
	result := make([]domainsemantic.Segment, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.SegmentFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateSegment(ctx context.Context, item domainsemantic.Segment) (domainsemantic.Segment, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.SegmentFromModel(modelItem), err
	}
	return domainsemantic.SegmentFromModel(modelItem), nil
}

func (r *gormRepository) LoadSegment(ctx context.Context, projectID uint, id string) (domainsemantic.Segment, error) {
	var item persistencemodel.Segment
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.Segment{}, err
	}
	return domainsemantic.SegmentFromModel(item), nil
}

func (r *gormRepository) PatchSegment(ctx context.Context, item domainsemantic.Segment, patch domainsemantic.SegmentPatch) (domainsemantic.Segment, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, segmentPatchColumns(patch)); err != nil {
		return domainsemantic.SegmentFromModel(modelItem), err
	}
	return domainsemantic.SegmentFromModel(modelItem), nil
}

func segmentPatchColumns(patch domainsemantic.SegmentPatch) map[string]any {
	updates := map[string]any{
		"order": patch.Order,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = *patch.ProductionID
	}
	if patch.TextBlockID != nil {
		updates["text_block_id"] = *patch.TextBlockID
	}
	if patch.ScriptBlockID != nil {
		updates["script_block_id"] = patch.ScriptBlockID
	}
	if patch.ParentSegmentID != nil {
		updates["parent_segment_id"] = patch.ParentSegmentID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Summary) != "" {
		updates["summary"] = patch.Summary
	}
	if strings.TrimSpace(patch.Content) != "" {
		updates["content"] = patch.Content
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]domainsemantic.ProductionTextBlock, error) {
	items := make([]persistencemodel.ProductionTextBlock, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`production_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return productionTextBlocksFromModels(items), nil
}

func productionTextBlocksFromModels(items []persistencemodel.ProductionTextBlock) []domainsemantic.ProductionTextBlock {
	result := make([]domainsemantic.ProductionTextBlock, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ProductionTextBlockFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateProductionTextBlock(ctx context.Context, item domainsemantic.ProductionTextBlock) (domainsemantic.ProductionTextBlock, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ProductionTextBlockFromModel(modelItem), err
	}
	return domainsemantic.ProductionTextBlockFromModel(modelItem), nil
}

func (r *gormRepository) LoadProductionTextBlock(ctx context.Context, projectID uint, id string) (domainsemantic.ProductionTextBlock, error) {
	var item persistencemodel.ProductionTextBlock
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ProductionTextBlock{}, err
	}
	return domainsemantic.ProductionTextBlockFromModel(item), nil
}

func (r *gormRepository) PatchProductionTextBlock(ctx context.Context, item domainsemantic.ProductionTextBlock, patch domainsemantic.ProductionTextBlockPatch) (domainsemantic.ProductionTextBlock, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, productionTextBlockPatchColumns(patch)); err != nil {
		return domainsemantic.ProductionTextBlockFromModel(modelItem), err
	}
	return domainsemantic.ProductionTextBlockFromModel(modelItem), nil
}

func productionTextBlockPatchColumns(patch domainsemantic.ProductionTextBlockPatch) map[string]any {
	updates := map[string]any{
		"order": patch.Order,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = *patch.ProductionID
	}
	if patch.ParentBlockID != nil {
		updates["parent_block_id"] = patch.ParentBlockID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Content) != "" {
		updates["content"] = patch.Content
	}
	if strings.TrimSpace(patch.Summary) != "" {
		updates["summary"] = patch.Summary
	}
	if strings.TrimSpace(patch.SourceType) != "" {
		updates["source_type"] = patch.SourceType
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]domainsemantic.SceneMoment, error) {
	items := make([]persistencemodel.SceneMoment, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	if err := q.Order(`segment_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return sceneMomentsFromModels(items), nil
}

func sceneMomentsFromModels(items []persistencemodel.SceneMoment) []domainsemantic.SceneMoment {
	result := make([]domainsemantic.SceneMoment, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.SceneMomentFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateSceneMoment(ctx context.Context, item domainsemantic.SceneMoment) (domainsemantic.SceneMoment, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.SceneMomentFromModel(modelItem), err
	}
	return domainsemantic.SceneMomentFromModel(modelItem), nil
}

func (r *gormRepository) LoadSceneMoment(ctx context.Context, projectID uint, id string) (domainsemantic.SceneMoment, error) {
	var item persistencemodel.SceneMoment
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.SceneMoment{}, err
	}
	return domainsemantic.SceneMomentFromModel(item), nil
}

func (r *gormRepository) PatchSceneMoment(ctx context.Context, item domainsemantic.SceneMoment, patch domainsemantic.SceneMomentPatch) (domainsemantic.SceneMoment, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, sceneMomentPatchColumns(patch)); err != nil {
		return domainsemantic.SceneMomentFromModel(modelItem), err
	}
	return domainsemantic.SceneMomentFromModel(modelItem), nil
}

func sceneMomentPatchColumns(patch domainsemantic.SceneMomentPatch) map[string]any {
	updates := map[string]any{
		"order": patch.Order,
	}
	if patch.SegmentID != nil {
		updates["segment_id"] = patch.SegmentID
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.TimeText) != "" {
		updates["time_text"] = patch.TimeText
	}
	if strings.TrimSpace(patch.LocationText) != "" {
		updates["location_text"] = patch.LocationText
	}
	if strings.TrimSpace(patch.ConditionText) != "" {
		updates["condition_text"] = patch.ConditionText
	}
	if strings.TrimSpace(patch.ActionText) != "" {
		updates["action_text"] = patch.ActionText
	}
	if strings.TrimSpace(patch.Mood) != "" {
		updates["mood"] = patch.Mood
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ResolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	if productionID != nil {
		if err := r.EnsureProductionInProject(ctx, projectID, *productionID); err != nil {
			return nil, nil, err
		}
	}
	if textBlockID == nil {
		return productionID, nil, nil
	}

	var block persistencemodel.ProductionTextBlock
	if err := r.db.WithContext(ctx).Select("id, project_id, production_id").First(&block, *textBlockID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrTextBlockNotFound
		}
		return nil, nil, err
	}
	if block.ProjectID != projectID {
		return nil, nil, ErrOwnerWrongProject
	}
	if productionID != nil && *productionID != block.ProductionID {
		return nil, nil, ErrSegmentProductionMismatch
	}
	resolvedProductionID := block.ProductionID
	return &resolvedProductionID, textBlockID, nil
}

func (r *gormRepository) EnsureProductionInProject(ctx context.Context, projectID uint, productionID uint) error {
	if productionID == 0 {
		return ErrOwnerNotFound
	}
	var production persistencemodel.Production
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&production, productionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if production.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error {
	if blockID == 0 {
		return ErrOwnerNotFound
	}
	var block persistencemodel.ProductionTextBlock
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&block, blockID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if block.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error {
	if segmentID == 0 {
		return ErrOwnerNotFound
	}
	var segment persistencemodel.Segment
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&segment, segmentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if segment.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error {
	if scriptVersionID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.ScriptVersion
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, scriptVersionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	if previewTimelineID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.PreviewTimeline
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, previewTimelineID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	if sceneMomentID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.SceneMoment
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, sceneMomentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	if contentUnitID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.ContentUnit
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, contentUnitID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureCreativeReferenceInProject(ctx context.Context, projectID uint, referenceID uint) error {
	if referenceID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.CreativeReference
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, referenceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureCreativeReferenceStateInProject(ctx context.Context, projectID uint, stateID uint) error {
	if stateID == 0 {
		return ErrOwnerNotFound
	}
	var item persistencemodel.CreativeReferenceState
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, stateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureAssetSlotInProject(ctx context.Context, projectID uint, assetSlotID uint) error {
	return r.ensureProjectScopedModelInProject(ctx, projectID, assetSlotID, &persistencemodel.AssetSlot{})
}

func (r *gormRepository) EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error {
	if ownerID == 0 {
		return ErrOwnerNotFound
	}
	switch strings.TrimSpace(ownerType) {
	case "project":
		var item persistencemodel.Project
		if err := r.db.WithContext(ctx).Select("id").First(&item, ownerID).Error; err != nil {
			return normalizeOwnerError(err)
		}
		if item.ID != projectID {
			return ErrOwnerWrongProject
		}
		return nil
	case "script_version":
		return r.EnsureScriptVersionInProject(ctx, projectID, ownerID)
	case "script_block":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.ScriptBlock{})
	case "segment":
		return r.EnsureSegmentInProject(ctx, projectID, ownerID)
	case "scene_moment":
		return r.EnsureSceneMomentInProject(ctx, projectID, ownerID)
	case "production":
		return r.EnsureProductionInProject(ctx, projectID, ownerID)
	case "production_text_block":
		return r.EnsureProductionTextBlockInProject(ctx, projectID, ownerID)
	case "content_unit":
		return r.EnsureContentUnitInProject(ctx, projectID, ownerID)
	case "keyframe":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.Keyframe{})
	case "preview_timeline":
		return r.EnsurePreviewTimelineInProject(ctx, projectID, ownerID)
	case "creative_reference":
		return r.EnsureCreativeReferenceInProject(ctx, projectID, ownerID)
	case "creative_reference_state":
		return r.EnsureCreativeReferenceStateInProject(ctx, projectID, ownerID)
	case "storyboard_script":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.StoryboardScript{})
	case "storyboard_version":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.StoryboardVersion{})
	case "storyboard_line":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.StoryboardLine{})
	case "asset_slot":
		return r.EnsureAssetSlotInProject(ctx, projectID, ownerID)
	case "asset_slot_candidate":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.AssetSlotCandidate{})
	case "candidate_decision":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.CandidateDecision{})
	case "review_event":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.ReviewEvent{})
	case "work_item":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.WorkItem{})
	case "delivery_version":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.DeliveryVersion{})
	case "canvas_output":
		return r.ensureProjectScopedModelInProject(ctx, projectID, ownerID, &persistencemodel.CanvasOutput{})
	case "canvas":
		return r.EnsureCanvasInProject(ctx, projectID, ownerID)
	case "canvas_run":
		return r.EnsureCanvasRunInProject(ctx, projectID, ownerID)
	case "resource":
		var item persistencemodel.RawResource
		return normalizeOwnerError(r.db.WithContext(ctx).Select("id").First(&item, ownerID).Error)
	default:
		return ErrOwnerInvalidType
	}
}

func (r *gormRepository) EnsureCanvasInProject(ctx context.Context, projectID uint, canvasID uint) error {
	var item persistencemodel.Canvas
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, canvasID).Error; err != nil {
		return normalizeOwnerError(err)
	}
	if item.ProjectID == nil || *item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureCanvasRunInProject(ctx context.Context, projectID uint, runID uint) error {
	var item persistencemodel.CanvasRun
	if err := r.db.WithContext(ctx).Select("id, canvas_id").First(&item, runID).Error; err != nil {
		return normalizeOwnerError(err)
	}
	return r.EnsureCanvasInProject(ctx, projectID, item.CanvasID)
}

func (r *gormRepository) ensureProjectScopedModelInProject(ctx context.Context, projectID uint, id uint, item any) error {
	var row struct {
		ProjectID uint
	}
	if err := r.db.WithContext(ctx).Model(item).Select("project_id").Where("id = ?", id).First(&row).Error; err != nil {
		return normalizeOwnerError(err)
	}
	if row.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) EnsureUserInProject(ctx context.Context, projectID uint, userID uint) error {
	if userID == 0 {
		return ErrInvalidInput{Err: errors.New("user id is required")}
	}
	var count int64
	r.db.WithContext(ctx).Model(&persistencemodel.Project{}).Where("id = ? AND owner_id = ?", projectID, userID).Count(&count)
	if count > 0 {
		return nil
	}
	r.db.WithContext(ctx).Model(&persistencemodel.ProjectMember{}).Where("project_id = ? AND user_id = ?", projectID, userID).Count(&count)
	if count == 0 {
		return ErrInvalidInput{Err: errors.New("执行成员不属于当前项目")}
	}
	return nil
}

func (r *gormRepository) EnsureJobInProject(ctx context.Context, projectID uint, jobID uint) error {
	if jobID == 0 {
		return ErrInvalidInput{Err: errors.New("source job id is required")}
	}
	var job persistencemodel.Job
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&job, jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if job.ProjectID == nil || *job.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func normalizeOwnerError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrOwnerNotFound
	}
	return err
}

func (r *gormRepository) ListProductions(ctx context.Context, filter ProductionFilter) ([]domainsemantic.Production, error) {
	items := make([]persistencemodel.Production, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	if err := q.Order("updated_at desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return productionsFromModels(items), nil
}

func productionsFromModels(items []persistencemodel.Production) []domainsemantic.Production {
	result := make([]domainsemantic.Production, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ProductionFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateProduction(ctx context.Context, item domainsemantic.Production) (domainsemantic.Production, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ProductionFromModel(modelItem), err
	}
	return domainsemantic.ProductionFromModel(modelItem), nil
}

func (r *gormRepository) LoadProduction(ctx context.Context, projectID uint, id string) (domainsemantic.Production, error) {
	var item persistencemodel.Production
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.Production{}, err
	}
	return domainsemantic.ProductionFromModel(item), nil
}

func (r *gormRepository) PatchProduction(ctx context.Context, item domainsemantic.Production, patch domainsemantic.ProductionPatch) (domainsemantic.Production, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, productionPatchColumns(patch)); err != nil {
		return domainsemantic.ProductionFromModel(modelItem), err
	}
	return domainsemantic.ProductionFromModel(modelItem), nil
}

func productionPatchColumns(patch domainsemantic.ProductionPatch) map[string]any {
	updates := map[string]any{
		"progress": patch.Progress,
	}
	if patch.ScriptVersionID != nil {
		updates["script_version_id"] = patch.ScriptVersionID
	}
	if patch.PreviewTimelineID != nil {
		updates["preview_timeline_id"] = patch.PreviewTimelineID
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.SourceType) != "" {
		updates["source_type"] = patch.SourceType
	}
	if strings.TrimSpace(patch.OwnerLabel) != "" {
		updates["owner_label"] = patch.OwnerLabel
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error) {
	items := make([]persistencemodel.ContentUnit, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	if err := q.Order(`segment_id, scene_moment_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return contentUnitsFromModels(items), nil
}

func contentUnitsFromModels(items []persistencemodel.ContentUnit) []domainsemantic.ContentUnit {
	result := make([]domainsemantic.ContentUnit, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ContentUnitFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateContentUnit(ctx context.Context, item domainsemantic.ContentUnit) (domainsemantic.ContentUnit, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ContentUnitFromModel(modelItem), err
	}
	return domainsemantic.ContentUnitFromModel(modelItem), nil
}

func (r *gormRepository) LoadContentUnit(ctx context.Context, projectID uint, id string) (domainsemantic.ContentUnit, error) {
	var item persistencemodel.ContentUnit
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	return domainsemantic.ContentUnitFromModel(item), nil
}

func (r *gormRepository) PatchContentUnit(ctx context.Context, item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) (domainsemantic.ContentUnit, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, contentUnitPatchColumns(patch)); err != nil {
		return domainsemantic.ContentUnitFromModel(modelItem), err
	}
	return domainsemantic.ContentUnitFromModel(modelItem), nil
}

func contentUnitPatchColumns(patch domainsemantic.ContentUnitPatch) map[string]any {
	updates := map[string]any{
		"order":        patch.Order,
		"duration_sec": patch.DurationSec,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if patch.SegmentID != nil {
		updates["segment_id"] = patch.SegmentID
	}
	if patch.SceneMomentID != nil {
		updates["scene_moment_id"] = patch.SceneMomentID
	}
	if patch.ScriptBlockID != nil {
		updates["script_block_id"] = patch.ScriptBlockID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Prompt) != "" {
		updates["prompt"] = patch.Prompt
	}
	if strings.TrimSpace(patch.ShotSize) != "" {
		updates["shot_size"] = patch.ShotSize
	}
	if strings.TrimSpace(patch.CameraAngle) != "" {
		updates["camera_angle"] = patch.CameraAngle
	}
	if strings.TrimSpace(patch.CameraHeight) != "" {
		updates["camera_height"] = patch.CameraHeight
	}
	if strings.TrimSpace(patch.CameraMotion) != "" {
		updates["camera_motion"] = patch.CameraMotion
	}
	if strings.TrimSpace(patch.MotionIntensity) != "" {
		updates["motion_intensity"] = patch.MotionIntensity
	}
	if strings.TrimSpace(patch.CameraSpeed) != "" {
		updates["camera_speed"] = patch.CameraSpeed
	}
	if strings.TrimSpace(patch.Lens) != "" {
		updates["lens"] = patch.Lens
	}
	if strings.TrimSpace(patch.FocalLength) != "" {
		updates["focal_length"] = patch.FocalLength
	}
	if strings.TrimSpace(patch.FocusSubject) != "" {
		updates["focus_subject"] = patch.FocusSubject
	}
	if strings.TrimSpace(patch.CompositionStart) != "" {
		updates["composition_start"] = patch.CompositionStart
	}
	if strings.TrimSpace(patch.CompositionEnd) != "" {
		updates["composition_end"] = patch.CompositionEnd
	}
	if strings.TrimSpace(patch.Stabilization) != "" {
		updates["stabilization"] = patch.Stabilization
	}
	if strings.TrimSpace(patch.CameraParamsJSON) != "" {
		updates["camera_params_json"] = patch.CameraParamsJSON
	}
	if strings.TrimSpace(patch.CameraNotes) != "" {
		updates["camera_notes"] = patch.CameraNotes
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]domainsemantic.Keyframe, error) {
	items := make([]persistencemodel.Keyframe, 0)
	q := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	if filter.ContentUnitID > 0 {
		q = q.Where("content_unit_id = ?", filter.ContentUnitID)
	}
	if err := q.Order(`content_unit_id, scene_moment_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return keyframesFromModels(items), nil
}

func keyframesFromModels(items []persistencemodel.Keyframe) []domainsemantic.Keyframe {
	result := make([]domainsemantic.Keyframe, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.KeyframeFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateKeyframe(ctx context.Context, item domainsemantic.Keyframe) (domainsemantic.Keyframe, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.KeyframeFromModel(modelItem), err
	}
	return domainsemantic.KeyframeFromModel(modelItem), nil
}

func (r *gormRepository) LoadKeyframe(ctx context.Context, projectID uint, id string) (domainsemantic.Keyframe, error) {
	var item persistencemodel.Keyframe
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.Keyframe{}, err
	}
	return domainsemantic.KeyframeFromModel(item), nil
}

func (r *gormRepository) PatchKeyframe(ctx context.Context, item domainsemantic.Keyframe, patch domainsemantic.KeyframePatch) (domainsemantic.Keyframe, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, keyframePatchColumns(patch)); err != nil {
		return domainsemantic.KeyframeFromModel(modelItem), err
	}
	return domainsemantic.KeyframeFromModel(modelItem), nil
}

func keyframePatchColumns(patch domainsemantic.KeyframePatch) map[string]any {
	updates := map[string]any{
		"order": patch.Order,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if patch.SceneMomentID != nil {
		updates["scene_moment_id"] = patch.SceneMomentID
	}
	if patch.ContentUnitID != nil {
		updates["content_unit_id"] = patch.ContentUnitID
	}
	if patch.ResourceID != nil {
		updates["resource_id"] = patch.ResourceID
	}
	if patch.CanvasID != nil {
		updates["canvas_id"] = patch.CanvasID
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Prompt) != "" {
		updates["prompt"] = patch.Prompt
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]domainsemantic.PreviewTimeline, error) {
	items := make([]persistencemodel.PreviewTimeline, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return previewTimelinesFromModels(items), nil
}

func previewTimelinesFromModels(items []persistencemodel.PreviewTimeline) []domainsemantic.PreviewTimeline {
	result := make([]domainsemantic.PreviewTimeline, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.PreviewTimelineFromModel(item))
	}
	return result
}

func (r *gormRepository) CreatePreviewTimeline(ctx context.Context, item domainsemantic.PreviewTimeline) (domainsemantic.PreviewTimeline, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.PreviewTimelineFromModel(modelItem), err
	}
	return domainsemantic.PreviewTimelineFromModel(modelItem), nil
}

func (r *gormRepository) LoadPreviewTimeline(ctx context.Context, projectID uint, id string) (domainsemantic.PreviewTimeline, error) {
	var item persistencemodel.PreviewTimeline
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.PreviewTimeline{}, err
	}
	return domainsemantic.PreviewTimelineFromModel(item), nil
}

func (r *gormRepository) PatchPreviewTimeline(ctx context.Context, item domainsemantic.PreviewTimeline, patch domainsemantic.PreviewTimelinePatch) (domainsemantic.PreviewTimeline, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, previewTimelinePatchColumns(patch)); err != nil {
		return domainsemantic.PreviewTimelineFromModel(modelItem), err
	}
	return domainsemantic.PreviewTimelineFromModel(modelItem), nil
}

func previewTimelinePatchColumns(patch domainsemantic.PreviewTimelinePatch) map[string]any {
	updates := map[string]any{
		"duration_sec": patch.DurationSec,
		"is_primary":   patch.IsPrimary,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if patch.ScriptVersionID != nil {
		updates["script_version_id"] = patch.ScriptVersionID
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]domainsemantic.PreviewTimelineItem, error) {
	items := make([]persistencemodel.PreviewTimelineItem, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.PreviewTimelineID > 0 {
		q = q.Where("preview_timeline_id = ?", filter.PreviewTimelineID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	order := `preview_timeline_id, "order", id`
	if filter.PreviewTimelineID > 0 {
		order = `"order", id`
	}
	if err := q.Order(order).Find(&items).Error; err != nil {
		return nil, err
	}
	return previewTimelineItemsFromModels(items), nil
}

func previewTimelineItemsFromModels(items []persistencemodel.PreviewTimelineItem) []domainsemantic.PreviewTimelineItem {
	result := make([]domainsemantic.PreviewTimelineItem, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.PreviewTimelineItemFromModel(item))
	}
	return result
}

func (r *gormRepository) CreatePreviewTimelineItem(ctx context.Context, item domainsemantic.PreviewTimelineItem) (domainsemantic.PreviewTimelineItem, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.PreviewTimelineItemFromModel(modelItem), err
	}
	return domainsemantic.PreviewTimelineItemFromModel(modelItem), nil
}

func (r *gormRepository) LoadPreviewTimelineItem(ctx context.Context, projectID uint, id string) (domainsemantic.PreviewTimelineItem, error) {
	var item persistencemodel.PreviewTimelineItem
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.PreviewTimelineItem{}, err
	}
	return domainsemantic.PreviewTimelineItemFromModel(item), nil
}

func (r *gormRepository) PatchPreviewTimelineItem(ctx context.Context, item domainsemantic.PreviewTimelineItem, patch domainsemantic.PreviewTimelineItemPatch) (domainsemantic.PreviewTimelineItem, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, previewTimelineItemPatchColumns(patch)); err != nil {
		return domainsemantic.PreviewTimelineItemFromModel(modelItem), err
	}
	return domainsemantic.PreviewTimelineItemFromModel(modelItem), nil
}

func previewTimelineItemPatchColumns(patch domainsemantic.PreviewTimelineItemPatch) map[string]any {
	updates := map[string]any{
		"order":        patch.Order,
		"start_sec":    patch.StartSec,
		"duration_sec": patch.DurationSec,
	}
	if patch.PreviewTimelineID > 0 {
		updates["preview_timeline_id"] = patch.PreviewTimelineID
	}
	if patch.SegmentID != nil {
		updates["segment_id"] = patch.SegmentID
	}
	if patch.SceneMomentID != nil {
		updates["scene_moment_id"] = patch.SceneMomentID
	}
	if patch.ContentUnitID != nil {
		updates["content_unit_id"] = patch.ContentUnitID
	}
	if patch.KeyframeID != nil {
		updates["keyframe_id"] = patch.KeyframeID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Label) != "" {
		updates["label"] = patch.Label
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]domainsemantic.StoryboardScript, error) {
	items := make([]persistencemodel.StoryboardScript, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptVersionID > 0 {
		q = q.Where("script_version_id = ?", filter.ScriptVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return storyboardScriptsFromModels(items), nil
}

func storyboardScriptsFromModels(items []persistencemodel.StoryboardScript) []domainsemantic.StoryboardScript {
	result := make([]domainsemantic.StoryboardScript, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.StoryboardScriptFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateStoryboardScript(ctx context.Context, item domainsemantic.StoryboardScript) (domainsemantic.StoryboardScript, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.StoryboardScriptFromModel(modelItem), err
	}
	return domainsemantic.StoryboardScriptFromModel(modelItem), nil
}

func (r *gormRepository) LoadStoryboardScript(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardScript, error) {
	var item persistencemodel.StoryboardScript
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.StoryboardScript{}, err
	}
	return domainsemantic.StoryboardScriptFromModel(item), nil
}

func (r *gormRepository) PatchStoryboardScript(ctx context.Context, item domainsemantic.StoryboardScript, patch domainsemantic.StoryboardScriptPatch) (domainsemantic.StoryboardScript, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, storyboardScriptPatchColumns(patch)); err != nil {
		return domainsemantic.StoryboardScriptFromModel(modelItem), err
	}
	return domainsemantic.StoryboardScriptFromModel(modelItem), nil
}

func storyboardScriptPatchColumns(patch domainsemantic.StoryboardScriptPatch) map[string]any {
	updates := map[string]any{
		"is_primary": patch.IsPrimary,
	}
	if patch.ScriptVersionID != nil {
		updates["script_version_id"] = patch.ScriptVersionID
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]domainsemantic.StoryboardVersion, error) {
	items := make([]persistencemodel.StoryboardVersion, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.StoryboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", filter.StoryboardScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("storyboard_script_id, version_number desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return storyboardVersionsFromModels(items), nil
}

func storyboardVersionsFromModels(items []persistencemodel.StoryboardVersion) []domainsemantic.StoryboardVersion {
	result := make([]domainsemantic.StoryboardVersion, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.StoryboardVersionFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateStoryboardVersion(ctx context.Context, item domainsemantic.StoryboardVersion) (domainsemantic.StoryboardVersion, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.StoryboardVersionFromModel(modelItem), err
	}
	return domainsemantic.StoryboardVersionFromModel(modelItem), nil
}

func (r *gormRepository) LoadStoryboardVersion(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardVersion, error) {
	var item persistencemodel.StoryboardVersion
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.StoryboardVersion{}, err
	}
	return domainsemantic.StoryboardVersionFromModel(item), nil
}

func (r *gormRepository) PatchStoryboardVersion(ctx context.Context, item domainsemantic.StoryboardVersion, patch domainsemantic.StoryboardVersionPatch) (domainsemantic.StoryboardVersion, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, storyboardVersionPatchColumns(patch)); err != nil {
		return domainsemantic.StoryboardVersionFromModel(modelItem), err
	}
	return domainsemantic.StoryboardVersionFromModel(modelItem), nil
}

func storyboardVersionPatchColumns(patch domainsemantic.StoryboardVersionPatch) map[string]any {
	updates := map[string]any{}
	if patch.ParentVersionID != nil {
		updates["parent_version_id"] = patch.ParentVersionID
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Source) != "" {
		updates["source"] = patch.Source
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.SnapshotJSON) != "" {
		updates["snapshot_json"] = patch.SnapshotJSON
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]domainsemantic.StoryboardLine, error) {
	items := make([]persistencemodel.StoryboardLine, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.StoryboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", filter.StoryboardScriptID)
	}
	if filter.StoryboardVersionID > 0 {
		q = q.Where("storyboard_version_id = ?", filter.StoryboardVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`storyboard_script_id, storyboard_version_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return storyboardLinesFromModels(items), nil
}

func storyboardLinesFromModels(items []persistencemodel.StoryboardLine) []domainsemantic.StoryboardLine {
	result := make([]domainsemantic.StoryboardLine, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.StoryboardLineFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateStoryboardLine(ctx context.Context, item domainsemantic.StoryboardLine) (domainsemantic.StoryboardLine, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.StoryboardLineFromModel(modelItem), err
	}
	return domainsemantic.StoryboardLineFromModel(modelItem), nil
}

func (r *gormRepository) LoadStoryboardLine(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardLine, error) {
	var item persistencemodel.StoryboardLine
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.StoryboardLine{}, err
	}
	return domainsemantic.StoryboardLineFromModel(item), nil
}

func (r *gormRepository) PatchStoryboardLine(ctx context.Context, item domainsemantic.StoryboardLine, patch domainsemantic.StoryboardLinePatch) (domainsemantic.StoryboardLine, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, storyboardLinePatchColumns(patch)); err != nil {
		return domainsemantic.StoryboardLineFromModel(modelItem), err
	}
	return domainsemantic.StoryboardLineFromModel(modelItem), nil
}

func storyboardLinePatchColumns(patch domainsemantic.StoryboardLinePatch) map[string]any {
	updates := map[string]any{
		"storyboard_script_id": patch.StoryboardScriptID,
		"order":                patch.Order,
		"duration_sec":         patch.DurationSec,
	}
	if patch.StoryboardVersionID != nil {
		updates["storyboard_version_id"] = patch.StoryboardVersionID
	}
	if patch.SegmentID != nil {
		updates["segment_id"] = patch.SegmentID
	}
	if patch.SceneMomentID != nil {
		updates["scene_moment_id"] = patch.SceneMomentID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Dialogue) != "" {
		updates["dialogue"] = patch.Dialogue
	}
	if strings.TrimSpace(patch.VisualIntent) != "" {
		updates["visual_intent"] = patch.VisualIntent
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) NextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	var maxVersion int
	r.db.WithContext(ctx).
		Model(&persistencemodel.StoryboardVersion{}).
		Where("project_id = ? AND storyboard_script_id = ?", projectID, storyboardScriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

func (r *gormRepository) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]domainsemantic.WorkItem, error) {
	items := make([]persistencemodel.WorkItem, 0)
	q := r.db.WithContext(ctx).Preload("Assignee").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("status, priority desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return workItemsFromModels(items), nil
}

func workItemsFromModels(items []persistencemodel.WorkItem) []domainsemantic.WorkItem {
	result := make([]domainsemantic.WorkItem, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.WorkItemFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateWorkItem(ctx context.Context, item domainsemantic.WorkItem) (domainsemantic.WorkItem, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.WorkItemFromModel(modelItem), err
	}
	return domainsemantic.WorkItemFromModel(modelItem), nil
}

func (r *gormRepository) LoadWorkItem(ctx context.Context, projectID uint, id string) (domainsemantic.WorkItem, error) {
	var item persistencemodel.WorkItem
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.WorkItem{}, err
	}
	return domainsemantic.WorkItemFromModel(item), nil
}

func (r *gormRepository) PatchWorkItem(ctx context.Context, item domainsemantic.WorkItem, patch domainsemantic.WorkItemPatch) (domainsemantic.WorkItem, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, workItemPatchColumns(item, patch)); err != nil {
		return domainsemantic.WorkItemFromModel(modelItem), err
	}
	return domainsemantic.WorkItemFromModel(modelItem), nil
}

func workItemPatchColumns(item domainsemantic.WorkItem, patch domainsemantic.WorkItemPatch) map[string]any {
	updates := map[string]any{
		"target_id": patch.TargetID,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if strings.TrimSpace(patch.TargetType) != "" {
		updates["target_type"] = patch.TargetType
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Title) != "" {
		updates["title"] = patch.Title
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Priority) != "" {
		updates["priority"] = patch.Priority
	}
	if patch.AssigneeID != nil {
		updates["assignee_id"] = patch.AssigneeID
	}
	if patch.SourceJobID != nil {
		updates["source_job_id"] = patch.SourceJobID
	}
	if patch.SourceCanvasID != nil {
		updates["source_canvas_id"] = patch.SourceCanvasID
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	if strings.TrimSpace(patch.ResultType) != "" || strings.TrimSpace(patch.ResultJSON) != "" {
		updates["result_type"] = domainsemantic.FallbackString(patch.ResultType, item.ResultType)
		updates["result_json"] = patch.ResultJSON
		updates["apply_status"] = domainsemantic.ApplyStatusForWorkItemPatch(item, patch)
		updates["applied_at"] = patch.AppliedAt
		updates["apply_error"] = patch.ApplyError
	}
	return updates
}

func (r *gormRepository) DeleteWorkItem(ctx context.Context, item domainsemantic.WorkItem) error {
	modelItem := item.ToModel()
	return r.deleteItem(ctx, &modelItem)
}

func (r *gormRepository) ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]domainsemantic.WorkReview, error) {
	items := make([]persistencemodel.WorkReview, 0)
	q := r.db.WithContext(ctx).Preload("Reviewer").Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("work_item_id, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return workReviewsFromModels(items), nil
}

func workReviewsFromModels(items []persistencemodel.WorkReview) []domainsemantic.WorkReview {
	result := make([]domainsemantic.WorkReview, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.WorkReviewFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateWorkReview(ctx context.Context, item domainsemantic.WorkReview) (domainsemantic.WorkReview, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.WorkReviewFromModel(modelItem), err
	}
	return domainsemantic.WorkReviewFromModel(modelItem), nil
}

func (r *gormRepository) LoadWorkReview(ctx context.Context, projectID uint, id string) (domainsemantic.WorkReview, error) {
	var item persistencemodel.WorkReview
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.WorkReview{}, err
	}
	return domainsemantic.WorkReviewFromModel(item), nil
}

func (r *gormRepository) PatchWorkReview(ctx context.Context, item domainsemantic.WorkReview, patch domainsemantic.WorkReviewPatch) (domainsemantic.WorkReview, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, workReviewPatchColumns(patch)); err != nil {
		return domainsemantic.WorkReviewFromModel(modelItem), err
	}
	return domainsemantic.WorkReviewFromModel(modelItem), nil
}

func workReviewPatchColumns(patch domainsemantic.WorkReviewPatch) map[string]any {
	updates := map[string]any{
		"work_item_id": patch.WorkItemID,
	}
	if patch.ReviewerID != nil {
		updates["reviewer_id"] = patch.ReviewerID
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Comment) != "" {
		updates["comment"] = patch.Comment
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) DeleteWorkReview(ctx context.Context, item domainsemantic.WorkReview) error {
	modelItem := item.ToModel()
	return r.deleteItem(ctx, &modelItem)
}

func (r *gormRepository) ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]domainsemantic.WorkDependency, error) {
	items := make([]persistencemodel.WorkDependency, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	if err := q.Order("work_item_id, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return workDependenciesFromModels(items), nil
}

func workDependenciesFromModels(items []persistencemodel.WorkDependency) []domainsemantic.WorkDependency {
	result := make([]domainsemantic.WorkDependency, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.WorkDependencyFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateWorkDependency(ctx context.Context, item domainsemantic.WorkDependency) (domainsemantic.WorkDependency, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.WorkDependencyFromModel(modelItem), err
	}
	return domainsemantic.WorkDependencyFromModel(modelItem), nil
}

func (r *gormRepository) LoadWorkDependency(ctx context.Context, projectID uint, id string) (domainsemantic.WorkDependency, error) {
	var item persistencemodel.WorkDependency
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.WorkDependency{}, err
	}
	return domainsemantic.WorkDependencyFromModel(item), nil
}

func (r *gormRepository) PatchWorkDependency(ctx context.Context, item domainsemantic.WorkDependency, patch domainsemantic.WorkDependencyPatch) (domainsemantic.WorkDependency, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, workDependencyPatchColumns(patch)); err != nil {
		return domainsemantic.WorkDependencyFromModel(modelItem), err
	}
	return domainsemantic.WorkDependencyFromModel(modelItem), nil
}

func workDependencyPatchColumns(patch domainsemantic.WorkDependencyPatch) map[string]any {
	updates := map[string]any{
		"work_item_id":            patch.WorkItemID,
		"depends_on_work_item_id": patch.DependsOnWorkItemID,
	}
	if strings.TrimSpace(patch.DependencyType) != "" {
		updates["dependency_type"] = patch.DependencyType
	}
	return updates
}

func (r *gormRepository) DeleteWorkDependency(ctx context.Context, item domainsemantic.WorkDependency) error {
	modelItem := item.ToModel()
	return r.deleteItem(ctx, &modelItem)
}

func (r *gormRepository) CompleteWorkItem(ctx context.Context, projectID uint, item domainsemantic.WorkItem, patch domainsemantic.WorkItemPatch, actorID *uint) (domainsemantic.WorkItem, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	var applyErr error
	modelItem := item.ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		next := domainsemantic.WorkItemFromModel(modelItem)
		domainsemantic.ApplyWorkItemUpdates(&next, workItemPatchColumns(item, patch))
		domainsemantic.PrepareWorkItemResultApplication(&next)
		nextModel := next.ToModel()
		if err := tx.Save(&nextModel).Error; err != nil {
			return err
		}
		if err := entityrelation.SyncCoreEntityRelations(tx, &nextModel); err != nil {
			return err
		}
		if next.ResultType != domainsemantic.WorkItemResultNone {
			applyErr = applyWorkItemResult(tx, projectID, next, actorID, now)
			if applyErr != nil {
				return applyErr
			}
			domainsemantic.MarkWorkItemResultApplied(&next, now)
			nextModel = next.ToModel()
			if err := tx.Save(&nextModel).Error; err != nil {
				return err
			}
			if err := entityrelation.SyncCoreEntityRelations(tx, &nextModel); err != nil {
				return err
			}
		}
		modelItem = nextModel
		return nil
	})
	if err != nil {
		if applyErr != nil {
			failed := item
			domainsemantic.MarkWorkItemResultApplyFailed(&failed, applyErr.Error())
			failedModel := failed.ToModel()
			_ = saveCoreEntityWithRelations(r.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true}), &failedModel)
			return domainsemantic.WorkItemFromModel(failedModel), ErrInvalidInput{Err: applyErr}
		}
		return domainsemantic.WorkItemFromModel(modelItem), err
	}
	if err := r.db.WithContext(ctx).Preload("Assignee").First(&modelItem, modelItem.ID).Error; err != nil {
		return domainsemantic.WorkItemFromModel(modelItem), err
	}
	return domainsemantic.WorkItemFromModel(modelItem), nil
}

func (r *gormRepository) ListDeliveryVersions(ctx context.Context, filter DeliveryVersionFilter) ([]domainsemantic.DeliveryVersion, error) {
	items := make([]persistencemodel.DeliveryVersion, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return deliveryVersionsFromModels(items), nil
}

func deliveryVersionsFromModels(items []persistencemodel.DeliveryVersion) []domainsemantic.DeliveryVersion {
	result := make([]domainsemantic.DeliveryVersion, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.DeliveryVersionFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateDeliveryVersion(ctx context.Context, item domainsemantic.DeliveryVersion) (domainsemantic.DeliveryVersion, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.DeliveryVersionFromModel(modelItem), err
	}
	return domainsemantic.DeliveryVersionFromModel(modelItem), nil
}

func (r *gormRepository) LoadDeliveryVersion(ctx context.Context, projectID uint, id string) (domainsemantic.DeliveryVersion, error) {
	var item persistencemodel.DeliveryVersion
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.DeliveryVersion{}, err
	}
	return domainsemantic.DeliveryVersionFromModel(item), nil
}

func (r *gormRepository) PatchDeliveryVersion(ctx context.Context, item domainsemantic.DeliveryVersion, patch domainsemantic.DeliveryVersionPatch) (domainsemantic.DeliveryVersion, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, deliveryVersionPatchColumns(patch)); err != nil {
		return domainsemantic.DeliveryVersionFromModel(modelItem), err
	}
	return domainsemantic.DeliveryVersionFromModel(modelItem), nil
}

func deliveryVersionPatchColumns(patch domainsemantic.DeliveryVersionPatch) map[string]any {
	updates := map[string]any{
		"is_primary":   patch.IsPrimary,
		"duration_sec": patch.DurationSec,
	}
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if patch.PreviewTimelineID != nil {
		updates["preview_timeline_id"] = patch.PreviewTimelineID
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListDeliveryTimelineItems(ctx context.Context, filter DeliveryTimelineItemFilter) ([]domainsemantic.DeliveryTimelineItem, error) {
	items := make([]persistencemodel.DeliveryTimelineItem, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.DeliveryVersionID > 0 {
		q = q.Where("delivery_version_id = ?", filter.DeliveryVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`delivery_version_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return deliveryTimelineItemsFromModels(items), nil
}

func deliveryTimelineItemsFromModels(items []persistencemodel.DeliveryTimelineItem) []domainsemantic.DeliveryTimelineItem {
	result := make([]domainsemantic.DeliveryTimelineItem, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.DeliveryTimelineItemFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateDeliveryTimelineItem(ctx context.Context, item domainsemantic.DeliveryTimelineItem) (domainsemantic.DeliveryTimelineItem, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.DeliveryTimelineItemFromModel(modelItem), err
	}
	return domainsemantic.DeliveryTimelineItemFromModel(modelItem), nil
}

func (r *gormRepository) LoadDeliveryTimelineItem(ctx context.Context, projectID uint, id string) (domainsemantic.DeliveryTimelineItem, error) {
	var item persistencemodel.DeliveryTimelineItem
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.DeliveryTimelineItem{}, err
	}
	return domainsemantic.DeliveryTimelineItemFromModel(item), nil
}

func (r *gormRepository) PatchDeliveryTimelineItem(ctx context.Context, item domainsemantic.DeliveryTimelineItem, patch domainsemantic.DeliveryTimelineItemPatch) (domainsemantic.DeliveryTimelineItem, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, deliveryTimelineItemPatchColumns(patch)); err != nil {
		return domainsemantic.DeliveryTimelineItemFromModel(modelItem), err
	}
	return domainsemantic.DeliveryTimelineItemFromModel(modelItem), nil
}

func deliveryTimelineItemPatchColumns(patch domainsemantic.DeliveryTimelineItemPatch) map[string]any {
	updates := map[string]any{
		"delivery_version_id": patch.DeliveryVersionID,
		"order":               patch.Order,
		"start_sec":           patch.StartSec,
		"duration_sec":        patch.DurationSec,
	}
	if patch.ContentUnitID != nil {
		updates["content_unit_id"] = patch.ContentUnitID
	}
	if patch.AssetSlotID != nil {
		updates["asset_slot_id"] = patch.AssetSlotID
	}
	if patch.ResourceID != nil {
		updates["resource_id"] = patch.ResourceID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Label) != "" {
		updates["label"] = patch.Label
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListExportRecords(ctx context.Context, filter ExportRecordFilter) ([]domainsemantic.ExportRecord, error) {
	items := make([]persistencemodel.ExportRecord, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.DeliveryVersionID > 0 {
		q = q.Where("delivery_version_id = ?", filter.DeliveryVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("delivery_version_id, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return exportRecordsFromModels(items), nil
}

func exportRecordsFromModels(items []persistencemodel.ExportRecord) []domainsemantic.ExportRecord {
	result := make([]domainsemantic.ExportRecord, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ExportRecordFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateExportRecord(ctx context.Context, item domainsemantic.ExportRecord) (domainsemantic.ExportRecord, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ExportRecordFromModel(modelItem), err
	}
	return domainsemantic.ExportRecordFromModel(modelItem), nil
}

func (r *gormRepository) LoadExportRecord(ctx context.Context, projectID uint, id string) (domainsemantic.ExportRecord, error) {
	var item persistencemodel.ExportRecord
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ExportRecord{}, err
	}
	return domainsemantic.ExportRecordFromModel(item), nil
}

func (r *gormRepository) PatchExportRecord(ctx context.Context, item domainsemantic.ExportRecord, patch domainsemantic.ExportRecordPatch) (domainsemantic.ExportRecord, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, exportRecordPatchColumns(patch)); err != nil {
		return domainsemantic.ExportRecordFromModel(modelItem), err
	}
	return domainsemantic.ExportRecordFromModel(modelItem), nil
}

func exportRecordPatchColumns(patch domainsemantic.ExportRecordPatch) map[string]any {
	updates := map[string]any{
		"delivery_version_id": patch.DeliveryVersionID,
	}
	if patch.ResourceID != nil {
		updates["resource_id"] = patch.ResourceID
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Format) != "" {
		updates["format"] = patch.Format
	}
	if strings.TrimSpace(patch.Preset) != "" {
		updates["preset"] = patch.Preset
	}
	if strings.TrimSpace(patch.Error) != "" {
		updates["error"] = patch.Error
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListCanvasOutputs(ctx context.Context, filter CanvasOutputFilter) ([]domainsemantic.CanvasOutput, error) {
	items := make([]persistencemodel.CanvasOutput, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.CanvasID > 0 {
		q = q.Where("canvas_id = ?", filter.CanvasID)
	}
	if ownerType := strings.TrimSpace(filter.OwnerType); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("canvas_id, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return canvasOutputsFromModels(items), nil
}

func canvasOutputsFromModels(items []persistencemodel.CanvasOutput) []domainsemantic.CanvasOutput {
	result := make([]domainsemantic.CanvasOutput, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CanvasOutputFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCanvasOutput(ctx context.Context, item domainsemantic.CanvasOutput) (domainsemantic.CanvasOutput, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CanvasOutputFromModel(modelItem), err
	}
	return domainsemantic.CanvasOutputFromModel(modelItem), nil
}

func (r *gormRepository) LoadCanvasOutput(ctx context.Context, projectID uint, id string) (domainsemantic.CanvasOutput, error) {
	var item persistencemodel.CanvasOutput
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CanvasOutput{}, err
	}
	return domainsemantic.CanvasOutputFromModel(item), nil
}

func (r *gormRepository) PatchCanvasOutput(ctx context.Context, item domainsemantic.CanvasOutput, patch domainsemantic.CanvasOutputPatch) (domainsemantic.CanvasOutput, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, canvasOutputPatchColumns(patch)); err != nil {
		return domainsemantic.CanvasOutputFromModel(modelItem), err
	}
	return domainsemantic.CanvasOutputFromModel(modelItem), nil
}

func canvasOutputPatchColumns(patch domainsemantic.CanvasOutputPatch) map[string]any {
	updates := map[string]any{
		"canvas_id": patch.CanvasID,
		"owner_id":  patch.OwnerID,
	}
	if patch.CanvasRunID != nil {
		updates["canvas_run_id"] = patch.CanvasRunID
	}
	if strings.TrimSpace(patch.CanvasNodeID) != "" {
		updates["canvas_node_id"] = patch.CanvasNodeID
	}
	if strings.TrimSpace(patch.PortID) != "" {
		updates["port_id"] = patch.PortID
	}
	if strings.TrimSpace(patch.OwnerType) != "" {
		updates["owner_type"] = patch.OwnerType
	}
	if strings.TrimSpace(patch.OutputType) != "" {
		updates["output_type"] = patch.OutputType
	}
	if patch.ResourceID != nil {
		updates["resource_id"] = patch.ResourceID
	}
	if strings.TrimSpace(patch.TargetField) != "" {
		updates["target_field"] = patch.TargetField
	}
	if strings.TrimSpace(patch.ValueJSON) != "" {
		updates["value_json"] = patch.ValueJSON
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListAssetSlots(ctx context.Context, filter AssetSlotFilter) ([]domainsemantic.AssetSlot, error) {
	items := make([]persistencemodel.AssetSlot, 0)
	q := r.db.WithContext(ctx).Preload("Resource").Preload("LockedAssetSlot.Resource").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if ownerType := strings.TrimSpace(filter.OwnerType); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	} else if !truthyFilter(filter.IncludeInternal) {
		q = q.Where("owner_type <> ? OR owner_type IS NULL OR owner_type = ''", "asset_slot")
	}
	if err := q.Order("status, priority desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return assetSlotsFromModels(items), nil
}

func assetSlotsFromModels(items []persistencemodel.AssetSlot) []domainsemantic.AssetSlot {
	result := make([]domainsemantic.AssetSlot, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.AssetSlotFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateAssetSlot(ctx context.Context, item domainsemantic.AssetSlot) (domainsemantic.AssetSlot, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.AssetSlotFromModel(modelItem), err
	}
	return domainsemantic.AssetSlotFromModel(modelItem), nil
}

func (r *gormRepository) LoadAssetSlot(ctx context.Context, projectID uint, id string) (domainsemantic.AssetSlot, error) {
	var item persistencemodel.AssetSlot
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.AssetSlot{}, err
	}
	return domainsemantic.AssetSlotFromModel(item), nil
}

func (r *gormRepository) PatchAssetSlot(ctx context.Context, item domainsemantic.AssetSlot, patch domainsemantic.AssetSlotPatch) (domainsemantic.AssetSlot, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, assetSlotPatchColumns(patch)); err != nil {
		return domainsemantic.AssetSlotFromModel(modelItem), err
	}
	if err := r.db.WithContext(ctx).Preload("Resource").Preload("LockedAssetSlot.Resource").First(&modelItem, modelItem.ID).Error; err != nil {
		return domainsemantic.AssetSlotFromModel(modelItem), err
	}
	return domainsemantic.AssetSlotFromModel(modelItem), nil
}

func assetSlotPatchColumns(patch domainsemantic.AssetSlotPatch) map[string]any {
	updates := make(map[string]any)
	if patch.ProductionID != nil {
		updates["production_id"] = patch.ProductionID
	}
	if patch.CreativeReferenceID != nil {
		updates["creative_reference_id"] = patch.CreativeReferenceID
	}
	if patch.CreativeReferenceStateID != nil {
		updates["creative_reference_state_id"] = patch.CreativeReferenceStateID
	}
	if strings.TrimSpace(patch.OwnerType) != "" {
		updates["owner_type"] = patch.OwnerType
	}
	if patch.OwnerID != nil {
		updates["owner_id"] = patch.OwnerID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.SlotKey) != "" {
		updates["slot_key"] = patch.SlotKey
	}
	if strings.TrimSpace(patch.PromptHint) != "" {
		updates["prompt_hint"] = patch.PromptHint
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Priority) != "" {
		updates["priority"] = patch.Priority
	}
	if patch.ResourceID != nil {
		updates["resource_id"] = patch.ResourceID
	}
	if patch.LockedAssetSlotID != nil {
		updates["locked_asset_slot_id"] = patch.LockedAssetSlotID
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListAssetSlotCandidates(ctx context.Context, filter AssetSlotCandidateFilter) ([]domainsemantic.AssetSlotCandidate, error) {
	items := make([]persistencemodel.AssetSlotCandidate, 0)
	q := r.db.WithContext(ctx).Preload("CandidateAssetSlot.Resource").Where("project_id = ?", filter.ProjectID)
	if filter.AssetSlotID > 0 {
		q = q.Where("asset_slot_id = ?", filter.AssetSlotID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("asset_slot_id, score desc, id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return assetSlotCandidatesFromModels(items), nil
}

func assetSlotCandidatesFromModels(items []persistencemodel.AssetSlotCandidate) []domainsemantic.AssetSlotCandidate {
	result := make([]domainsemantic.AssetSlotCandidate, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.AssetSlotCandidateFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateAssetSlotCandidate(ctx context.Context, item domainsemantic.AssetSlotCandidate) (domainsemantic.AssetSlotCandidate, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.AssetSlotCandidateFromModel(modelItem), err
	}
	return domainsemantic.AssetSlotCandidateFromModel(modelItem), nil
}

func (r *gormRepository) LoadAssetSlotCandidate(ctx context.Context, projectID uint, id string) (domainsemantic.AssetSlotCandidate, error) {
	var item persistencemodel.AssetSlotCandidate
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.AssetSlotCandidate{}, err
	}
	return domainsemantic.AssetSlotCandidateFromModel(item), nil
}

func (r *gormRepository) PatchAssetSlotCandidate(ctx context.Context, item domainsemantic.AssetSlotCandidate, patch domainsemantic.AssetSlotCandidatePatch) (domainsemantic.AssetSlotCandidate, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, assetSlotCandidatePatchColumns(patch)); err != nil {
		return domainsemantic.AssetSlotCandidateFromModel(modelItem), err
	}
	if err := r.db.WithContext(ctx).Preload("CandidateAssetSlot.Resource").First(&modelItem, modelItem.ID).Error; err != nil {
		return domainsemantic.AssetSlotCandidateFromModel(modelItem), err
	}
	return domainsemantic.AssetSlotCandidateFromModel(modelItem), nil
}

func assetSlotCandidatePatchColumns(patch domainsemantic.AssetSlotCandidatePatch) map[string]any {
	updates := map[string]any{
		"asset_slot_id":           patch.AssetSlotID,
		"candidate_asset_slot_id": patch.CandidateAssetSlotID,
		"score":                   patch.Score,
	}
	if strings.TrimSpace(patch.SourceType) != "" {
		updates["source_type"] = patch.SourceType
	}
	if patch.SourceID != nil {
		updates["source_id"] = patch.SourceID
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Note) != "" {
		updates["note"] = patch.Note
	}
	return updates
}

func (r *gormRepository) AttachAssetSlotCandidate(ctx context.Context, input workflowio.AttachAssetSlotCandidateInput) (workflowio.AttachAssetSlotCandidateResult, error) {
	return workflowio.NewEntityIOService(r.db).AttachAssetSlotCandidate(ctx, input)
}

func (r *gormRepository) ReloadAssetSlotCandidate(ctx context.Context, candidate domainsemantic.AssetSlotCandidate) (domainsemantic.AssetSlotCandidate, error) {
	modelItem := candidate.ToModel()
	if err := r.db.WithContext(ctx).Preload("CandidateAssetSlot.Resource").First(&modelItem, modelItem.ID).Error; err != nil {
		return domainsemantic.AssetSlotCandidateFromModel(modelItem), err
	}
	return domainsemantic.AssetSlotCandidateFromModel(modelItem), nil
}

func (r *gormRepository) ListCandidateDecisions(ctx context.Context, filter CandidateDecisionFilter) ([]domainsemantic.CandidateDecision, error) {
	items := make([]persistencemodel.CandidateDecision, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if candidateType := strings.TrimSpace(filter.CandidateType); candidateType != "" {
		q = q.Where("candidate_type = ?", candidateType)
	}
	if filter.CandidateID > 0 {
		q = q.Where("candidate_id = ?", filter.CandidateID)
	}
	if candidateClientID := strings.TrimSpace(filter.CandidateClientID); candidateClientID != "" {
		q = q.Where("candidate_client_id = ?", candidateClientID)
	}
	if decision := strings.TrimSpace(filter.Decision); decision != "" {
		q = q.Where("decision = ?", decision)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return candidateDecisionsFromModels(items), nil
}

func candidateDecisionsFromModels(items []persistencemodel.CandidateDecision) []domainsemantic.CandidateDecision {
	result := make([]domainsemantic.CandidateDecision, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CandidateDecisionFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCandidateDecision(ctx context.Context, item domainsemantic.CandidateDecision) (domainsemantic.CandidateDecision, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CandidateDecisionFromModel(modelItem), err
	}
	return domainsemantic.CandidateDecisionFromModel(modelItem), nil
}

func (r *gormRepository) LoadCandidateDecision(ctx context.Context, projectID uint, id string) (domainsemantic.CandidateDecision, error) {
	var item persistencemodel.CandidateDecision
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CandidateDecision{}, err
	}
	return domainsemantic.CandidateDecisionFromModel(item), nil
}

func (r *gormRepository) PatchCandidateDecision(ctx context.Context, item domainsemantic.CandidateDecision, patch domainsemantic.CandidateDecisionPatch) (domainsemantic.CandidateDecision, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, candidateDecisionPatchColumns(patch)); err != nil {
		return domainsemantic.CandidateDecisionFromModel(modelItem), err
	}
	return domainsemantic.CandidateDecisionFromModel(modelItem), nil
}

func candidateDecisionPatchColumns(patch domainsemantic.CandidateDecisionPatch) map[string]any {
	updates := make(map[string]any)
	if strings.TrimSpace(patch.CandidateType) != "" {
		updates["candidate_type"] = patch.CandidateType
	}
	if patch.CandidateID != nil {
		updates["candidate_id"] = patch.CandidateID
	}
	if strings.TrimSpace(patch.CandidateClientID) != "" {
		updates["candidate_client_id"] = patch.CandidateClientID
	}
	if strings.TrimSpace(patch.TargetType) != "" {
		updates["target_type"] = patch.TargetType
	}
	if patch.TargetID != nil {
		updates["target_id"] = patch.TargetID
	}
	if strings.TrimSpace(patch.Decision) != "" {
		updates["decision"] = patch.Decision
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Reason) != "" {
		updates["reason"] = patch.Reason
	}
	if strings.TrimSpace(patch.Note) != "" {
		updates["note"] = patch.Note
	}
	if strings.TrimSpace(patch.Source) != "" {
		updates["source"] = patch.Source
	}
	if patch.DecidedByID != nil {
		updates["decided_by_id"] = patch.DecidedByID
	}
	if strings.TrimSpace(patch.AppliedAt) != "" {
		updates["applied_at"] = patch.AppliedAt
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListReviewEvents(ctx context.Context, filter ReviewEventFilter) ([]domainsemantic.ReviewEvent, error) {
	items := make([]persistencemodel.ReviewEvent, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if subjectType := strings.TrimSpace(filter.SubjectType); subjectType != "" {
		q = q.Where("subject_type = ?", subjectType)
	}
	if filter.SubjectID > 0 {
		q = q.Where("subject_id = ?", filter.SubjectID)
	}
	if subjectClientID := strings.TrimSpace(filter.SubjectClientID); subjectClientID != "" {
		q = q.Where("subject_client_id = ?", subjectClientID)
	}
	if eventType := strings.TrimSpace(filter.EventType); eventType != "" {
		q = q.Where("event_type = ?", eventType)
	}
	if err := q.Order("id desc").Find(&items).Error; err != nil {
		return nil, err
	}
	return reviewEventsFromModels(items), nil
}

func reviewEventsFromModels(items []persistencemodel.ReviewEvent) []domainsemantic.ReviewEvent {
	result := make([]domainsemantic.ReviewEvent, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.ReviewEventFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateReviewEvent(ctx context.Context, item domainsemantic.ReviewEvent) (domainsemantic.ReviewEvent, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.ReviewEventFromModel(modelItem), err
	}
	return domainsemantic.ReviewEventFromModel(modelItem), nil
}

func (r *gormRepository) LoadReviewEvent(ctx context.Context, projectID uint, id string) (domainsemantic.ReviewEvent, error) {
	var item persistencemodel.ReviewEvent
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.ReviewEvent{}, err
	}
	return domainsemantic.ReviewEventFromModel(item), nil
}

func (r *gormRepository) PatchReviewEvent(ctx context.Context, item domainsemantic.ReviewEvent, patch domainsemantic.ReviewEventPatch) (domainsemantic.ReviewEvent, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, reviewEventPatchColumns(patch)); err != nil {
		return domainsemantic.ReviewEventFromModel(modelItem), err
	}
	return domainsemantic.ReviewEventFromModel(modelItem), nil
}

func reviewEventPatchColumns(patch domainsemantic.ReviewEventPatch) map[string]any {
	updates := make(map[string]any)
	if strings.TrimSpace(patch.SubjectType) != "" {
		updates["subject_type"] = patch.SubjectType
	}
	if patch.SubjectID != nil {
		updates["subject_id"] = patch.SubjectID
	}
	if strings.TrimSpace(patch.SubjectClientID) != "" {
		updates["subject_client_id"] = patch.SubjectClientID
	}
	if strings.TrimSpace(patch.EventType) != "" {
		updates["event_type"] = patch.EventType
	}
	if strings.TrimSpace(patch.FromStatus) != "" {
		updates["from_status"] = patch.FromStatus
	}
	if strings.TrimSpace(patch.ToStatus) != "" {
		updates["to_status"] = patch.ToStatus
	}
	if strings.TrimSpace(patch.Comment) != "" {
		updates["comment"] = patch.Comment
	}
	if strings.TrimSpace(patch.Reason) != "" {
		updates["reason"] = patch.Reason
	}
	if strings.TrimSpace(patch.Source) != "" {
		updates["source"] = patch.Source
	}
	if patch.ActorID != nil {
		updates["actor_id"] = patch.ActorID
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListCreativeReferences(ctx context.Context, filter CreativeReferenceFilter) ([]domainsemantic.CreativeReference, error) {
	items := make([]persistencemodel.CreativeReference, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if kind := strings.TrimSpace(filter.Kind); kind != "" {
		q = q.Where("kind = ?", kind)
	}
	if err := q.Order("kind, name, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return creativeReferencesFromModels(items), nil
}

func creativeReferencesFromModels(items []persistencemodel.CreativeReference) []domainsemantic.CreativeReference {
	result := make([]domainsemantic.CreativeReference, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CreativeReferenceFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCreativeReference(ctx context.Context, item domainsemantic.CreativeReference) (domainsemantic.CreativeReference, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CreativeReferenceFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceFromModel(modelItem), nil
}

func (r *gormRepository) LoadCreativeReference(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReference, error) {
	var item persistencemodel.CreativeReference
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CreativeReference{}, err
	}
	return domainsemantic.CreativeReferenceFromModel(item), nil
}

func (r *gormRepository) PatchCreativeReference(ctx context.Context, item domainsemantic.CreativeReference, patch domainsemantic.CreativeReferencePatch) (domainsemantic.CreativeReference, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, creativeReferencePatchColumns(patch)); err != nil {
		return domainsemantic.CreativeReferenceFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceFromModel(modelItem), nil
}

func creativeReferencePatchColumns(patch domainsemantic.CreativeReferencePatch) map[string]any {
	updates := make(map[string]any)
	if patch.SourceScriptID != nil {
		updates["source_script_id"] = patch.SourceScriptID
	}
	if patch.SourceAnalysisID != nil {
		updates["source_analysis_id"] = patch.SourceAnalysisID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		updates["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Alias) != "" {
		updates["alias"] = patch.Alias
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Content) != "" {
		updates["content"] = patch.Content
	}
	if strings.TrimSpace(patch.Importance) != "" {
		updates["importance"] = patch.Importance
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.ProfileJSON) != "" {
		updates["profile_json"] = patch.ProfileJSON
	}
	if strings.TrimSpace(patch.TagsJSON) != "" {
		updates["tags_json"] = patch.TagsJSON
	}
	return updates
}

func (r *gormRepository) ListCreativeReferenceStates(ctx context.Context, filter CreativeReferenceStateFilter) ([]domainsemantic.CreativeReferenceState, error) {
	items := make([]persistencemodel.CreativeReferenceState, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.CreativeReferenceID > 0 {
		q = q.Where("creative_reference_id = ?", filter.CreativeReferenceID)
	}
	if err := q.Order("creative_reference_id, scope_type, scope_id, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return creativeReferenceStatesFromModels(items), nil
}

func creativeReferenceStatesFromModels(items []persistencemodel.CreativeReferenceState) []domainsemantic.CreativeReferenceState {
	result := make([]domainsemantic.CreativeReferenceState, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CreativeReferenceStateFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCreativeReferenceState(ctx context.Context, item domainsemantic.CreativeReferenceState) (domainsemantic.CreativeReferenceState, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CreativeReferenceStateFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceStateFromModel(modelItem), nil
}

func (r *gormRepository) LoadCreativeReferenceState(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReferenceState, error) {
	var item persistencemodel.CreativeReferenceState
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CreativeReferenceState{}, err
	}
	return domainsemantic.CreativeReferenceStateFromModel(item), nil
}

func (r *gormRepository) PatchCreativeReferenceState(ctx context.Context, item domainsemantic.CreativeReferenceState, patch domainsemantic.CreativeReferenceStatePatch) (domainsemantic.CreativeReferenceState, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, creativeReferenceStatePatchColumns(patch)); err != nil {
		return domainsemantic.CreativeReferenceStateFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceStateFromModel(modelItem), nil
}

func creativeReferenceStatePatchColumns(patch domainsemantic.CreativeReferenceStatePatch) map[string]any {
	updates := make(map[string]any)
	if patch.CreativeReferenceID > 0 {
		updates["creative_reference_id"] = patch.CreativeReferenceID
	}
	if strings.TrimSpace(patch.ScopeType) != "" {
		updates["scope_type"] = patch.ScopeType
	}
	if patch.ScopeID != nil {
		updates["scope_id"] = patch.ScopeID
	}
	if strings.TrimSpace(patch.Name) != "" {
		updates["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.VisualNotes) != "" {
		updates["visual_notes"] = patch.VisualNotes
	}
	if strings.TrimSpace(patch.Emotion) != "" {
		updates["emotion"] = patch.Emotion
	}
	if strings.TrimSpace(patch.Costume) != "" {
		updates["costume"] = patch.Costume
	}
	if strings.TrimSpace(patch.Props) != "" {
		updates["props"] = patch.Props
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.TagsJSON) != "" {
		updates["tags_json"] = patch.TagsJSON
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListCreativeReferenceUsages(ctx context.Context, filter CreativeReferenceUsageFilter) ([]domainsemantic.CreativeReferenceUsage, error) {
	items := make([]persistencemodel.CreativeReferenceUsage, 0)
	q := r.db.WithContext(ctx).Preload("CreativeReference").Preload("CreativeReferenceState").Where("project_id = ?", filter.ProjectID)
	if ownerType := strings.TrimSpace(filter.OwnerType); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if filter.OwnerID > 0 {
		q = q.Where("owner_id = ?", filter.OwnerID)
	}
	if filter.CreativeReferenceID > 0 {
		q = q.Where("creative_reference_id = ?", filter.CreativeReferenceID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`owner_type, owner_id, "order", id`).Find(&items).Error; err != nil {
		return nil, err
	}
	return creativeReferenceUsagesFromModels(items), nil
}

func creativeReferenceUsagesFromModels(items []persistencemodel.CreativeReferenceUsage) []domainsemantic.CreativeReferenceUsage {
	result := make([]domainsemantic.CreativeReferenceUsage, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CreativeReferenceUsageFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCreativeReferenceUsage(ctx context.Context, item domainsemantic.CreativeReferenceUsage) (domainsemantic.CreativeReferenceUsage, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CreativeReferenceUsageFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceUsageFromModel(modelItem), nil
}

func (r *gormRepository) LoadCreativeReferenceUsage(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeReferenceUsage, error) {
	var item persistencemodel.CreativeReferenceUsage
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CreativeReferenceUsage{}, err
	}
	return domainsemantic.CreativeReferenceUsageFromModel(item), nil
}

func (r *gormRepository) PatchCreativeReferenceUsage(ctx context.Context, item domainsemantic.CreativeReferenceUsage, patch domainsemantic.CreativeReferenceUsagePatch) (domainsemantic.CreativeReferenceUsage, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, creativeReferenceUsagePatchColumns(patch)); err != nil {
		return domainsemantic.CreativeReferenceUsageFromModel(modelItem), err
	}
	return domainsemantic.CreativeReferenceUsageFromModel(modelItem), nil
}

func creativeReferenceUsagePatchColumns(patch domainsemantic.CreativeReferenceUsagePatch) map[string]any {
	updates := map[string]any{
		"owner_id":              patch.OwnerID,
		"creative_reference_id": patch.CreativeReferenceID,
		"order":                 patch.Order,
	}
	if strings.TrimSpace(patch.OwnerType) != "" {
		updates["owner_type"] = patch.OwnerType
	}
	if patch.CreativeReferenceStateID != nil {
		updates["creative_reference_state_id"] = patch.CreativeReferenceStateID
	}
	if strings.TrimSpace(patch.Role) != "" {
		updates["role"] = patch.Role
	}
	if strings.TrimSpace(patch.Evidence) != "" {
		updates["evidence"] = patch.Evidence
	}
	if strings.TrimSpace(patch.Source) != "" {
		updates["source"] = patch.Source
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}

func (r *gormRepository) ListCreativeRelationships(ctx context.Context, filter CreativeRelationshipFilter) ([]domainsemantic.CreativeRelationship, error) {
	items := make([]persistencemodel.CreativeRelationship, 0)
	q := r.db.WithContext(ctx).Preload("SourceCreativeReference").Preload("TargetCreativeReference").Where("project_id = ?", filter.ProjectID)
	if filter.CreativeReferenceID > 0 {
		q = q.Where("source_creative_reference_id = ? OR target_creative_reference_id = ?", filter.CreativeReferenceID, filter.CreativeReferenceID)
	}
	if scopeType := strings.TrimSpace(filter.ScopeType); scopeType != "" {
		q = q.Where("scope_type = ?", scopeType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("scope_type, scope_id, id").Find(&items).Error; err != nil {
		return nil, err
	}
	return creativeRelationshipsFromModels(items), nil
}

func creativeRelationshipsFromModels(items []persistencemodel.CreativeRelationship) []domainsemantic.CreativeRelationship {
	result := make([]domainsemantic.CreativeRelationship, 0, len(items))
	for _, item := range items {
		result = append(result, domainsemantic.CreativeRelationshipFromModel(item))
	}
	return result
}

func (r *gormRepository) CreateCreativeRelationship(ctx context.Context, item domainsemantic.CreativeRelationship) (domainsemantic.CreativeRelationship, error) {
	modelItem := item.ToModel()
	if err := r.createItem(ctx, &modelItem); err != nil {
		return domainsemantic.CreativeRelationshipFromModel(modelItem), err
	}
	return domainsemantic.CreativeRelationshipFromModel(modelItem), nil
}

func (r *gormRepository) LoadCreativeRelationship(ctx context.Context, projectID uint, id string) (domainsemantic.CreativeRelationship, error) {
	var item persistencemodel.CreativeRelationship
	if err := r.loadProjectItem(ctx, projectID, &item, id); err != nil {
		return domainsemantic.CreativeRelationship{}, err
	}
	return domainsemantic.CreativeRelationshipFromModel(item), nil
}

func (r *gormRepository) PatchCreativeRelationship(ctx context.Context, item domainsemantic.CreativeRelationship, patch domainsemantic.CreativeRelationshipPatch) (domainsemantic.CreativeRelationship, error) {
	modelItem := item.ToModel()
	if err := r.patchItem(ctx, &modelItem, creativeRelationshipPatchColumns(patch)); err != nil {
		return domainsemantic.CreativeRelationshipFromModel(modelItem), err
	}
	return domainsemantic.CreativeRelationshipFromModel(modelItem), nil
}

func creativeRelationshipPatchColumns(patch domainsemantic.CreativeRelationshipPatch) map[string]any {
	updates := map[string]any{
		"source_creative_reference_id": patch.SourceCreativeReferenceID,
		"target_creative_reference_id": patch.TargetCreativeReferenceID,
	}
	if strings.TrimSpace(patch.ScopeType) != "" {
		updates["scope_type"] = patch.ScopeType
	}
	if patch.ScopeID != nil {
		updates["scope_id"] = patch.ScopeID
	}
	if strings.TrimSpace(patch.Category) != "" {
		updates["category"] = patch.Category
	}
	if strings.TrimSpace(patch.Type) != "" {
		updates["type"] = patch.Type
	}
	if strings.TrimSpace(patch.Label) != "" {
		updates["label"] = patch.Label
	}
	if strings.TrimSpace(patch.Description) != "" {
		updates["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Source) != "" {
		updates["source"] = patch.Source
	}
	if strings.TrimSpace(patch.Status) != "" {
		updates["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Evidence) != "" {
		updates["evidence"] = patch.Evidence
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		updates["metadata_json"] = patch.MetadataJSON
	}
	return updates
}
