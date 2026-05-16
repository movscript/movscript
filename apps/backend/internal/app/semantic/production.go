package semantic

import (
	"context"
	"errors"
	"strconv"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListProductions(ctx context.Context, filter ProductionFilter) ([]domainsemantic.Production, error) {
	return s.repo.ListProductions(ctx, filter)
}

func (s *Service) CreateProduction(ctx context.Context, projectID uint, input ProductionInput) (domainsemantic.Production, error) {
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return domainsemantic.Production{}, err
	}
	item := domainsemantic.NewProduction(domainsemantic.ProductionSpec{
		ProjectID:         projectID,
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		SourceType:        input.SourceType,
		OwnerLabel:        input.OwnerLabel,
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	})
	var created domainsemantic.Production
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateProduction(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertProductionRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchProduction(ctx context.Context, projectID uint, id string, input ProductionInput) (domainsemantic.Production, error) {
	item, err := s.repo.LoadProduction(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return item, err
	}
	if err := s.ensureProductionSourceCanChange(ctx, projectID, item, input); err != nil {
		return item, err
	}
	patch := domainsemantic.ProductionPatch{
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		SourceType:        input.SourceType,
		OwnerLabel:        input.OwnerLabel,
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	}
	var patched domainsemantic.Production
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchProduction(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertProductionRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ensureProductionSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.Production, input ProductionInput) error {
	if productionSourcePreserved(item, input) {
		return nil
	}
	status, err := s.productionSourceLockStatus(ctx, projectID, item)
	if err != nil {
		return err
	}
	return status.ErrSourceChangeLocked("production source cannot be changed after downstream items are created")
}

func productionSourcePreserved(item domainsemantic.Production, input ProductionInput) bool {
	return optionalUintPatchPreserves(item.ScriptVersionID, input.ScriptVersionID) &&
		optionalUintPatchPreserves(item.PreviewTimelineID, input.PreviewTimelineID) &&
		stringPatchPreserves(item.SourceType, input.SourceType)
}

func (s *Service) upsertProductionRelations(ctx context.Context, item domainsemantic.Production) error {
	for _, edgeType := range []string{domainrelation.TypeDerivedFrom, domainrelation.TypeUsesPreview} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryStructure,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("production", item.ID),
		}); err != nil {
			return err
		}
	}
	if item.ScriptVersionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", item.ID),
			Target:    domainrelation.NewEntityRef("script_version", *item.ScriptVersionID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeDerivedFrom,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.PreviewTimelineID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", item.ID),
			Target:    domainrelation.NewEntityRef("preview_timeline", *item.PreviewTimelineID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeUsesPreview,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func stringPatchPreserves(existing string, patch string) bool {
	patch = strings.TrimSpace(patch)
	if patch == "" {
		return true
	}
	return strings.TrimSpace(existing) == patch
}

func (s *Service) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error) {
	if contentUnitFilterUsesRelations(filter) {
		return s.listContentUnitsFromRelations(ctx, filter)
	}
	return s.repo.ListContentUnits(ctx, filter)
}

func contentUnitFilterUsesRelations(filter ContentUnitFilter) bool {
	return filter.ProductionID > 0 || filter.SegmentID > 0 || filter.SceneMomentID > 0 || filter.ScriptBlockID > 0 || len(filter.ScriptBlockIDs) > 0
}

func (s *Service) listContentUnitsFromRelations(ctx context.Context, filter ContentUnitFilter) ([]domainsemantic.ContentUnit, error) {
	selection := relationIDSelection{}
	if filter.ProductionID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureContainsFilter(filter.ProjectID, "production", filter.ProductionID), "content_unit")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.SegmentID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureContainsFilter(filter.ProjectID, "segment", filter.SegmentID), "content_unit")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.SceneMomentID > 0 {
		ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "scene_moment", filter.SceneMomentID), "content_unit")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.ScriptBlockID > 0 {
		ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", filter.ScriptBlockID), "content_unit")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if len(filter.ScriptBlockIDs) > 0 {
		union := relationIDSelection{}
		for _, scriptBlockID := range filter.ScriptBlockIDs {
			ids, err := s.relatedSourceIDs(ctx, structureBasedOnTargetFilter(filter.ProjectID, "script_block", scriptBlockID), "content_unit")
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
	units := make([]domainsemantic.ContentUnit, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		unit, err := s.repo.LoadContentUnit(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		units = append(units, unit)
	}
	return units, nil
}

func (s *Service) CreateContentUnit(ctx context.Context, projectID uint, input ContentUnitInput) (domainsemantic.ContentUnit, error) {
	resolvedScriptBlockID, err := s.resolveContentUnitScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	if err := s.validateContentUnitScriptSource(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return domainsemantic.ContentUnit{}, err
	}
	item := contentUnitFromInput(projectID, input)
	var created domainsemantic.ContentUnit
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateContentUnit(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertContentUnitRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchContentUnit(ctx context.Context, projectID uint, id string, input ContentUnitInput) (domainsemantic.ContentUnit, error) {
	item, err := s.repo.LoadContentUnit(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	resolvedScriptBlockID, err := s.resolveContentUnitScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return item, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return item, err
	}
	if err := s.validateContentUnitScriptSource(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID); err != nil {
		return item, err
	}
	patch := contentUnitPatch(input)
	if err := s.ensureContentUnitSourceCanChange(ctx, projectID, item, patch); err != nil {
		return item, err
	}
	var patched domainsemantic.ContentUnit
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchContentUnit(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertContentUnitRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ensureContentUnitSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) error {
	if contentUnitSourcePreserved(item, patch) {
		return nil
	}
	status, err := s.contentUnitSourceLockStatus(ctx, projectID, item)
	if err != nil {
		return err
	}
	return status.ErrSourceChangeLocked("content unit source cannot be changed after downstream items are created")
}

func contentUnitSourcePreserved(item domainsemantic.ContentUnit, patch domainsemantic.ContentUnitPatch) bool {
	return optionalUintPatchPreserves(item.ProductionID, patch.ProductionID) &&
		optionalUintPatchPreserves(item.SegmentID, patch.SegmentID) &&
		optionalUintPatchPreserves(item.SceneMomentID, patch.SceneMomentID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, patch.ScriptBlockID)
}

func (s *Service) upsertContentUnitRelations(ctx context.Context, item domainsemantic.ContentUnit) error {
	for _, edgeType := range []string{domainrelation.TypeContains, domainrelation.TypeCompilesTo} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryStructure,
			Type:      edgeType,
			Target:    domainrelation.NewEntityRef("content_unit", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("content_unit", item.ID),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Target:    domainrelation.NewEntityRef("content_unit", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.SegmentID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("segment", *item.SegmentID),
			Target:    domainrelation.NewEntityRef("content_unit", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.SceneMomentID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("content_unit", item.ID),
			Target:    domainrelation.NewEntityRef("scene_moment", *item.SceneMomentID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeBasedOn,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ScriptBlockID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("content_unit", item.ID),
			Target:    domainrelation.NewEntityRef("script_block", *item.ScriptBlockID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeBasedOn,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func ensureOptionalIDMatches(inputID *uint, ownerID *uint, message string) error {
	if inputID == nil || ownerID == nil {
		return nil
	}
	if *inputID != *ownerID {
		return ErrInvalidInput{Err: errors.New(message)}
	}
	return nil
}

func (s *Service) resolveContentUnitScriptBlock(ctx context.Context, projectID uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) (*uint, error) {
	if scriptBlockID != nil {
		return scriptBlockID, nil
	}
	if sceneMomentID != nil {
		sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(*sceneMomentID), 10))
		if err != nil {
			return nil, err
		}
		if sceneMoment.ScriptBlockID != nil {
			return sceneMoment.ScriptBlockID, nil
		}
		if sceneMoment.SegmentID != nil {
			segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*sceneMoment.SegmentID), 10))
			if err != nil {
				return nil, err
			}
			return segment.ScriptBlockID, nil
		}
	}
	if segmentID != nil {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
		if err != nil {
			return nil, err
		}
		if segment.ScriptBlockID != nil {
			return segment.ScriptBlockID, nil
		}
	}
	return nil, nil
}

func (s *Service) validateContentUnitScriptSource(ctx context.Context, projectID uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) error {
	var segmentScriptBlockID *uint
	if segmentID != nil {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*segmentID), 10))
		if err != nil {
			return err
		}
		segmentScriptBlockID = segment.ScriptBlockID
	}
	if sceneMomentID == nil {
		return s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, scriptBlockID, segmentScriptBlockID)
	}
	sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(*sceneMomentID), 10))
	if err != nil {
		return err
	}
	if segmentID != nil {
		if sceneMoment.SegmentID == nil || *sceneMoment.SegmentID != *segmentID {
			return ErrInvalidInput{Err: errors.New("scene_moment_id must belong to segment_id")}
		}
	}
	if err := s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, sceneMoment.ScriptBlockID, segmentScriptBlockID); err != nil {
		return err
	}
	return s.ensureScriptBlockCompatibleWithAncestor(ctx, projectID, scriptBlockID, sceneMoment.ScriptBlockID)
}

func (s *Service) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]domainsemantic.Keyframe, error) {
	if keyframeFilterUsesRelations(filter) {
		return s.listKeyframesFromRelations(ctx, filter)
	}
	return s.repo.ListKeyframes(ctx, filter)
}

func keyframeFilterUsesRelations(filter KeyframeFilter) bool {
	return filter.ProductionID > 0 || filter.SceneMomentID > 0 || filter.ContentUnitID > 0
}

func (s *Service) listKeyframesFromRelations(ctx context.Context, filter KeyframeFilter) ([]domainsemantic.Keyframe, error) {
	selection := relationIDSelection{}
	if filter.ProductionID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureHasKeyframeFilter(filter.ProjectID, "production", filter.ProductionID), "keyframe")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.SceneMomentID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureHasKeyframeFilter(filter.ProjectID, "scene_moment", filter.SceneMomentID), "keyframe")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if filter.ContentUnitID > 0 {
		ids, err := s.relatedTargetIDs(ctx, structureHasKeyframeFilter(filter.ProjectID, "content_unit", filter.ContentUnitID), "keyframe")
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	keyframes := make([]domainsemantic.Keyframe, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		keyframe, err := s.repo.LoadKeyframe(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		keyframes = append(keyframes, keyframe)
	}
	return keyframes, nil
}

func (s *Service) CreateKeyframe(ctx context.Context, projectID uint, input KeyframeInput) (domainsemantic.Keyframe, error) {
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return domainsemantic.Keyframe{}, err
	}
	item := domainsemantic.NewKeyframe(domainsemantic.KeyframeSpec{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		ResourceID:    input.ResourceID,
		CanvasID:      input.CanvasID,
		Title:         input.Title,
		Description:   input.Description,
		Prompt:        input.Prompt,
		Order:         input.Order,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	})
	var created domainsemantic.Keyframe
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateKeyframe(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertKeyframeRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchKeyframe(ctx context.Context, projectID uint, id string, input KeyframeInput) (domainsemantic.Keyframe, error) {
	item, err := s.repo.LoadKeyframe(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return item, err
	}
	patch := domainsemantic.KeyframePatch{
		ProductionID:  input.ProductionID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		ResourceID:    input.ResourceID,
		CanvasID:      input.CanvasID,
		Title:         input.Title,
		Description:   input.Description,
		Prompt:        input.Prompt,
		Order:         input.Order,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
	var patched domainsemantic.Keyframe
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchKeyframe(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertKeyframeRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertKeyframeRelations(ctx context.Context, item domainsemantic.Keyframe) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Target:    domainrelation.NewEntityRef("keyframe", item.ID),
	}); err != nil {
		return err
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeUsesResource,
		Source:    domainrelation.NewEntityRef("keyframe", item.ID),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Target:    domainrelation.NewEntityRef("keyframe", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeHasKeyframe,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.SceneMomentID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("scene_moment", *item.SceneMomentID),
			Target:    domainrelation.NewEntityRef("keyframe", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeHasKeyframe,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ContentUnitID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("content_unit", *item.ContentUnitID),
			Target:    domainrelation.NewEntityRef("keyframe", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeHasKeyframe,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ResourceID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("keyframe", item.ID),
			Target:    domainrelation.NewEntityRef("raw_resource", *item.ResourceID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeUsesResource,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]domainsemantic.PreviewTimeline, error) {
	if filter.ProductionID > 0 {
		return s.listPreviewTimelinesFromRelations(ctx, filter)
	}
	return s.repo.ListPreviewTimelines(ctx, filter)
}

func (s *Service) listPreviewTimelinesFromRelations(ctx context.Context, filter PreviewTimelineFilter) ([]domainsemantic.PreviewTimeline, error) {
	ids, err := s.relatedSourceIDs(ctx, structureDerivedFromTargetFilter(filter.ProjectID, "production", filter.ProductionID), "preview_timeline")
	if err != nil {
		return nil, err
	}
	timelines := make([]domainsemantic.PreviewTimeline, 0, len(ids))
	for _, id := range ids {
		timeline, err := s.repo.LoadPreviewTimeline(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		timelines = append(timelines, timeline)
	}
	return timelines, nil
}

func (s *Service) CreatePreviewTimeline(ctx context.Context, projectID uint, input PreviewTimelineInput) (domainsemantic.PreviewTimeline, error) {
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return domainsemantic.PreviewTimeline{}, err
	}
	item := domainsemantic.NewPreviewTimeline(domainsemantic.PreviewTimelineSpec{
		ProjectID:       projectID,
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Status:          input.Status,
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	})
	var created domainsemantic.PreviewTimeline
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreatePreviewTimeline(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertPreviewTimelineRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchPreviewTimeline(ctx context.Context, projectID uint, id string, input PreviewTimelineInput) (domainsemantic.PreviewTimeline, error) {
	item, err := s.repo.LoadPreviewTimeline(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return item, err
	}
	patch := domainsemantic.PreviewTimelinePatch{
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Status:          input.Status,
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	var patched domainsemantic.PreviewTimeline
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchPreviewTimeline(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertPreviewTimelineRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertPreviewTimelineRelations(ctx context.Context, item domainsemantic.PreviewTimeline) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("preview_timeline", item.ID),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("preview_timeline", item.ID),
			Target:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeDerivedFrom,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.ScriptVersionID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("preview_timeline", item.ID),
			Target:    domainrelation.NewEntityRef("script_version", *item.ScriptVersionID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeDerivedFrom,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]domainsemantic.PreviewTimelineItem, error) {
	return s.repo.ListPreviewTimelineItems(ctx, filter)
}

func (s *Service) CreatePreviewTimelineItem(ctx context.Context, projectID uint, timelineID uint, input PreviewTimelineItemInput) (domainsemantic.PreviewTimelineItem, error) {
	if timelineID == 0 {
		timelineID = input.PreviewTimelineID
	}
	if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
		return domainsemantic.PreviewTimelineItem{}, err
	}
	item := previewTimelineItemFromInput(projectID, timelineID, input)
	var created domainsemantic.PreviewTimelineItem
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreatePreviewTimelineItem(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertPreviewTimelineItemRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchPreviewTimelineItem(ctx context.Context, projectID uint, id string, timelineID uint, input PreviewTimelineItemInput) (domainsemantic.PreviewTimelineItem, error) {
	item, err := s.repo.LoadPreviewTimelineItem(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if timelineID > 0 {
		if item.PreviewTimelineID != timelineID {
			return item, ErrNotFound
		}
	} else {
		timelineID = input.PreviewTimelineID
		if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
			return item, err
		}
	}
	patch := previewTimelineItemPatch(input)
	if timelineID > 0 && input.PreviewTimelineID > 0 {
		patch.PreviewTimelineID = timelineID
	}
	var patched domainsemantic.PreviewTimelineItem
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchPreviewTimelineItem(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertPreviewTimelineItemRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertPreviewTimelineItemRelations(ctx context.Context, item domainsemantic.PreviewTimelineItem) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("preview_timeline_item", item.ID),
	}); err != nil {
		return err
	}
	for _, edgeType := range []string{domainrelation.TypeRepresents, domainrelation.TypeUses} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryStructure,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("preview_timeline_item", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("preview_timeline", item.PreviewTimelineID),
		Target:    domainrelation.NewEntityRef("preview_timeline_item", item.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Order:     item.Order,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	for _, target := range []struct {
		entityType string
		id         *uint
		edgeType   string
	}{
		{entityType: "segment", id: item.SegmentID, edgeType: domainrelation.TypeRepresents},
		{entityType: "scene_moment", id: item.SceneMomentID, edgeType: domainrelation.TypeRepresents},
		{entityType: "content_unit", id: item.ContentUnitID, edgeType: domainrelation.TypeRepresents},
		{entityType: "keyframe", id: item.KeyframeID, edgeType: domainrelation.TypeUses},
	} {
		if target.id == nil {
			continue
		}
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("preview_timeline_item", item.ID),
			Target:    domainrelation.NewEntityRef(target.entityType, *target.id),
			Category:  domainrelation.CategoryStructure,
			Type:      target.edgeType,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	return nil
}

func contentUnitFromInput(projectID uint, input ContentUnitInput) domainsemantic.ContentUnit {
	return domainsemantic.NewContentUnit(domainsemantic.ContentUnitSpec{
		ProjectID:        projectID,
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		ScriptBlockID:    input.ScriptBlockID,
		Kind:             input.Kind,
		Order:            input.Order,
		Title:            input.Title,
		Description:      input.Description,
		Prompt:           input.Prompt,
		DurationSec:      input.DurationSec,
		ShotSize:         input.ShotSize,
		CameraAngle:      input.CameraAngle,
		CameraHeight:     input.CameraHeight,
		CameraMotion:     input.CameraMotion,
		MotionIntensity:  input.MotionIntensity,
		CameraSpeed:      input.CameraSpeed,
		Lens:             input.Lens,
		FocalLength:      input.FocalLength,
		FocusSubject:     input.FocusSubject,
		CompositionStart: input.CompositionStart,
		CompositionEnd:   input.CompositionEnd,
		Stabilization:    input.Stabilization,
		CameraParamsJSON: input.CameraParamsJSON,
		CameraNotes:      input.CameraNotes,
		Status:           input.Status,
		MetadataJSON:     input.MetadataJSON,
	})
}

func contentUnitPatch(input ContentUnitInput) domainsemantic.ContentUnitPatch {
	return domainsemantic.ContentUnitPatch{
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		ScriptBlockID:    input.ScriptBlockID,
		Kind:             input.Kind,
		Order:            input.Order,
		Title:            input.Title,
		Description:      input.Description,
		Prompt:           input.Prompt,
		DurationSec:      input.DurationSec,
		ShotSize:         input.ShotSize,
		CameraAngle:      input.CameraAngle,
		CameraHeight:     input.CameraHeight,
		CameraMotion:     input.CameraMotion,
		MotionIntensity:  input.MotionIntensity,
		CameraSpeed:      input.CameraSpeed,
		Lens:             input.Lens,
		FocalLength:      input.FocalLength,
		FocusSubject:     input.FocusSubject,
		CompositionStart: input.CompositionStart,
		CompositionEnd:   input.CompositionEnd,
		Stabilization:    input.Stabilization,
		CameraParamsJSON: input.CameraParamsJSON,
		CameraNotes:      input.CameraNotes,
		Status:           input.Status,
		MetadataJSON:     input.MetadataJSON,
	}
}

func previewTimelineItemFromInput(projectID uint, timelineID uint, input PreviewTimelineItemInput) domainsemantic.PreviewTimelineItem {
	return domainsemantic.NewPreviewTimelineItem(domainsemantic.PreviewTimelineItemSpec{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
		SegmentID:         input.SegmentID,
		SceneMomentID:     input.SceneMomentID,
		ContentUnitID:     input.ContentUnitID,
		KeyframeID:        input.KeyframeID,
		Kind:              input.Kind,
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            input.Status,
		MetadataJSON:      input.MetadataJSON,
	})
}

func previewTimelineItemPatch(input PreviewTimelineItemInput) domainsemantic.PreviewTimelineItemPatch {
	return domainsemantic.PreviewTimelineItemPatch{
		SegmentID:     input.SegmentID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		KeyframeID:    input.KeyframeID,
		Kind:          input.Kind,
		Order:         input.Order,
		StartSec:      input.StartSec,
		DurationSec:   input.DurationSec,
		Label:         input.Label,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
}
