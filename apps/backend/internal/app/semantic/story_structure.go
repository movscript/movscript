package semantic

import (
	"context"
	"errors"
	"strconv"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListSegments(ctx context.Context, filter SegmentFilter) ([]domainsemantic.Segment, error) {
	if segmentFilterUsesRelations(filter) {
		return s.listSegmentsFromRelations(ctx, filter)
	}
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
	var created domainsemantic.Segment
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateSegment(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertSegmentRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.Segment
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchSegment(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertSegmentRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ensureSegmentSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.Segment, patch domainsemantic.SegmentPatch) error {
	if segmentSourcePreserved(item, patch) {
		return nil
	}
	status, err := s.segmentSourceLockStatus(ctx, projectID, item)
	if err != nil {
		return err
	}
	return status.ErrSourceChangeLocked("segment source cannot be changed after downstream items are created")
}

func segmentSourcePreserved(item domainsemantic.Segment, patch domainsemantic.SegmentPatch) bool {
	return optionalUintPatchPreserves(item.ProductionID, patch.ProductionID) &&
		optionalUintPatchPreserves(item.TextBlockID, patch.TextBlockID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, patch.ScriptBlockID) &&
		optionalUintPatchPreserves(item.ParentSegmentID, patch.ParentSegmentID)
}

func (s *Service) upsertSegmentRelations(ctx context.Context, item domainsemantic.Segment) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("segment", item.ID),
	}); err != nil {
		return err
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("segment", item.ID),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Target:    domainrelation.NewEntityRef("segment", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ParentSegmentID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("segment", *item.ParentSegmentID),
			Target:    domainrelation.NewEntityRef("segment", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ScriptBlockID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("segment", item.ID),
			Target:    domainrelation.NewEntityRef("script_block", *item.ScriptBlockID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeBasedOn,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.TextBlockID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("segment", item.ID),
			Target:    domainrelation.NewEntityRef("production_text_block", *item.TextBlockID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeBasedOn,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]domainsemantic.ProductionTextBlock, error) {
	if filter.ProductionID > 0 {
		return s.listProductionTextBlocksFromRelations(ctx, filter)
	}
	return s.repo.ListProductionTextBlocks(ctx, filter)
}

func (s *Service) listProductionTextBlocksFromRelations(ctx context.Context, filter ProductionTextBlockFilter) ([]domainsemantic.ProductionTextBlock, error) {
	ids, err := s.relatedTargetIDs(ctx, structureContainsFilter(filter.ProjectID, "production", filter.ProductionID), "production_text_block")
	if err != nil {
		return nil, err
	}
	blocks := make([]domainsemantic.ProductionTextBlock, 0, len(ids))
	for _, id := range ids {
		block, err := s.repo.LoadProductionTextBlock(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if filter.Status != "" && block.Status != filter.Status {
			continue
		}
		blocks = append(blocks, block)
	}
	return blocks, nil
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
	var created domainsemantic.ProductionTextBlock
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateProductionTextBlock(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertProductionTextBlockRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.ProductionTextBlock
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchProductionTextBlock(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertProductionTextBlockRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertProductionTextBlockRelations(ctx context.Context, item domainsemantic.ProductionTextBlock) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("production_text_block", item.ID),
	}); err != nil {
		return err
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("production", item.ProductionID),
		Target:    domainrelation.NewEntityRef("production_text_block", item.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Order:     item.Order,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	if item.ParentBlockID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production_text_block", *item.ParentBlockID),
			Target:    domainrelation.NewEntityRef("production_text_block", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]domainsemantic.SceneMoment, error) {
	if sceneMomentFilterUsesRelations(filter) {
		return s.listSceneMomentsFromRelations(ctx, filter)
	}
	return s.repo.ListSceneMoments(ctx, filter)
}

func segmentFilterUsesRelations(filter SegmentFilter) bool {
	return filter.ProductionID > 0 || filter.TextBlockID > 0 || filter.ScriptBlockID > 0 || len(filter.ScriptBlockIDs) > 0
}

func sceneMomentFilterUsesRelations(filter SceneMomentFilter) bool {
	return filter.SegmentID > 0 || filter.ScriptBlockID > 0 || len(filter.ScriptBlockIDs) > 0
}

func (s *Service) listSegmentsFromRelations(ctx context.Context, filter SegmentFilter) ([]domainsemantic.Segment, error) {
	selection := relationIDSelection{}
	if filter.ProductionID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureContainsFilter(filter.ProjectID, "production", filter.ProductionID), "segment")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.TextBlockID > 0 {
		ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "production_text_block", filter.TextBlockID), "segment")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.ScriptBlockID > 0 {
		ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", filter.ScriptBlockID), "segment")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if len(filter.ScriptBlockIDs) > 0 {
		union := relationIDSelection{}
		for _, scriptBlockID := range filter.ScriptBlockIDs {
			ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", scriptBlockID), "segment")
			if err != nil {
				return nil, err
			}
			for _, id := range ids {
				if _, ok := union.seen[id]; ok {
					continue
				}
				if union.seen == nil {
					union.seen = make(map[uint]struct{})
				}
				union.seen[id] = struct{}{}
				union.ordered = append(union.ordered, id)
			}
		}
		selection = selection.intersect(union.ordered)
	}
	segments := make([]domainsemantic.Segment, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		segment, err := s.repo.LoadSegment(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if filter.Status != "" && segment.Status != filter.Status {
			continue
		}
		segments = append(segments, segment)
	}
	return segments, nil
}

func (s *Service) listSceneMomentsFromRelations(ctx context.Context, filter SceneMomentFilter) ([]domainsemantic.SceneMoment, error) {
	selection := relationIDSelection{}
	if filter.SegmentID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureContainsFilter(filter.ProjectID, "segment", filter.SegmentID), "scene_moment")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.ScriptBlockID > 0 {
		ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", filter.ScriptBlockID), "scene_moment")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if len(filter.ScriptBlockIDs) > 0 {
		union := relationIDSelection{}
		for _, scriptBlockID := range filter.ScriptBlockIDs {
			ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", scriptBlockID), "scene_moment")
			if err != nil {
				return nil, err
			}
			for _, id := range ids {
				if _, ok := union.seen[id]; ok {
					continue
				}
				if union.seen == nil {
					union.seen = make(map[uint]struct{})
				}
				union.seen[id] = struct{}{}
				union.ordered = append(union.ordered, id)
			}
		}
		selection = selection.intersect(union.ordered)
	}
	moments := make([]domainsemantic.SceneMoment, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		moment, err := s.repo.LoadSceneMoment(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		moments = append(moments, moment)
	}
	return moments, nil
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
	var created domainsemantic.SceneMoment
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateSceneMoment(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertSceneMomentRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.SceneMoment
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchSceneMoment(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertSceneMomentRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ensureSceneMomentSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.SceneMoment, input PatchSceneMomentInput) error {
	if sceneMomentSourcePreserved(item, input) {
		return nil
	}
	status, err := s.sceneMomentSourceLockStatus(ctx, projectID, item)
	if err != nil {
		return err
	}
	return status.ErrSourceChangeLocked("scene moment source cannot be changed after downstream items are created")
}

func sceneMomentSourcePreserved(item domainsemantic.SceneMoment, input PatchSceneMomentInput) bool {
	return optionalUintPatchPreserves(item.SegmentID, input.SegmentID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, input.ScriptBlockID)
}

func (s *Service) upsertSceneMomentRelations(ctx context.Context, item domainsemantic.SceneMoment) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("scene_moment", item.ID),
	}); err != nil {
		return err
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("scene_moment", item.ID),
	}); err != nil {
		return err
	}
	if item.SegmentID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("segment", *item.SegmentID),
			Target:    domainrelation.NewEntityRef("scene_moment", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ScriptBlockID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("scene_moment", item.ID),
			Target:    domainrelation.NewEntityRef("script_block", *item.ScriptBlockID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeBasedOn,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
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
