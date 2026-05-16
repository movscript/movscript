package semantic

import (
	"context"
	"errors"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
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

func (status SourceLockStatus) ErrSourceChangeLocked(message string) error {
	if !status.Locked {
		return nil
	}
	return ErrInvalidInput{Err: errors.New(message)}
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
	if err := status.addTargetRelationReason(ctx, s, projectID, "production_text_blocks", "已有制作文本块，制作来源不可再切换", "production_text_block", domainrelation.NewEntityRef("production", item.ID), domainrelation.CategoryStructure, domainrelation.TypeContains); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "segments", "已有编排段，制作来源不可再切换", "segment", domainrelation.NewEntityRef("production", item.ID), domainrelation.CategoryStructure, domainrelation.TypeContains); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "content_units", "已有制作项，制作来源不可再切换", "content_unit", domainrelation.NewEntityRef("production", item.ID), domainrelation.CategoryStructure, domainrelation.TypeContains); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "keyframes", "已有关键帧，制作来源不可再切换", "keyframe", domainrelation.NewEntityRef("production", item.ID), domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe); err != nil {
		return SourceLockStatus{}, err
	}
	return status, nil
}

func (s *Service) segmentSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.Segment) (SourceLockStatus, error) {
	status := newSourceLockStatus("segment", item.ID)
	if err := status.addTargetRelationReason(ctx, s, projectID, "scene_moments", "已有情景，编排段来源不可再切换", "scene_moment", domainrelation.NewEntityRef("segment", item.ID), domainrelation.CategoryStructure, domainrelation.TypeContains); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "content_units", "已有制作项，编排段来源不可再切换", "content_unit", domainrelation.NewEntityRef("segment", item.ID), domainrelation.CategoryStructure, domainrelation.TypeContains); err != nil {
		return SourceLockStatus{}, err
	}
	return status, nil
}

func (s *Service) sceneMomentSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.SceneMoment) (SourceLockStatus, error) {
	status := newSourceLockStatus("scene_moment", item.ID)
	if err := status.addSourceRelationReason(ctx, s, projectID, "content_units", "已有制作项，情景来源不可再切换", "content_unit", domainrelation.NewEntityRef("scene_moment", item.ID), domainrelation.CategoryStructure, domainrelation.TypeBasedOn); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "keyframes", "已有关键帧，情景来源不可再切换", "keyframe", domainrelation.NewEntityRef("scene_moment", item.ID), domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe); err != nil {
		return SourceLockStatus{}, err
	}
	return status, nil
}

func (s *Service) storyboardScriptSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.StoryboardScript) (SourceLockStatus, error) {
	status := newSourceLockStatus("storyboard_script", item.ID)
	if err := status.addTargetRelationReason(ctx, s, projectID, "storyboard_versions", "已有分镜版本，分镜脚本来源不可再切换", "storyboard_version", domainrelation.NewEntityRef("storyboard_script", item.ID), domainrelation.CategoryStructure, domainrelation.TypeHasVersion); err != nil {
		return SourceLockStatus{}, err
	}
	return status, nil
}

func (s *Service) contentUnitSourceLockStatus(ctx context.Context, projectID uint, item domainsemantic.ContentUnit) (SourceLockStatus, error) {
	status := newSourceLockStatus("content_unit", item.ID)
	if err := status.addTargetRelationReason(ctx, s, projectID, "keyframes", "已有关键帧，制作项来源不可再切换", "keyframe", domainrelation.NewEntityRef("content_unit", item.ID), domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe); err != nil {
		return SourceLockStatus{}, err
	}
	if err := status.addTargetRelationReason(ctx, s, projectID, "asset_slots", "已有素材需求，制作项来源不可再切换", "asset_slot", domainrelation.NewEntityRef("content_unit", item.ID), domainrelation.CategoryAsset, ""); err != nil {
		return SourceLockStatus{}, err
	}
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

func (status *SourceLockStatus) addTargetRelationReason(ctx context.Context, s *Service, projectID uint, code string, message string, targetType string, source domainrelation.EntityRef, category string, relationType string) error {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  category,
		Type:      relationType,
		Source:    source,
	})
	if err != nil {
		return err
	}
	status.addReason(code, message, targetType, len(edgesWithTargetType(edges, targetType)))
	return nil
}

func (status *SourceLockStatus) addSourceRelationReason(ctx context.Context, s *Service, projectID uint, code string, message string, sourceType string, target domainrelation.EntityRef, category string, relationType string) error {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  category,
		Type:      relationType,
		Target:    target,
	})
	if err != nil {
		return err
	}
	status.addReason(code, message, sourceType, len(edgesWithSourceType(edges, sourceType)))
	return nil
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
	case "content_unit":
		return []string{"production_id", "segment_id", "scene_moment_id", "script_block_id"}
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
	case "content_unit":
		return "content_unit"
	default:
		return kind
	}
}
