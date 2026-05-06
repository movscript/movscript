package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) validateWorkItemInput(ctx context.Context, projectID uint, input WorkItemInput) error {
	if err := domainsemantic.ValidateWorkItemPatch(input.domainPatch()); err != nil {
		return ErrInvalidInput{Err: err}
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return err
		}
	}
	if err := s.ensureOwnerInProject(ctx, projectID, input.TargetType, input.TargetID); err != nil {
		return err
	}
	if input.AssigneeID != nil {
		if err := s.ensureUserInProject(ctx, projectID, *input.AssigneeID); err != nil {
			return err
		}
	}
	if input.SourceJobID != nil {
		if err := s.ensureJobInProject(ctx, projectID, *input.SourceJobID); err != nil {
			return err
		}
	}
	if input.SourceCanvasID != nil {
		if err := s.ensureCanvasInProject(ctx, projectID, *input.SourceCanvasID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateWorkReviewInput(ctx context.Context, projectID uint, input *WorkReviewInput, currentUserID uint, defaultReviewer bool) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "work_item", input.WorkItemID); err != nil {
		return err
	}
	if input.ReviewerID == nil && defaultReviewer {
		input.ReviewerID = &currentUserID
	}
	if input.ReviewerID != nil {
		if err := s.ensureUserInProject(ctx, projectID, *input.ReviewerID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateWorkDependencyInput(ctx context.Context, projectID uint, input WorkDependencyInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "work_item", input.WorkItemID); err != nil {
		return err
	}
	return s.ensureOwnerInProject(ctx, projectID, "work_item", input.DependsOnWorkItemID)
}

func workItemUpdates(item model.WorkItem, input WorkItemInput) map[string]any {
	return domainsemantic.WorkItemUpdates(item, input.domainPatch())
}

func WorkItemInputKeepsAssignment(item model.WorkItem, input WorkItemInput) bool {
	return domainsemantic.WorkItemPatchKeepsAssignment(item, input.domainPatch())
}

func DecodeWorkItemResultJSON(raw string) (domainsemantic.WorkItemResultPayload, error) {
	return domainsemantic.DecodeWorkItemResultJSON(raw)
}

func ValidJSONObject(raw string) bool {
	return domainsemantic.ValidJSONObject(raw)
}

func InitialWorkItemApplyStatus(resultType string) string {
	return domainsemantic.InitialWorkItemApplyStatus(resultType)
}

func ApplyStatusForWorkItemPatch(item model.WorkItem, input WorkItemInput) string {
	return domainsemantic.ApplyStatusForWorkItemPatch(item, input.domainPatch())
}

func ApplyWorkItemUpdates(item *model.WorkItem, updates map[string]any) {
	domainsemantic.ApplyWorkItemUpdates(item, updates)
}

func (s *Service) ensureUserInProject(ctx context.Context, projectID, userID uint) error {
	return s.repo.EnsureUserInProject(ctx, projectID, userID)
}

func (s *Service) ensureJobInProject(ctx context.Context, projectID, jobID uint) error {
	return s.repo.EnsureJobInProject(ctx, projectID, jobID)
}
