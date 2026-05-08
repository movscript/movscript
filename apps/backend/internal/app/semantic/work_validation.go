package semantic

import (
	"context"

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

func WorkItemInputKeepsAssignment(item domainsemantic.WorkItem, input WorkItemInput) bool {
	return domainsemantic.WorkItemPatchKeepsAssignment(item, input.domainPatch())
}

func (s *Service) ensureUserInProject(ctx context.Context, projectID, userID uint) error {
	return s.repo.EnsureUserInProject(ctx, projectID, userID)
}

func (s *Service) ensureJobInProject(ctx context.Context, projectID, jobID uint) error {
	return s.repo.EnsureJobInProject(ctx, projectID, jobID)
}
