package semantic

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) DeleteItemByKind(ctx context.Context, projectID uint, kind string, id string) error {
	switch strings.TrimSpace(kind) {
	case "script_version":
		return ErrForbidden{Message: "剧本版本创建后不可删除，请保留历史版本以保证引用稳定"}
	case "script_block":
		return ErrForbidden{Message: "剧本块创建后不可删除，请保留稳定锚点以保证后续引用稳定"}
	case "storyboard_version":
		return ErrForbidden{Message: "分镜版本创建后不可删除，请保留历史版本以保证引用稳定"}
	}
	if err := s.ensureItemCanBeDeleted(ctx, projectID, kind, id); err != nil {
		return err
	}
	deletedProjectID, err := s.repo.DeleteProjectItemByKind(ctx, projectID, kind, id)
	if err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, deletedProjectID)
	return nil
}

func (s *Service) ensureItemCanBeDeleted(ctx context.Context, projectID uint, kind string, id string) error {
	itemID, err := parseDeleteItemID(id)
	if err != nil {
		return err
	}
	kind = strings.TrimSpace(kind)
	switch kind {
	case "production":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerFrom(ctx, "production_text_block", projectID, "production", itemID, domainrelation.CategoryStructure, domainrelation.TypeContains),
			s.deleteBlockerFrom(ctx, "segment", projectID, "production", itemID, domainrelation.CategoryStructure, domainrelation.TypeContains),
			s.deleteBlockerFrom(ctx, "content_unit", projectID, "production", itemID, domainrelation.CategoryStructure, domainrelation.TypeContains),
			s.deleteBlockerFrom(ctx, "keyframe", projectID, "production", itemID, domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe),
			s.deleteBlockerTo(ctx, "preview_timeline", projectID, "production", itemID, domainrelation.CategoryStructure, domainrelation.TypeDerivedFrom),
			s.deleteBlockerFrom(ctx, "asset_slot", projectID, "production", itemID, domainrelation.CategoryAsset, ""),
			s.deleteBlockerTo(ctx, "delivery_version", projectID, "production", itemID, domainrelation.CategoryDelivery, domainrelation.TypeDerivedFrom),
			s.deleteBlockerFrom(ctx, "work_item", projectID, "production", itemID, domainrelation.CategoryWorkflow, domainrelation.TypeContains),
		)
	case "production_text_block":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerTo(ctx, "segment", projectID, "production_text_block", itemID, domainrelation.CategoryStructure, domainrelation.TypeBasedOn),
		)
	case "segment":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerFrom(ctx, "scene_moment", projectID, "segment", itemID, domainrelation.CategoryStructure, domainrelation.TypeContains),
			s.deleteBlockerFrom(ctx, "content_unit", projectID, "segment", itemID, domainrelation.CategoryStructure, domainrelation.TypeContains),
			s.deleteBlockerTo(ctx, "preview_timeline_item", projectID, "segment", itemID, domainrelation.CategoryStructure, domainrelation.TypeRepresents),
			s.deleteBlockerFrom(ctx, "asset_slot", projectID, "segment", itemID, domainrelation.CategoryAsset, ""),
			s.deleteBlockerTo(ctx, "work_item", projectID, "segment", itemID, domainrelation.CategoryWorkflow, domainrelation.TypeTargets),
		)
	case "scene_moment":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerTo(ctx, "content_unit", projectID, "scene_moment", itemID, domainrelation.CategoryStructure, domainrelation.TypeBasedOn),
			s.deleteBlockerFrom(ctx, "keyframe", projectID, "scene_moment", itemID, domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe),
			s.deleteBlockerTo(ctx, "preview_timeline_item", projectID, "scene_moment", itemID, domainrelation.CategoryStructure, domainrelation.TypeRepresents),
			s.deleteBlockerFrom(ctx, "asset_slot", projectID, "scene_moment", itemID, domainrelation.CategoryAsset, ""),
			s.deleteBlockerTo(ctx, "work_item", projectID, "scene_moment", itemID, domainrelation.CategoryWorkflow, domainrelation.TypeTargets),
		)
	case "storyboard_script":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerFrom(ctx, "storyboard_version", projectID, "storyboard_script", itemID, domainrelation.CategoryStructure, domainrelation.TypeHasVersion),
		)
	case "content_unit":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerFrom(ctx, "keyframe", projectID, "content_unit", itemID, domainrelation.CategoryStructure, domainrelation.TypeHasKeyframe),
			s.deleteBlockerTo(ctx, "preview_timeline_item", projectID, "content_unit", itemID, domainrelation.CategoryStructure, domainrelation.TypeRepresents),
			s.deleteBlockerFrom(ctx, "asset_slot", projectID, "content_unit", itemID, domainrelation.CategoryAsset, ""),
			s.deleteBlockerTo(ctx, "delivery_timeline_item", projectID, "content_unit", itemID, domainrelation.CategoryDelivery, domainrelation.TypeUses),
			s.deleteBlockerTo(ctx, "work_item", projectID, "content_unit", itemID, domainrelation.CategoryWorkflow, domainrelation.TypeTargets),
		)
	case "keyframe":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			s.deleteBlockerTo(ctx, "preview_timeline_item", projectID, "keyframe", itemID, domainrelation.CategoryStructure, domainrelation.TypeUses),
			s.deleteBlockerFrom(ctx, "asset_slot", projectID, "keyframe", itemID, domainrelation.CategoryAsset, ""),
		)
	default:
		return nil
	}
}

func (s *Service) deleteBlockerFrom(ctx context.Context, entityKind string, projectID uint, sourceType string, sourceID uint, category string, relationType string) deleteBlocker {
	return deleteBlocker{entityKind: entityKind, count: func() (int, error) {
		edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
			ProjectID: projectID,
			Category:  category,
			Type:      relationType,
			Source:    domainrelation.NewEntityRef(sourceType, sourceID),
		})
		if err != nil {
			return 0, err
		}
		return len(edgesWithTargetType(edges, entityKind)), err
	}}
}

func (s *Service) deleteBlockerTo(ctx context.Context, entityKind string, projectID uint, targetType string, targetID uint, category string, relationType string) deleteBlocker {
	return deleteBlocker{entityKind: entityKind, count: func() (int, error) {
		edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
			ProjectID: projectID,
			Category:  category,
			Type:      relationType,
			Target:    domainrelation.NewEntityRef(targetType, targetID),
		})
		if err != nil {
			return 0, err
		}
		return len(edgesWithSourceType(edges, entityKind)), err
	}}
}

func edgesWithTargetType(edges []domainrelation.Edge, targetType string) []domainrelation.Edge {
	matches := make([]domainrelation.Edge, 0, len(edges))
	for _, edge := range edges {
		if edge.Target.Type == targetType {
			matches = append(matches, edge)
		}
	}
	return matches
}

func edgesWithSourceType(edges []domainrelation.Edge, sourceType string) []domainrelation.Edge {
	matches := make([]domainrelation.Edge, 0, len(edges))
	for _, edge := range edges {
		if edge.Source.Type == sourceType {
			matches = append(matches, edge)
		}
	}
	return matches
}

type deleteBlocker struct {
	entityKind string
	count      func() (int, error)
}

func (s *Service) ensureNoDeleteBlockers(ctx context.Context, projectID uint, kind string, blockers ...deleteBlocker) error {
	for _, blocker := range blockers {
		count, err := blocker.count()
		if err != nil {
			return err
		}
		if count > 0 {
			return ErrForbidden{Message: fmt.Sprintf("%s 已被 %d 个 %s 引用，不能删除", kind, count, blocker.entityKind)}
		}
	}
	return nil
}

func parseDeleteItemID(id string) (uint, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(id), 10, 64)
	if err != nil || value == 0 {
		if err == nil {
			err = errors.New("id must be greater than zero")
		}
		return 0, ErrInvalidInput{Err: err}
	}
	return uint(value), nil
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

func (s *Service) validateContentUnitOwners(ctx context.Context, projectID uint, productionID *uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) error {
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
	if scriptBlockID != nil {
		if err := s.ensureScriptBlockInProject(ctx, projectID, *scriptBlockID); err != nil {
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

func (s *Service) ensureScriptBlockInProject(ctx context.Context, projectID uint, scriptBlockID uint) error {
	return s.repo.EnsureOwnerInProject(ctx, projectID, "script_block", scriptBlockID)
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
