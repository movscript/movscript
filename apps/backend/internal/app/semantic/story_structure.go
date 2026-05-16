package semantic

import (
	"context"
	"errors"
	"strconv"

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
	if input.ScriptBlockID != nil {
		if err := s.ensureScriptBlockInProject(ctx, projectID, *input.ScriptBlockID); err != nil {
			return domainsemantic.Segment{}, err
		}
	}
	item := domainsemantic.NewSegment(domainsemantic.SegmentSpec{
		ProjectID:       projectID,
		ProductionID:    productionID,
		TextBlockID:     textBlockID,
		ScriptBlockID:   input.ScriptBlockID,
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
		ScriptBlockID:   input.ScriptBlockID,
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
	if input.ScriptBlockID != nil {
		if err := s.ensureScriptBlockInProject(ctx, projectID, *input.ScriptBlockID); err != nil {
			return item, err
		}
	}
	if err := s.ensureSegmentSourceCanChange(ctx, projectID, item, patch); err != nil {
		return item, err
	}
	return s.repo.PatchSegment(ctx, item, patch)
}

func (s *Service) ensureSegmentSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.Segment, patch domainsemantic.SegmentPatch) error {
	if segmentSourcePreserved(item, patch) {
		return nil
	}
	moments, err := s.repo.ListSceneMoments(ctx, SceneMomentFilter{ProjectID: projectID, SegmentID: item.ID})
	if err != nil {
		return err
	}
	if len(moments) > 0 {
		return ErrInvalidInput{Err: errors.New("segment source cannot be changed after scene moments are created")}
	}
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SegmentID: item.ID})
	if err != nil {
		return err
	}
	if len(units) > 0 {
		return ErrInvalidInput{Err: errors.New("segment source cannot be changed after content units are created")}
	}
	return nil
}

func segmentSourcePreserved(item domainsemantic.Segment, patch domainsemantic.SegmentPatch) bool {
	return optionalUintPatchPreserves(item.ProductionID, patch.ProductionID) &&
		optionalUintPatchPreserves(item.TextBlockID, patch.TextBlockID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, patch.ScriptBlockID) &&
		optionalUintPatchPreserves(item.ParentSegmentID, patch.ParentSegmentID)
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
	resolvedScriptBlockID, err := s.resolveSceneMomentScriptBlock(ctx, projectID, input.SegmentID, input.ScriptBlockID)
	if err != nil {
		return domainsemantic.SceneMoment{}, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateSceneMomentScriptSource(ctx, projectID, input.SegmentID, input.ScriptBlockID); err != nil {
		return domainsemantic.SceneMoment{}, err
	}
	item := domainsemantic.NewSceneMoment(domainsemantic.SceneMomentSpec{
		ProjectID:     projectID,
		SegmentID:     input.SegmentID,
		ScriptBlockID: input.ScriptBlockID,
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
	resolvedScriptBlockID, err := s.resolveSceneMomentScriptBlock(ctx, projectID, input.SegmentID, input.ScriptBlockID)
	if err != nil {
		return item, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateSceneMomentScriptSource(ctx, projectID, input.SegmentID, input.ScriptBlockID); err != nil {
		return item, err
	}
	if err := s.ensureSceneMomentSourceCanChange(ctx, projectID, item, input); err != nil {
		return item, err
	}
	patch := domainsemantic.SceneMomentPatch{
		SegmentID:     input.SegmentID,
		ScriptBlockID: input.ScriptBlockID,
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

func (s *Service) ensureSceneMomentSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.SceneMoment, input PatchSceneMomentInput) error {
	if sceneMomentSourcePreserved(item, input) {
		return nil
	}
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SceneMomentID: item.ID})
	if err != nil {
		return err
	}
	if len(units) > 0 {
		return ErrInvalidInput{Err: errors.New("scene moment source cannot be changed after content units are created")}
	}
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, SceneMomentID: item.ID})
	if err != nil {
		return err
	}
	if len(keyframes) > 0 {
		return ErrInvalidInput{Err: errors.New("scene moment source cannot be changed after keyframes are created")}
	}
	return nil
}

func sceneMomentSourcePreserved(item domainsemantic.SceneMoment, input PatchSceneMomentInput) bool {
	return optionalUintPatchPreserves(item.SegmentID, input.SegmentID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, input.ScriptBlockID)
}

func (s *Service) resolveSceneMomentScriptBlock(ctx context.Context, projectID uint, segmentID *uint, scriptBlockID *uint) (*uint, error) {
	if scriptBlockID != nil || segmentID == nil {
		return scriptBlockID, nil
	}
	segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
	if err != nil {
		return nil, err
	}
	return segment.ScriptBlockID, nil
}

func (s *Service) validateSceneMomentScriptSource(ctx context.Context, projectID uint, segmentID *uint, scriptBlockID *uint) error {
	if segmentID == nil {
		if scriptBlockID != nil {
			return s.ensureScriptBlockInProject(ctx, projectID, *scriptBlockID)
		}
		return nil
	}
	segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
	if err != nil {
		return err
	}
	return s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, scriptBlockID, segment.ScriptBlockID)
}

func (s *Service) resolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	return s.repo.ResolveSegmentOwners(ctx, projectID, productionID, textBlockID)
}

func (s *Service) ensureScriptBlockCompatibleWithAncestor(ctx context.Context, projectID uint, scriptBlockID *uint, ancestorScriptBlockID *uint) error {
	if scriptBlockID == nil {
		return nil
	}
	child, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*scriptBlockID), 10))
	if err != nil {
		return err
	}
	if ancestorScriptBlockID == nil {
		return nil
	}
	ancestor, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*ancestorScriptBlockID), 10))
	if err != nil {
		return err
	}
	if child.ScriptID != ancestor.ScriptID || child.ScriptVersionID != ancestor.ScriptVersionID {
		return ErrInvalidInput{Err: errors.New("script_block_id must belong to the same script version as its parent source")}
	}
	return nil
}
