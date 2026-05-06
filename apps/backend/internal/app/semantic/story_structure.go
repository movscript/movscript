package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (s *Service) ListSegments(ctx context.Context, filter SegmentFilter) ([]model.Segment, error) {
	return s.repo.ListSegments(ctx, filter)
}

func (s *Service) CreateSegment(ctx context.Context, projectID uint, input CreateSegmentInput) (model.Segment, error) {
	productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
	if err != nil {
		return model.Segment{}, err
	}
	item := model.Segment{
		ProjectID:       projectID,
		ProductionID:    productionID,
		TextBlockID:     textBlockID,
		ParentSegmentID: input.ParentSegmentID,
		Kind:            fallbackString(input.Kind, "section"),
		Order:           input.Order,
		Title:           input.Title,
		Summary:         input.Summary,
		Content:         input.Content,
		Status:          fallbackString(input.Status, "draft"),
		MetadataJSON:    input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchSegment(ctx context.Context, projectID uint, id string, input PatchSegmentInput) (model.Segment, error) {
	var item model.Segment
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"parent_segment_id": input.ParentSegmentID,
		"kind":              input.Kind,
		"order":             input.Order,
		"title":             input.Title,
		"summary":           input.Summary,
		"content":           input.Content,
		"status":            input.Status,
		"metadata_json":     input.MetadataJSON,
	})
	if input.TextBlockID != nil || input.ProductionID != nil {
		productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
		if err != nil {
			return item, err
		}
		if productionID != nil {
			updates["production_id"] = *productionID
		}
		if textBlockID != nil {
			updates["text_block_id"] = *textBlockID
		}
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]model.ProductionTextBlock, error) {
	return s.repo.ListProductionTextBlocks(ctx, filter)
}

func (s *Service) CreateProductionTextBlock(ctx context.Context, projectID uint, input CreateProductionTextBlockInput) (model.ProductionTextBlock, error) {
	if err := s.ensureProductionInProject(ctx, projectID, input.ProductionID); err != nil {
		return model.ProductionTextBlock{}, err
	}
	if input.ParentBlockID != nil {
		if err := s.ensureProductionTextBlockInProject(ctx, projectID, *input.ParentBlockID); err != nil {
			return model.ProductionTextBlock{}, err
		}
	}
	item := model.ProductionTextBlock{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		ParentBlockID: input.ParentBlockID,
		Kind:          fallbackString(input.Kind, "section"),
		Order:         input.Order,
		Title:         input.Title,
		Content:       input.Content,
		Summary:       input.Summary,
		SourceType:    fallbackString(input.SourceType, "manual"),
		Status:        fallbackString(input.Status, "draft"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchProductionTextBlock(ctx context.Context, projectID uint, id string, input PatchProductionTextBlockInput) (model.ProductionTextBlock, error) {
	var item model.ProductionTextBlock
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
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
	updates := compactUpdates(map[string]any{
		"parent_block_id": input.ParentBlockID,
		"kind":            input.Kind,
		"order":           input.Order,
		"title":           input.Title,
		"content":         input.Content,
		"summary":         input.Summary,
		"source_type":     input.SourceType,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
	if input.ProductionID != nil {
		updates["production_id"] = *input.ProductionID
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]model.SceneMoment, error) {
	return s.repo.ListSceneMoments(ctx, filter)
}

func (s *Service) CreateSceneMoment(ctx context.Context, projectID uint, input CreateSceneMomentInput) (model.SceneMoment, error) {
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return model.SceneMoment{}, err
		}
	}
	item := model.SceneMoment{
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
		Status:        fallbackString(input.Status, "draft"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchSceneMoment(ctx context.Context, projectID uint, id string, input PatchSceneMomentInput) (model.SceneMoment, error) {
	var item model.SceneMoment
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return item, err
		}
	}
	updates := compactUpdates(map[string]any{
		"segment_id":     input.SegmentID,
		"order":          input.Order,
		"title":          input.Title,
		"description":    input.Description,
		"time_text":      input.TimeText,
		"location_text":  input.LocationText,
		"condition_text": input.ConditionText,
		"action_text":    input.ActionText,
		"mood":           input.Mood,
		"status":         input.Status,
		"metadata_json":  input.MetadataJSON,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) resolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	return s.repo.ResolveSegmentOwners(ctx, projectID, productionID, textBlockID)
}
