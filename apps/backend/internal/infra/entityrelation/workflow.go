package entityrelation

import (
	"strings"

	"gorm.io/gorm"
)

func syncCandidateDecisionRelations(tx *gorm.DB, item *CandidateDecision) error {
	if err := deleteSourceEntityRelations(tx, "candidate_decision", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeDecides, EntityRelationTypeAppliesTo)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.CandidateID != nil && item.CandidateType != "" {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "candidate_decision", SourceID: item.ID, TargetType: item.CandidateType, TargetID: *item.CandidateID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeDecides, Label: item.Decision, Status: relationStatus(item.Status), Source: relationSource(item.Source), Evidence: item.Reason})
	}
	if item.TargetID != nil && item.TargetType != "" {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "candidate_decision", SourceID: item.ID, TargetType: item.TargetType, TargetID: *item.TargetID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAppliesTo, Label: item.Decision, Status: relationStatus(item.Status), Source: relationSource(item.Source), Evidence: item.Note})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncReviewEventRelations(tx *gorm.DB, item *ReviewEvent) error {
	if err := deleteSourceEntityRelations(tx, "review_event", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeReviews)); err != nil {
		return err
	}
	if item.SubjectID == nil || item.SubjectType == "" {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "review_event",
		SourceID:     item.ID,
		TargetType:   item.SubjectType,
		TargetID:     *item.SubjectID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         EntityRelationTypeReviews,
		Label:        item.EventType,
		Status:       relationStatus(item.ToStatus),
		Source:       relationSource(item.Source),
		Evidence:     item.Comment,
		MetadataJSON: relationMetadata(map[string]any{"from_status": item.FromStatus, "to_status": item.ToStatus, "reason": item.Reason}),
	}})
}

func syncWorkItemRelations(tx *gorm.DB, item *WorkItem) error {
	if err := deleteSourceEntityRelations(tx, "work_item", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeTargets, EntityRelationTypeProduces)); err != nil {
		return err
	}
	if err := deleteTargetEntityRelations(tx, "work_item", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "work_item",
		SourceID:     item.ID,
		TargetType:   item.TargetType,
		TargetID:     item.TargetID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         EntityRelationTypeTargets,
		Label:        item.Kind,
		Status:       relationStatus(item.Status),
		MetadataJSON: relationMetadata(map[string]any{"priority": item.Priority, "result_type": item.ResultType}),
	}}
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "production", SourceID: *item.ProductionID, TargetType: "work_item", TargetID: item.ID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeContains, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncWorkDependencyRelations(tx *gorm.DB, item *WorkDependency) error {
	if err := deleteMetadataEntityRelations(tx, "work_dependency_id", item.ID); err != nil {
		return err
	}
	relationType := EntityRelationTypeDependsOn
	if strings.TrimSpace(item.DependencyType) == "blocks" {
		relationType = EntityRelationTypeBlocks
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:    item.ProjectID,
		SourceType:   "work_item",
		SourceID:     item.DependsOnWorkItemID,
		TargetType:   "work_item",
		TargetID:     item.WorkItemID,
		Category:     EntityRelationCategoryWorkflow,
		Type:         relationType,
		Label:        item.DependencyType,
		Status:       EntityRelationStatusConfirmed,
		MetadataJSON: relationMetadata(map[string]any{"work_dependency_id": item.ID}),
	}})
}

func syncCanvasRelations(tx *gorm.DB, item *Canvas) error {
	if err := deleteSourceEntityRelations(tx, "canvas", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeAttachedTo)); err != nil {
		return err
	}
	if item.RefID == nil || item.RefType == "" || item.ProjectID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{ProjectID: *item.ProjectID, SourceType: "canvas", SourceID: item.ID, TargetType: item.RefType, TargetID: *item.RefID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAttachedTo, Label: item.Stage, Status: "active"}})
}

func syncCanvasRunRelations(tx *gorm.DB, item *CanvasRun) error {
	if err := deleteSourceEntityRelations(tx, "canvas_run", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	var canvas Canvas
	if err := tx.Select("id, project_id").First(&canvas, item.CanvasID).Error; err != nil || canvas.ProjectID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{ProjectID: *canvas.ProjectID, SourceType: "canvas_run", SourceID: item.ID, TargetType: "canvas", TargetID: item.CanvasID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)}})
}

func syncCanvasOutputRelations(tx *gorm.DB, item *CanvasOutput) error {
	if err := deleteSourceEntityRelations(tx, "canvas_output", item.ID, EntityRelationCategoryWorkflow, relationTypeList(EntityRelationTypeProduces, EntityRelationTypeAppliesTo)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "canvas_output", SourceID: item.ID, TargetType: item.OwnerType, TargetID: item.OwnerID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeAppliesTo, Label: item.OutputType, Status: relationStatus(item.Status)}}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "canvas_output", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryWorkflow, Type: EntityRelationTypeProduces, Label: item.OutputType, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}
