package semantic

import (
	"context"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]domainsemantic.WorkItem, error) {
	if filter.ProductionID > 0 {
		return s.listWorkItemsFromRelations(ctx, filter)
	}
	return s.repo.ListWorkItems(ctx, filter)
}

func (s *Service) listWorkItemsFromRelations(ctx context.Context, filter WorkItemFilter) ([]domainsemantic.WorkItem, error) {
	ids, err := s.relatedTargetIDs(ctx, workflowContainsFilter(filter.ProjectID, "production", filter.ProductionID), "work_item")
	if err != nil {
		return nil, err
	}
	items := make([]domainsemantic.WorkItem, 0, len(ids))
	for _, id := range ids {
		item, err := s.repo.LoadWorkItem(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if filter.TargetType != "" && item.TargetType != filter.TargetType {
			continue
		}
		if filter.Status != "" && item.Status != filter.Status {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) CreateWorkItem(ctx context.Context, projectID uint, auth WorkAuth, input WorkItemInput) (domainsemantic.WorkItem, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return domainsemantic.WorkItem{}, ErrForbidden{Message: "只有项目负责人或导演可以分配任务"}
	}
	if err := s.validateWorkItemInput(ctx, projectID, input); err != nil {
		return domainsemantic.WorkItem{}, err
	}
	item := domainsemantic.NewWorkItem(projectID, input.domainPatch())
	var created domainsemantic.WorkItem
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateWorkItem(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertWorkItemRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchWorkItem(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkItemInput) (domainsemantic.WorkItem, error) {
	item, err := s.repo.LoadWorkItem(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	isManager := IsWorkItemManagerRole(auth.Role)
	if !isManager && (item.AssigneeID == nil || *item.AssigneeID != auth.UserID) {
		return item, ErrForbidden{Message: "只能推进分配给自己的任务"}
	}
	if err := s.validateWorkItemInput(ctx, projectID, input); err != nil {
		return item, err
	}
	if !isManager {
		if !WorkItemInputKeepsAssignment(item, input) {
			return item, ErrForbidden{Message: "执行人只能更新状态、交付说明和关联产出"}
		}
		if !domainsemantic.WorkItemAssigneeCanAdvanceTo(domainsemantic.WorkItemStatusForPatch(item, input.domainPatch())) {
			return item, ErrForbidden{Message: "执行人只能将任务推进到进行中或待审核"}
		}
	}
	if !isManager && domainsemantic.WorkItemStatusRequiresManager(domainsemantic.WorkItemStatusForPatch(item, input.domainPatch())) {
		return item, ErrForbidden{Message: "只有项目负责人或导演可以完成或取消任务"}
	}
	patch := input.domainPatch()
	if domainsemantic.WorkItemPatchCompletes(item, input.domainPatch()) {
		return s.completeWorkItem(ctx, projectID, item, patch, &auth.UserID)
	}
	var patched domainsemantic.WorkItem
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchWorkItem(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertWorkItemRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertWorkItemRelations(ctx context.Context, item domainsemantic.WorkItem) error {
	for _, edgeType := range []string{domainrelation.TypeTargets, domainrelation.TypeProduces} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryWorkflow,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("work_item", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("work_item", item.ID),
	}); err != nil {
		return err
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("work_item", item.ID),
		Target:    domainrelation.NewEntityRef(item.TargetType, item.TargetID),
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeTargets,
		Label:     item.Kind,
		Status:    semanticRelationStatus(item.Status),
		Metadata: semanticRelationMetadata(map[string]any{
			"priority":    item.Priority,
			"result_type": item.ResultType,
		}),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Target:    domainrelation.NewEntityRef("work_item", item.ID),
			Category:  domainrelation.CategoryWorkflow,
			Type:      domainrelation.TypeContains,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]domainsemantic.WorkReview, error) {
	return s.repo.ListWorkReviews(ctx, filter)
}

func (s *Service) CreateWorkReview(ctx context.Context, projectID uint, auth WorkAuth, input WorkReviewInput) (domainsemantic.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return domainsemantic.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以审核任务"}
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, true); err != nil {
		return domainsemantic.WorkReview{}, err
	}
	item := domainsemantic.NewWorkReview(domainsemantic.WorkReviewSpec{
		ProjectID:    projectID,
		WorkItemID:   input.WorkItemID,
		ReviewerID:   input.ReviewerID,
		Status:       input.Status,
		Comment:      input.Comment,
		MetadataJSON: input.MetadataJSON,
	})
	return s.repo.CreateWorkReview(ctx, item)
}

func (s *Service) PatchWorkReview(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkReviewInput) (domainsemantic.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return domainsemantic.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以修改审核记录"}
	}
	item, err := s.repo.LoadWorkReview(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, false); err != nil {
		return item, err
	}
	patch := domainsemantic.WorkReviewPatch{
		WorkItemID:   input.WorkItemID,
		ReviewerID:   input.ReviewerID,
		Status:       input.Status,
		Comment:      input.Comment,
		MetadataJSON: input.MetadataJSON,
	}
	return s.repo.PatchWorkReview(ctx, item, patch)
}

func (s *Service) ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]domainsemantic.WorkDependency, error) {
	return s.repo.ListWorkDependencies(ctx, filter)
}

func (s *Service) CreateWorkDependency(ctx context.Context, projectID uint, auth WorkAuth, input WorkDependencyInput) (domainsemantic.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return domainsemantic.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return domainsemantic.WorkDependency{}, err
	}
	item := domainsemantic.NewWorkDependency(domainsemantic.WorkDependencySpec{
		ProjectID:           projectID,
		WorkItemID:          input.WorkItemID,
		DependsOnWorkItemID: input.DependsOnWorkItemID,
		DependencyType:      input.DependencyType,
	})
	var created domainsemantic.WorkDependency
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateWorkDependency(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertWorkDependencyRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchWorkDependency(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkDependencyInput) (domainsemantic.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return domainsemantic.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	item, err := s.repo.LoadWorkDependency(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.WorkDependencyPatch{
		WorkItemID:          input.WorkItemID,
		DependsOnWorkItemID: input.DependsOnWorkItemID,
		DependencyType:      input.DependencyType,
	}
	var patched domainsemantic.WorkDependency
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchWorkDependency(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertWorkDependencyRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertWorkDependencyRelation(ctx context.Context, item domainsemantic.WorkDependency) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID:        item.ProjectID,
		Category:         domainrelation.CategoryWorkflow,
		MetadataContains: semanticRelationMetadataMarker("work_dependency_id", item.ID),
	}); err != nil {
		return err
	}
	relationType := domainrelation.TypeDependsOn
	if strings.TrimSpace(item.DependencyType) == "blocks" {
		relationType = domainrelation.TypeBlocks
	}
	return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("work_item", item.DependsOnWorkItemID),
		Target:    domainrelation.NewEntityRef("work_item", item.WorkItemID),
		Category:  domainrelation.CategoryWorkflow,
		Type:      relationType,
		Label:     item.DependencyType,
		Status:    domainrelation.StatusConfirmed,
		Metadata:  semanticRelationMetadata(map[string]any{"work_dependency_id": item.ID}),
	})
}

func (s *Service) DeleteWorkItem(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除任务"}
	}
	item, err := s.repo.LoadWorkItem(ctx, projectID, id)
	if err != nil {
		return err
	}
	return s.repo.DeleteWorkItem(ctx, item)
}

func (s *Service) DeleteWorkReview(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除审核记录"}
	}
	item, err := s.repo.LoadWorkReview(ctx, projectID, id)
	if err != nil {
		return err
	}
	return s.repo.DeleteWorkReview(ctx, item)
}

func (s *Service) DeleteWorkDependency(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除任务依赖"}
	}
	item, err := s.repo.LoadWorkDependency(ctx, projectID, id)
	if err != nil {
		return err
	}
	return s.repo.DeleteWorkDependency(ctx, item)
}
