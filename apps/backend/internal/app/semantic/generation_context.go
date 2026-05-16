package semantic

import (
	"context"
	"errors"
	"fmt"
	"strconv"

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
	if contentUnit.ProductionID != nil {
		production, err := s.repo.LoadProduction(ctx, projectID, strconv.FormatUint(uint64(*contentUnit.ProductionID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_production", "production", *contentUnit.ProductionID, err)
		}
		result.Production = &production
	}
	if contentUnit.SegmentID != nil {
		segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*contentUnit.SegmentID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_segment", "segment", *contentUnit.SegmentID, err)
		}
		result.Segment = &segment
	}
	if contentUnit.SceneMomentID != nil {
		sceneMoment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(*contentUnit.SceneMomentID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_scene_moment", "scene_moment", *contentUnit.SceneMomentID, err)
		}
		result.SceneMoment = &sceneMoment
		if result.Segment == nil && sceneMoment.SegmentID != nil {
			segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(*sceneMoment.SegmentID), 10))
			if err != nil {
				return GenerationContext{}, generationContextLoadError(projectID, "load_scene_moment_segment", "segment", *sceneMoment.SegmentID, err)
			}
			result.Segment = &segment
		}
	}
	if contentUnit.ScriptBlockID != nil {
		scriptBlock, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*contentUnit.ScriptBlockID), 10))
		if err != nil {
			return GenerationContext{}, generationContextLoadError(projectID, "load_script_block", "script_block", *contentUnit.ScriptBlockID, err)
		}
		result.ScriptBlock = &scriptBlock
	}
	if result.ScriptBlock == nil {
		fallbackID := fallbackGenerationScriptBlockID(result.SceneMoment, result.Segment)
		if fallbackID != nil {
			scriptBlock, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*fallbackID), 10))
			if err != nil {
				return GenerationContext{}, generationContextLoadError(projectID, "load_fallback_script_block", "script_block", *fallbackID, err)
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

	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{
		ProjectID:     projectID,
		ContentUnitID: contentUnit.ID,
	})
	if err != nil {
		return GenerationContext{}, err
	}
	result.Keyframes = keyframes
	return result, nil
}

func fallbackGenerationScriptBlockID(sceneMoment *domainsemantic.SceneMoment, segment *domainsemantic.Segment) *uint {
	if sceneMoment != nil && sceneMoment.ScriptBlockID != nil {
		return sceneMoment.ScriptBlockID
	}
	if segment != nil && segment.ScriptBlockID != nil {
		return segment.ScriptBlockID
	}
	return nil
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
	owners := []struct {
		kind string
		id   uint
	}{
		{kind: "content_unit", id: contentUnit.ID},
	}
	if sceneMoment != nil {
		owners = append(owners, struct {
			kind string
			id   uint
		}{kind: "scene_moment", id: sceneMoment.ID})
	}
	if segment != nil {
		owners = append(owners, struct {
			kind string
			id   uint
		}{kind: "segment", id: segment.ID})
	}

	items := make([]GenerationContextReference, 0)
	seen := make(map[uint]struct{})
	for _, owner := range owners {
		usages, err := s.repo.ListCreativeReferenceUsages(ctx, CreativeReferenceUsageFilter{
			ProjectID: projectID,
			OwnerType: owner.kind,
			OwnerID:   owner.id,
		})
		if err != nil {
			return nil, GenerationContextError{
				Code:       "GENERATION_CONTEXT_REFERENCE_USAGE_QUERY_FAILED",
				Message:    fmt.Sprintf("生成上下文读取设定引用失败：%s #%d", owner.kind, owner.id),
				Step:       "list_creative_reference_usages",
				ProjectID:  projectID,
				EntityType: "creative_reference_usage",
				OwnerType:  owner.kind,
				OwnerID:    owner.id,
				Cause:      err.Error(),
			}
		}
		for _, usage := range usages {
			if _, ok := seen[usage.ID]; ok {
				continue
			}
			seen[usage.ID] = struct{}{}
			item := GenerationContextReference{Usage: usage}
			if usage.CreativeReferenceID > 0 {
				ref, err := s.repo.LoadCreativeReference(ctx, projectID, strconv.FormatUint(uint64(usage.CreativeReferenceID), 10))
				if err != nil {
					return nil, generationContextLoadError(projectID, "load_creative_reference", "creative_reference", usage.CreativeReferenceID, err)
				}
				item.Reference = &ref
			}
			if usage.CreativeReferenceStateID != nil {
				state, err := s.repo.LoadCreativeReferenceState(ctx, projectID, strconv.FormatUint(uint64(*usage.CreativeReferenceStateID), 10))
				if err != nil {
					return nil, generationContextLoadError(projectID, "load_creative_reference_state", "creative_reference_state", *usage.CreativeReferenceStateID, err)
				}
				item.State = &state
			}
			items = append(items, item)
		}
	}
	return items, nil
}

func (s *Service) collectGenerationAssetSlots(ctx context.Context, projectID uint, contentUnit domainsemantic.ContentUnit, segment *domainsemantic.Segment, sceneMoment *domainsemantic.SceneMoment, references []GenerationContextReference) ([]domainsemantic.AssetSlot, error) {
	owners := []struct {
		kind string
		id   uint
	}{
		{kind: "content_unit", id: contentUnit.ID},
	}
	if sceneMoment != nil {
		owners = append(owners, struct {
			kind string
			id   uint
		}{kind: "scene_moment", id: sceneMoment.ID})
	}
	if segment != nil {
		owners = append(owners, struct {
			kind string
			id   uint
		}{kind: "segment", id: segment.ID})
	}
	referenceIDs := make(map[uint]struct{})
	stateIDs := make(map[uint]struct{})
	for _, ref := range references {
		if ref.Reference != nil {
			referenceIDs[ref.Reference.ID] = struct{}{}
			owners = append(owners, struct {
				kind string
				id   uint
			}{kind: "creative_reference", id: ref.Reference.ID})
		}
		if ref.State != nil {
			stateIDs[ref.State.ID] = struct{}{}
			owners = append(owners, struct {
				kind string
				id   uint
			}{kind: "creative_reference_state", id: ref.State.ID})
		}
	}

	items := make([]domainsemantic.AssetSlot, 0)
	seen := make(map[uint]struct{})
	for _, owner := range owners {
		slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{
			ProjectID:       projectID,
			OwnerType:       owner.kind,
			IncludeInternal: "true",
		})
		if err != nil {
			return nil, GenerationContextError{
				Code:       "GENERATION_CONTEXT_ASSET_SLOT_QUERY_FAILED",
				Message:    fmt.Sprintf("生成上下文读取素材输入失败：%s #%d", owner.kind, owner.id),
				Step:       "list_asset_slots_by_owner",
				ProjectID:  projectID,
				EntityType: "asset_slot",
				OwnerType:  owner.kind,
				OwnerID:    owner.id,
				Cause:      err.Error(),
			}
		}
		for _, slot := range slots {
			if slot.OwnerID == nil || *slot.OwnerID != owner.id {
				continue
			}
			if _, ok := seen[slot.ID]; ok {
				continue
			}
			seen[slot.ID] = struct{}{}
			items = append(items, slot)
		}
	}
	if len(referenceIDs) > 0 || len(stateIDs) > 0 {
		slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{
			ProjectID:       projectID,
			IncludeInternal: "true",
		})
		if err != nil {
			return nil, GenerationContextError{
				Code:       "GENERATION_CONTEXT_ASSET_SLOT_QUERY_FAILED",
				Message:    "生成上下文读取设定资料素材输入失败",
				Step:       "list_asset_slots_by_reference",
				ProjectID:  projectID,
				EntityType: "asset_slot",
				Cause:      err.Error(),
			}
		}
		for _, slot := range slots {
			matched := false
			if slot.CreativeReferenceID != nil {
				_, matched = referenceIDs[*slot.CreativeReferenceID]
			}
			if !matched && slot.CreativeReferenceStateID != nil {
				_, matched = stateIDs[*slot.CreativeReferenceStateID]
			}
			if !matched {
				continue
			}
			if _, ok := seen[slot.ID]; ok {
				continue
			}
			seen[slot.ID] = struct{}{}
			items = append(items, slot)
		}
	}
	return items, nil
}
