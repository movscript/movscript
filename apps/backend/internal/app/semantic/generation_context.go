package semantic

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

const (
	GenerationIntentKeyframe = "keyframe"
	GenerationIntentVideo    = "video"
)

type GenerationContextRequest struct {
	TargetType string `json:"target_type"`
	TargetID   uint   `json:"target_id"`
	Intent     string `json:"intent"`
}

type GenerationContext struct {
	Target             GenerationContextTarget      `json:"target"`
	Intent             string                       `json:"intent"`
	Production         *domainsemantic.Production   `json:"production,omitempty"`
	Segment            *domainsemantic.Segment      `json:"segment,omitempty"`
	SceneMoment        *domainsemantic.SceneMoment  `json:"scene_moment,omitempty"`
	ScriptBlock        *domainsemantic.ScriptBlock  `json:"script_block,omitempty"`
	CreativeReferences []GenerationContextReference `json:"creative_references"`
	AssetSlots         []domainsemantic.AssetSlot   `json:"asset_slots"`
	Keyframes          []domainsemantic.Keyframe    `json:"keyframes"`
	Constraints        GenerationContextConstraints `json:"constraints"`
}

type GenerationContextTarget struct {
	Type        string                     `json:"type"`
	ContentUnit domainsemantic.ContentUnit `json:"content_unit"`
}

type GenerationContextReference struct {
	Usage     domainsemantic.CreativeReferenceUsage  `json:"usage"`
	Reference *domainsemantic.CreativeReference      `json:"reference,omitempty"`
	State     *domainsemantic.CreativeReferenceState `json:"state,omitempty"`
}

type GenerationContextConstraints struct {
	ReadOnlyEntities []string `json:"read_only_entities"`
	WriteTargets     []string `json:"write_targets"`
}

type GenerationContextError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Step       string `json:"step"`
	ProjectID  uint   `json:"project_id"`
	EntityType string `json:"entity_type"`
	EntityID   uint   `json:"entity_id"`
	OwnerType  string `json:"owner_type,omitempty"`
	OwnerID    uint   `json:"owner_id,omitempty"`
	Cause      string `json:"cause,omitempty"`
}

func (e GenerationContextError) Error() string {
	return e.Message
}

func (s *Service) BuildGenerationContext(ctx context.Context, projectID uint, req GenerationContextRequest) (GenerationContext, error) {
	if req.TargetType == "" {
		req.TargetType = "content_unit"
	}
	if req.TargetType != "content_unit" {
		return GenerationContext{}, GenerationContextError{
			Code:       "GENERATION_CONTEXT_UNSUPPORTED_TARGET",
			Message:    fmt.Sprintf("生成上下文只支持 content_unit 目标，收到 %q", req.TargetType),
			Step:       "validate_target",
			ProjectID:  projectID,
			EntityType: req.TargetType,
			EntityID:   req.TargetID,
		}
	}
	if req.TargetID == 0 {
		return GenerationContext{}, GenerationContextError{
			Code:       "GENERATION_CONTEXT_TARGET_REQUIRED",
			Message:    "生成上下文缺少 content_unit 目标 ID",
			Step:       "validate_target",
			ProjectID:  projectID,
			EntityType: "content_unit",
		}
	}
	intent := normalizeGenerationIntent(req.Intent)
	contentUnit, err := s.repo.LoadContentUnit(ctx, projectID, strconv.FormatUint(uint64(req.TargetID), 10))
	if err != nil {
		return GenerationContext{}, generationContextLoadError(projectID, "load_target", "content_unit", req.TargetID, err)
	}

	result := GenerationContext{
		Target: GenerationContextTarget{
			Type:        "content_unit",
			ContentUnit: contentUnit,
		},
		Intent: intent,
		Constraints: GenerationContextConstraints{
			ReadOnlyEntities: []string{"production", "segment", "scene_moment", "script_block", "creative_reference", "creative_reference_state", "content_unit"},
			WriteTargets:     generationWriteTargets(intent),
		},
	}
	relations, err := s.contentUnitContextRelations(ctx, projectID, contentUnit.ID)
	if err != nil {
		return GenerationContext{}, err
	}
	if productionID := relations.firstSourceID("production", domainrelation.TypeContains); productionID > 0 {
		production, err := s.repo.LoadProduction(ctx, projectID, strconv.FormatUint(uint64(productionID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_production", "production", productionID, err)
		}
		result.Production = &production
	}
	if segmentID := relations.firstSourceID("segment", domainrelation.TypeContains); segmentID > 0 {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(segmentID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_segment", "segment", segmentID, err)
		}
		result.Segment = &segment
	}
	if sceneMomentID := relations.firstTargetID("scene_moment", domainrelation.TypeBasedOn); sceneMomentID > 0 {
		sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(sceneMomentID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_scene_moment", "scene_moment", sceneMomentID, err)
		}
		result.SceneMoment = &sceneMoment
		if result.Segment == nil {
			segmentID, err := s.firstIncomingRelationSourceID(ctx, projectID, domainrelation.NewEntityRef("scene_moment", sceneMoment.ID), "segment", domainrelation.TypeContains)
			if err != nil {
				return GenerationContext{}, err
			}
			if segmentID > 0 {
				segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(segmentID), 10))
				if err != nil {
					return GenerationContext{}, generationContextLoadError(projectID, "load_scene_moment_segment", "segment", segmentID, err)
				}
				result.Segment = &segment
			}
		}
	}
	if scriptBlockID := relations.firstTargetID("script_block", domainrelation.TypeBasedOn); scriptBlockID > 0 {
		scriptBlock, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(scriptBlockID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_script_block", "script_block", scriptBlockID, err)
		}
		result.ScriptBlock = &scriptBlock
	}
	if result.ScriptBlock == nil {
		scriptBlockID, err := s.fallbackGenerationScriptBlockID(ctx, projectID, result.SceneMoment, result.Segment)
		if err != nil {
			return GenerationContext{}, err
		}
		if scriptBlockID > 0 {
			scriptBlock, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(scriptBlockID), 10))
			if err != nil {
				return GenerationContext{}, generationContextLoadError(projectID, "load_fallback_script_block", "script_block", scriptBlockID, err)
			}
			result.ScriptBlock = &scriptBlock
		}
	}

	references, err := s.collectGenerationReferences(ctx, projectID, contentUnit, result.Segment, result.SceneMoment)
	if err != nil {
		return GenerationContext{}, err
	}
	result.CreativeReferences = references

	assetSlots, err := s.collectGenerationAssetSlots(ctx, projectID, contentUnit, result.Segment, result.SceneMoment, references)
	if err != nil {
		return GenerationContext{}, err
	}
	result.AssetSlots = assetSlots

	keyframes, err := s.collectGenerationKeyframes(ctx, projectID, contentUnit.ID)
	if err != nil {
		return GenerationContext{}, err
	}
	result.Keyframes = keyframes
	return result, nil
}

type generationRelationSet []domainrelation.Edge

func (relations generationRelationSet) firstSourceID(sourceType string, edgeType string) uint {
	for _, edge := range relations {
		if edge.Source.Type == sourceType && edge.Type == edgeType {
			return edge.Source.ID
		}
	}
	return 0
}

func (relations generationRelationSet) firstTargetID(targetType string, edgeType string) uint {
	for _, edge := range relations {
		if edge.Target.Type == targetType && edge.Type == edgeType {
			return edge.Target.ID
		}
	}
	return 0
}

func (s *Service) contentUnitContextRelations(ctx context.Context, projectID uint, contentUnitID uint) (generationRelationSet, error) {
	incoming, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Target:    domainrelation.NewEntityRef("content_unit", contentUnitID),
	})
	if err != nil {
		return nil, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取内容单元关系失败", Step: "list_content_unit_incoming_relations", ProjectID: projectID, EntityType: "content_unit", EntityID: contentUnitID, Cause: err.Error()}
	}
	outgoing, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Source:    domainrelation.NewEntityRef("content_unit", contentUnitID),
	})
	if err != nil {
		return nil, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取内容单元关系失败", Step: "list_content_unit_outgoing_relations", ProjectID: projectID, EntityType: "content_unit", EntityID: contentUnitID, Cause: err.Error()}
	}
	return append(generationRelationSet(incoming), outgoing...), nil
}

func (s *Service) firstIncomingRelationSourceID(ctx context.Context, projectID uint, target domainrelation.EntityRef, sourceType string, edgeType string) (uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      edgeType,
		Target:    target,
	})
	if err != nil {
		return 0, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取上游关系失败", Step: "list_incoming_relations", ProjectID: projectID, EntityType: target.Type, EntityID: target.ID, Cause: err.Error()}
	}
	for _, edge := range edges {
		if edge.Source.Type == sourceType {
			return edge.Source.ID, nil
		}
	}
	return 0, nil
}

func (s *Service) fallbackGenerationScriptBlockID(ctx context.Context, projectID uint, sceneMoment *domainsemantic.SceneMoment, segment *domainsemantic.Segment) (uint, error) {
	if sceneMoment != nil {
		scriptBlockID, err := s.firstOutgoingRelationTargetID(ctx, projectID, domainrelation.NewEntityRef("scene_moment", sceneMoment.ID), "script_block", domainrelation.TypeBasedOn)
		if err != nil || scriptBlockID > 0 {
			return scriptBlockID, err
		}
	}
	if segment != nil {
		return s.firstOutgoingRelationTargetID(ctx, projectID, domainrelation.NewEntityRef("segment", segment.ID), "script_block", domainrelation.TypeBasedOn)
	}
	return 0, nil
}

func (s *Service) firstOutgoingRelationTargetID(ctx context.Context, projectID uint, source domainrelation.EntityRef, targetType string, edgeType string) (uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      edgeType,
		Source:    source,
	})
	if err != nil {
		return 0, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取下游关系失败", Step: "list_outgoing_relations", ProjectID: projectID, EntityType: source.Type, EntityID: source.ID, Cause: err.Error()}
	}
	for _, edge := range edges {
		if edge.Target.Type == targetType {
			return edge.Target.ID, nil
		}
	}
	return 0, nil
}

func (s *Service) targetIDsFromOutgoingRelations(ctx context.Context, projectID uint, source domainrelation.EntityRef, category string, edgeTypes []string, targetType string, step string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  category,
		Source:    source,
	})
	if err != nil {
		return nil, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取关系失败", Step: step, ProjectID: projectID, EntityType: source.Type, EntityID: source.ID, Cause: err.Error()}
	}
	allowed := map[string]struct{}{}
	for _, edgeType := range edgeTypes {
		allowed[edgeType] = struct{}{}
	}
	result := make([]uint, 0)
	seen := map[uint]struct{}{}
	for _, edge := range edges {
		if edge.Target.Type != targetType {
			continue
		}
		if len(allowed) > 0 {
			if _, ok := allowed[edge.Type]; !ok {
				continue
			}
		}
		if _, ok := seen[edge.Target.ID]; ok {
			continue
		}
		seen[edge.Target.ID] = struct{}{}
		result = append(result, edge.Target.ID)
	}
	return result, nil
}

func generationContextLoadError(projectID uint, step string, entityType string, entityID uint, err error) GenerationContextError {
	code := "GENERATION_CONTEXT_LOAD_FAILED"
	message := fmt.Sprintf("生成上下文读取失败：%s #%d", entityType, entityID)
	if errors.Is(err, ErrNotFound) {
		code = "GENERATION_CONTEXT_ENTITY_NOT_FOUND"
		message = fmt.Sprintf("生成上下文缺少 %s #%d，或该对象不属于项目 #%d", entityType, entityID, projectID)
	}
	return GenerationContextError{
		Code:       code,
		Message:    message,
		Step:       step,
		ProjectID:  projectID,
		EntityType: entityType,
		EntityID:   entityID,
		Cause:      err.Error(),
	}
}

func normalizeGenerationIntent(intent string) string {
	switch intent {
	case GenerationIntentVideo:
		return GenerationIntentVideo
	default:
		return GenerationIntentKeyframe
	}
}

func generationWriteTargets(intent string) []string {
	if intent == GenerationIntentVideo {
		return []string{"raw_resource", "resource_binding", "asset_slot_candidate", "preview_timeline_item"}
	}
	return []string{"raw_resource", "keyframe", "resource_binding", "asset_slot_candidate"}
}

func (s *Service) collectGenerationReferences(ctx context.Context, projectID uint, contentUnit domainsemantic.ContentUnit, segment *domainsemantic.Segment, sceneMoment *domainsemantic.SceneMoment) ([]GenerationContextReference, error) {
	owners := []domainrelation.EntityRef{domainrelation.NewEntityRef("content_unit", contentUnit.ID)}
	if sceneMoment != nil {
		owners = append(owners, domainrelation.NewEntityRef("scene_moment", sceneMoment.ID))
	}
	if segment != nil {
		owners = append(owners, domainrelation.NewEntityRef("segment", segment.ID))
	}

	items := make([]GenerationContextReference, 0)
	seen := make(map[uint]struct{})
	for _, owner := range owners {
		edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
			ProjectID: projectID,
			Category:  domainrelation.CategoryCreative,
			Type:      domainrelation.TypeUses,
			Source:    owner,
		})
		if err != nil {
			return nil, GenerationContextError{Code: "GENERATION_CONTEXT_RELATION_QUERY_FAILED", Message: "生成上下文读取设定引用关系失败", Step: "list_creative_reference_usage_relations", ProjectID: projectID, EntityType: owner.Type, EntityID: owner.ID, Cause: err.Error()}
		}
		for _, edge := range edges {
			if edge.Target.Type != "creative_reference" {
				continue
			}
			referenceID := edge.Target.ID
			if _, ok := seen[referenceID]; ok {
				continue
			}
			seen[referenceID] = struct{}{}
			item := GenerationContextReference{}
			if usageID := relationMetadataUint(edge.Metadata, "creative_reference_usage_id"); usageID > 0 {
				usage, err := s.repo.LoadCreativeReferenceUsage(ctx, projectID, strconv.FormatUint(uint64(usageID), 10))
				if err != nil {
					return nil, generationContextLoadError(projectID, "load_creative_reference_usage", "creative_reference_usage", usageID, err)
				}
				item.Usage = usage
			}
			ref, err := s.repo.LoadCreativeReference(ctx, projectID, strconv.FormatUint(uint64(referenceID), 10))
			if err != nil {
				return nil, generationContextLoadError(projectID, "load_creative_reference", "creative_reference", referenceID, err)
			}
			item.Reference = &ref
			if stateID := relationMetadataUint(edge.Metadata, "creative_reference_state_id"); stateID > 0 {
				state, err := s.repo.LoadCreativeReferenceState(ctx, projectID, strconv.FormatUint(uint64(stateID), 10))
				if err != nil {
					return nil, generationContextLoadError(projectID, "load_creative_reference_state", "creative_reference_state", stateID, err)
				}
				item.State = &state
			}
			items = append(items, item)
		}
	}
	return items, nil
}

func (s *Service) collectGenerationAssetSlots(ctx context.Context, projectID uint, contentUnit domainsemantic.ContentUnit, segment *domainsemantic.Segment, sceneMoment *domainsemantic.SceneMoment, references []GenerationContextReference) ([]domainsemantic.AssetSlot, error) {
	owners := []domainrelation.EntityRef{domainrelation.NewEntityRef("content_unit", contentUnit.ID)}
	if sceneMoment != nil {
		owners = append(owners, domainrelation.NewEntityRef("scene_moment", sceneMoment.ID))
	}
	if segment != nil {
		owners = append(owners, domainrelation.NewEntityRef("segment", segment.ID))
	}
	for _, ref := range references {
		if ref.Reference != nil {
			owners = append(owners, domainrelation.NewEntityRef("creative_reference", ref.Reference.ID))
		}
		if ref.State != nil {
			owners = append(owners, domainrelation.NewEntityRef("creative_reference_state", ref.State.ID))
		}
	}

	items := make([]domainsemantic.AssetSlot, 0)
	seen := make(map[uint]struct{})
	for _, owner := range owners {
		slotIDs, err := s.targetIDsFromOutgoingRelations(ctx, projectID, owner, domainrelation.CategoryAsset, []string{domainrelation.TypeNeedsAsset, domainrelation.TypeUsesAsset, domainrelation.TypeHasAsset}, "asset_slot", "list_asset_slot_relations")
		if err != nil {
			return nil, err
		}
		for _, slotID := range slotIDs {
			if _, ok := seen[slotID]; ok {
				continue
			}
			seen[slotID] = struct{}{}
			slot, err := s.repo.LoadAssetSlot(ctx, projectID, strconv.FormatUint(uint64(slotID), 10))
			if err != nil {
				return nil, generationContextLoadError(projectID, "load_asset_slot", "asset_slot", slotID, err)
			}
			items = append(items, slot)
		}
	}
	return items, nil
}

func (s *Service) collectGenerationKeyframes(ctx context.Context, projectID uint, contentUnitID uint) ([]domainsemantic.Keyframe, error) {
	keyframeIDs, err := s.targetIDsFromOutgoingRelations(
		ctx,
		projectID,
		domainrelation.NewEntityRef("content_unit", contentUnitID),
		domainrelation.CategoryStructure,
		[]string{domainrelation.TypeHasKeyframe},
		"keyframe",
		"list_content_unit_keyframe_relations",
	)
	if err != nil {
		return nil, err
	}
	items := make([]domainsemantic.Keyframe, 0, len(keyframeIDs))
	for _, keyframeID := range keyframeIDs {
		keyframe, err := s.repo.LoadKeyframe(ctx, projectID, strconv.FormatUint(uint64(keyframeID), 10))
		if err != nil {
			return nil, generationContextLoadError(projectID, "load_keyframe", "keyframe", keyframeID, err)
		}
		if isKeyframeCandidateMetadata(keyframe.MetadataJSON) {
			continue
		}
		items = append(items, keyframe)
	}
	return items, nil
}
