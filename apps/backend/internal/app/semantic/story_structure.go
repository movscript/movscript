package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListSegments(ctx context.Context, filter SegmentFilter) ([]domainsemantic.Segment, error) {
	return s.repo.ListSegments(ctx, filter)
}

func (s *Service) CreateSegment(ctx context.Context, projectID uint, input CreateSegmentInput) (domainsemantic.Segment, error) {
	productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
	if err != nil {
		return domainsemantic.Segment{}, err
	}
	item := domainsemantic.NewSegment(domainsemantic.SegmentSpec{
		ProjectID:       projectID,
		ProductionID:    productionID,
		TextBlockID:     textBlockID,
		ParentSegmentID: input.ParentSegmentID,
		Kind:            input.Kind,
		Order:           input.Order,
		Title:           input.Title,
		Summary:         input.Summary,
		Content:         input.Content,
		Status:          input.Status,
		MetadataJSON:    input.MetadataJSON,
	})
	return s.repo.CreateSegment(ctx, item)
}

func (s *Service) PatchSegment(ctx context.Context, projectID uint, id string, input PatchSegmentInput) (domainsemantic.Segment, error) {
	item, err := s.repo.LoadSegment(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	patch := domainsemantic.SegmentPatch{
		ParentSegmentID: input.ParentSegmentID,
		Kind:            input.Kind,
		Order:           input.Order,
		Title:           input.Title,
		Summary:         input.Summary,
		Content:         input.Content,
		Status:          input.Status,
		MetadataJSON:    input.MetadataJSON,
	}
	if input.TextBlockID != nil || input.ProductionID != nil {
		productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
		if err != nil {
			return item, err
		}
		patch.ProductionID = productionID
		patch.TextBlockID = textBlockID
	}
	return s.repo.PatchSegment(ctx, item, patch)
}

func (s *Service) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]domainsemantic.ProductionTextBlock, error) {
	return s.repo.ListProductionTextBlocks(ctx, filter)
}

func (s *Service) CreateProductionTextBlock(ctx context.Context, projectID uint, input CreateProductionTextBlockInput) (domainsemantic.ProductionTextBlock, error) {
	if err := s.ensureProductionInProject(ctx, projectID, input.ProductionID); err != nil {
		return domainsemantic.ProductionTextBlock{}, err
	}
	if input.ParentBlockID != nil {
		if err := s.ensureProductionTextBlockInProject(ctx, projectID, *input.ParentBlockID); err != nil {
			return domainsemantic.ProductionTextBlock{}, err
		}
	}
	item := domainsemantic.NewProductionTextBlock(domainsemantic.ProductionTextBlockSpec{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		ParentBlockID: input.ParentBlockID,
		Kind:          input.Kind,
		Order:         input.Order,
		Title:         input.Title,
		Content:       input.Content,
		Summary:       input.Summary,
		SourceType:    input.SourceType,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	})
	return s.repo.CreateProductionTextBlock(ctx, item)
}

func (s *Service) PatchProductionTextBlock(ctx context.Context, projectID uint, id string, input PatchProductionTextBlockInput) (domainsemantic.ProductionTextBlock, error) {
	item, err := s.repo.LoadProductionTextBlock(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return item, err
		}
	}
	if input.ParentBlockID != nil {
		if err := s.ensureProductionTextBlockInProject(ctx, projectID, *input.ParentBlockID); err != nil {
			return item, err
		}
	}
	patch := domainsemantic.ProductionTextBlockPatch{
		ProductionID:  input.ProductionID,
		ParentBlockID: input.ParentBlockID,
		Kind:          input.Kind,
		Order:         input.Order,
		Title:         input.Title,
		Content:       input.Content,
		Summary:       input.Summary,
		SourceType:    input.SourceType,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
	return s.repo.PatchProductionTextBlock(ctx, item, patch)
}

func (s *Service) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]domainsemantic.SceneMoment, error) {
	return s.repo.ListSceneMoments(ctx, filter)
}

func (s *Service) CreateSceneMoment(ctx context.Context, projectID uint, input CreateSceneMomentInput) (domainsemantic.SceneMoment, error) {
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return domainsemantic.SceneMoment{}, err
		}
	}
	item := domainsemantic.NewSceneMoment(domainsemantic.SceneMomentSpec{
		ProjectID:     projectID,
		SegmentID:     input.SegmentID,
		Order:         input.Order,
		Title:         input.Title,
		Description:   input.Description,
		TimeText:      input.TimeText,
		LocationText:  input.LocationText,
		ConditionText: input.ConditionText,
		ActionText:    input.ActionText,
		Mood:          input.Mood,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	})
	return s.repo.CreateSceneMoment(ctx, item)
}

func (s *Service) PatchSceneMoment(ctx context.Context, projectID uint, id string, input PatchSceneMomentInput) (domainsemantic.SceneMoment, error) {
	item, err := s.repo.LoadSceneMoment(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return item, err
		}
	}
	patch := domainsemantic.SceneMomentPatch{
		SegmentID:     input.SegmentID,
		Order:         input.Order,
		Title:         input.Title,
		Description:   input.Description,
		TimeText:      input.TimeText,
		LocationText:  input.LocationText,
		ConditionText: input.ConditionText,
		ActionText:    input.ActionText,
		Mood:          input.Mood,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
	return s.repo.PatchSceneMoment(ctx, item, patch)
}

func (s *Service) resolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	return s.repo.ResolveSegmentOwners(ctx, projectID, productionID, textBlockID)
}
