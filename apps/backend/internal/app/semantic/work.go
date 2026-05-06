package semantic

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]model.WorkItem, error) {
	items := make([]model.WorkItem, 0)
	q := s.db.WithContext(ctx).Preload("Assignee").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("status, priority desc, id desc").Find(&items).Error
	return items, err
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
		switch fallbackString(input.Status, item.Status) {
		case "running", "review":
		default:
			return item, ErrForbidden{Message: "执行人只能将任务推进到进行中或待审核"}
		}
	}
	if !isManager && (input.Status == "done" || input.Status == "cancelled") {
		return item, ErrForbidden{Message: "只有项目负责人或导演可以完成或取消任务"}
	}
	updates := workItemUpdates(item, input)
	if fallbackString(input.Status, item.Status) == "done" {
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
	items := make([]model.WorkReview, 0)
	q := s.db.WithContext(ctx).Preload("Reviewer").Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("work_item_id, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateWorkReview(ctx context.Context, projectID uint, auth WorkAuth, input WorkReviewInput) (model.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以审核任务"}
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, true); err != nil {
		return model.WorkReview{}, err
	}
	item := model.WorkReview{
		ProjectID:    projectID,
		WorkItemID:   input.WorkItemID,
		ReviewerID:   input.ReviewerID,
		Status:       fallbackString(input.Status, "pending"),
		Comment:      input.Comment,
		MetadataJSON: input.MetadataJSON,
	}
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
	items := make([]model.WorkDependency, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	err := q.Order("work_item_id, id").Find(&items).Error
	return items, err
}

func (s *Service) CreateWorkDependency(ctx context.Context, projectID uint, auth WorkAuth, input WorkDependencyInput) (model.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return model.WorkDependency{}, err
	}
	item := model.WorkDependency{
		ProjectID:           projectID,
		WorkItemID:          input.WorkItemID,
		DependsOnWorkItemID: input.DependsOnWorkItemID,
		DependencyType:      fallbackString(input.DependencyType, "blocks"),
	}
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
