package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]model.WorkItem, error) {
	return s.repo.ListWorkItems(ctx, filter)
}

func (s *Service) CreateWorkItem(ctx context.Context, projectID uint, auth WorkAuth, input WorkItemInput) (model.WorkItem, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkItem{}, ErrForbidden{Message: "只有项目负责人或导演可以分配任务"}
	}
	if err := s.validateWorkItemInput(ctx, projectID, input); err != nil {
		return model.WorkItem{}, err
	}
	item := domainsemantic.NewWorkItem(projectID, input.domainPatch())
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkItem(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkItemInput) (model.WorkItem, error) {
	var item model.WorkItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	updates := workItemUpdates(item, input)
	if domainsemantic.WorkItemPatchCompletes(item, input.domainPatch()) {
		return s.completeWorkItem(ctx, projectID, &item, updates, &auth.UserID)
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]model.WorkReview, error) {
	return s.repo.ListWorkReviews(ctx, filter)
}

func (s *Service) CreateWorkReview(ctx context.Context, projectID uint, auth WorkAuth, input WorkReviewInput) (model.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以审核任务"}
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, true); err != nil {
		return model.WorkReview{}, err
	}
	item := domainsemantic.NewWorkReview(domainsemantic.WorkReviewSpec{
		ProjectID:    projectID,
		WorkItemID:   input.WorkItemID,
		ReviewerID:   input.ReviewerID,
		Status:       input.Status,
		Comment:      input.Comment,
		MetadataJSON: input.MetadataJSON,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkReview(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkReviewInput) (model.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以修改审核记录"}
	}
	var item model.WorkReview
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, false); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"work_item_id":  input.WorkItemID,
		"reviewer_id":   input.ReviewerID,
		"status":        input.Status,
		"comment":       input.Comment,
		"metadata_json": input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]model.WorkDependency, error) {
	return s.repo.ListWorkDependencies(ctx, filter)
}

func (s *Service) CreateWorkDependency(ctx context.Context, projectID uint, auth WorkAuth, input WorkDependencyInput) (model.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return model.WorkDependency{}, err
	}
	item := domainsemantic.NewWorkDependency(domainsemantic.WorkDependencySpec{
		ProjectID:           projectID,
		WorkItemID:          input.WorkItemID,
		DependsOnWorkItemID: input.DependsOnWorkItemID,
		DependencyType:      input.DependencyType,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkDependency(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkDependencyInput) (model.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	var item model.WorkDependency
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"work_item_id":            input.WorkItemID,
		"depends_on_work_item_id": input.DependsOnWorkItemID,
		"dependency_type":         input.DependencyType,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) DeleteWorkItem(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除任务"}
	}
	var item model.WorkItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return err
	}
	return s.DeleteItem(ctx, &item)
}

func (s *Service) DeleteWorkReview(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除审核记录"}
	}
	var item model.WorkReview
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return err
	}
	return s.DeleteItem(ctx, &item)
}

func (s *Service) DeleteWorkDependency(ctx context.Context, projectID uint, id string, auth WorkAuth) error {
	if !IsWorkItemManagerRole(auth.Role) {
		return ErrForbidden{Message: "只有项目负责人或导演可以删除任务依赖"}
	}
	var item model.WorkDependency
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return err
	}
	return s.DeleteItem(ctx, &item)
}
