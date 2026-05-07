package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) DeleteItemByKind(ctx context.Context, projectID uint, kind string, id string) error {
	deletedProjectID, err := s.repo.DeleteProjectItemByKind(ctx, projectID, kind, id)
	if err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, deletedProjectID)
	return nil
}

func (s *Service) ensureProductionInProject(ctx context.Context, projectID uint, productionID uint) error {
	return s.repo.EnsureProductionInProject(ctx, projectID, productionID)
}

func (s *Service) ensureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error {
	return s.repo.EnsureProductionTextBlockInProject(ctx, projectID, blockID)
}

func (s *Service) ensureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error {
	return s.repo.EnsureSegmentInProject(ctx, projectID, segmentID)
}

func (s *Service) validateProductionOwners(ctx context.Context, projectID uint, scriptVersionID *uint, previewTimelineID *uint) error {
	if scriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *scriptVersionID); err != nil {
			return err
		}
	}
	if previewTimelineID != nil {
		if err := s.ensurePreviewTimelineInProject(ctx, projectID, *previewTimelineID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateContentUnitOwners(ctx context.Context, projectID uint, productionID *uint, segmentID *uint, sceneMomentID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if segmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *segmentID); err != nil {
			return err
		}
	}
	if sceneMomentID != nil {
		if err := s.ensureSceneMomentInProject(ctx, projectID, *sceneMomentID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateKeyframeOwners(ctx context.Context, projectID uint, productionID *uint, sceneMomentID *uint, contentUnitID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if sceneMomentID != nil {
		if err := s.ensureSceneMomentInProject(ctx, projectID, *sceneMomentID); err != nil {
			return err
		}
	}
	if contentUnitID != nil {
		if err := s.ensureContentUnitInProject(ctx, projectID, *contentUnitID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validatePreviewTimelineOwners(ctx context.Context, projectID uint, productionID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	return s.ensurePreviewTimelineInProject(ctx, projectID, previewTimelineID)
}

func (s *Service) ensureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error {
	return s.repo.EnsureScriptVersionInProject(ctx, projectID, scriptVersionID)
}

func (s *Service) ensurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	return s.repo.EnsurePreviewTimelineInProject(ctx, projectID, previewTimelineID)
}

func (s *Service) ensureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	return s.repo.EnsureSceneMomentInProject(ctx, projectID, sceneMomentID)
}

func (s *Service) ensureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	return s.repo.EnsureContentUnitInProject(ctx, projectID, contentUnitID)
}

func (s *Service) ensureKeyframeInProject(ctx context.Context, projectID uint, keyframeID uint) error {
	return s.repo.EnsureOwnerInProject(ctx, projectID, "keyframe", keyframeID)
}

func fallbackString(value string, fallback string) string {
	return domainsemantic.FallbackString(value, fallback)
}

func fallbackInt(value int, fallback int) int {
	return domainsemantic.FallbackInt(value, fallback)
}

func compactUpdates(values map[string]any) map[string]any {
	return domainsemantic.CompactUpdates(values)
}
