package semantic

import (
	"context"
	"errors"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type SourceLockStatus struct {
	EntityKind   string             `json:"entity_kind"`
	EntityID     uint               `json:"entity_id"`
	Locked       bool               `json:"locked"`
	LockedFields []string           `json:"locked_fields"`
	Reasons      []SourceLockReason `json:"reasons"`
}

type SourceLockReason struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	EntityKind string `json:"entity_kind"`
	Count      int    `json:"count"`
}

func (s *Service) SourceLockStatus(ctx context.Context, projectID uint, kind string, id string) (SourceLockStatus, error) {
	normalizedKind := normalizeSourceLockKind(kind)
	switch normalizedKind {
	case "production":
		item, err := s.repo.LoadProduction(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.productionSourceLockStatus(ctx, projectID, item)
	case "segment":
		item, err := s.repo.LoadSegment(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.segmentSourceLockStatus(ctx, projectID, item)
	case "scene_moment":
		item, err := s.repo.LoadSceneMoment(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.sceneMomentSourceLockStatus(ctx, projectID, item)
	case "storyboard_script":
		item, err := s.repo.LoadStoryboardScript(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.storyboardScriptSourceLockStatus(ctx, projectID, item)
	case "storyboard_line":
		item, err := s.repo.LoadStoryboardLine(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.storyboardLineSourceLockStatus(ctx, projectID, item)
	case "content_unit":
		item, err := s.repo.LoadContentUnit(ctx, projectID, id)
		if err != nil {
			return SourceLockStatus{}, err
		}
		return s.contentUnitSourceLockStatus(ctx, projectID, item)
	default:
		return SourceLockStatus{}, ErrInvalidInput{Err: errors.New("source lock kind is not supported")}
	}
}

func (s *Service) productionSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.Production) (SourceLockStatus, error) {
	status := newSourceLockStatus("production", item.ID)
	textBlocks, err := s.repo.ListProductionTextBlocks(ctx, ProductionTextBlockFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("production_text_blocks", "已有制作文本块，制作来源不可再切换", "production_text_block", len(textBlocks))
	segments, err := s.repo.ListSegments(ctx, SegmentFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("segments", "已有编排段，制作来源不可再切换", "segment", len(segments))
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("content_units", "已有制作项，制作来源不可再切换", "content_unit", len(units))
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ProductionID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("keyframes", "已有关键帧，制作来源不可再切换", "keyframe", len(keyframes))
	return status, nil
}

func (s *Service) segmentSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.Segment) (SourceLockStatus, error) {
	status := newSourceLockStatus("segment", item.ID)
	moments, err := s.repo.ListSceneMoments(ctx, SceneMomentFilter{ProjectID: projectID, SegmentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("scene_moments", "已有情景，编排段来源不可再切换", "scene_moment", len(moments))
	lines, err := s.repo.ListStoryboardLines(ctx, StoryboardLineFilter{ProjectID: projectID, SegmentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("storyboard_lines", "已有分镜行，编排段来源不可再切换", "storyboard_line", len(lines))
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SegmentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("content_units", "已有制作项，编排段来源不可再切换", "content_unit", len(units))
	return status, nil
}

func (s *Service) sceneMomentSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.SceneMoment) (SourceLockStatus, error) {
	status := newSourceLockStatus("scene_moment", item.ID)
	lines, err := s.repo.ListStoryboardLines(ctx, StoryboardLineFilter{ProjectID: projectID, SceneMomentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("storyboard_lines", "已有分镜行，情景来源不可再切换", "storyboard_line", len(lines))
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SceneMomentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("content_units", "已有制作项，情景来源不可再切换", "content_unit", len(units))
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, SceneMomentID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("keyframes", "已有关键帧，情景来源不可再切换", "keyframe", len(keyframes))
	return status, nil
}

func (s *Service) storyboardScriptSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.StoryboardScript) (SourceLockStatus, error) {
	status := newSourceLockStatus("storyboard_script", item.ID)
	versions, err := s.repo.ListStoryboardVersions(ctx, StoryboardVersionFilter{ProjectID: projectID, StoryboardScriptID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("storyboard_versions", "已有分镜版本，分镜脚本来源不可再切换", "storyboard_version", len(versions))
	lines, err := s.repo.ListStoryboardLines(ctx, StoryboardLineFilter{ProjectID: projectID, StoryboardScriptID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("storyboard_lines", "已有分镜行，分镜脚本来源不可再切换", "storyboard_line", len(lines))
	return status, nil
}

func (s *Service) storyboardLineSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.StoryboardLine) (SourceLockStatus, error) {
	status := newSourceLockStatus("storyboard_line", item.ID)
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, StoryboardLineID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("content_units", "已有制作项，分镜行来源不可再切换", "content_unit", len(units))
	return status, nil
}

func (s *Service) contentUnitSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.ContentUnit) (SourceLockStatus, error) {
	status := newSourceLockStatus("content_unit", item.ID)
	if item.StoryboardLineID != nil {
		status.addReason("storyboard_line", "已绑定分镜行，制作项不能切换到其他分镜行", "storyboard_line", 1)
	}
	keyframes, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ContentUnitID: item.ID})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("keyframes", "已有关键帧，制作项来源不可再切换", "keyframe", len(keyframes))
	slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "content_unit", OwnerID: item.ID, IncludeInternal: "true"})
	if err != nil {
		return SourceLockStatus{}, err
	}
	status.addReason("asset_slots", "已有素材需求，制作项来源不可再切换", "asset_slot", len(slots))
	return status, nil
}

func newSourceLockStatus(kind string, id uint) SourceLockStatus {
	return SourceLockStatus{
		EntityKind:   kind,
		EntityID:     id,
		LockedFields: []string{},
		Reasons:      []SourceLockReason{},
	}
}

func (status *SourceLockStatus) addReason(code string, message string, entityKind string, count int) {
	if count <= 0 {
		return
	}
	status.Locked = true
	if len(status.LockedFields) == 0 {
		status.LockedFields = sourceLockFields(status.EntityKind)
	}
	status.Reasons = append(status.Reasons, SourceLockReason{
		Code:       code,
		Message:    message,
		EntityKind: entityKind,
		Count:      count,
	})
}

func sourceLockFields(kind string) []string {
	switch kind {
	case "production":
		return []string{"script_version_id", "preview_timeline_id", "source_type"}
	case "segment":
		return []string{"production_id", "text_block_id", "script_block_id", "parent_segment_id"}
	case "scene_moment":
		return []string{"segment_id", "script_block_id"}
	case "storyboard_script":
		return []string{"script_version_id"}
	case "storyboard_line":
		return []string{"storyboard_script_id", "storyboard_version_id", "segment_id", "scene_moment_id", "script_block_id"}
	case "content_unit":
		return []string{"production_id", "segment_id", "scene_moment_id", "storyboard_line_id", "script_block_id"}
	default:
		return []string{}
	}
}

func normalizeSourceLockKind(kind string) string {
	kind = strings.TrimSpace(kind)
	kind = strings.TrimSuffix(kind, "s")
	kind = strings.ReplaceAll(kind, "-", "_")
	switch kind {
	case "production":
		return "production"
	case "segment":
		return "segment"
	case "scene_moment":
		return "scene_moment"
	case "storyboard_script":
		return "storyboard_script"
	case "storyboard_line":
		return "storyboard_line"
	case "content_unit":
		return "content_unit"
	default:
		return kind
	}
}
