package semantic

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

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
			deleteBlocker{"production_text_block", func() (int, error) {
				items, err := s.repo.ListProductionTextBlocks(ctx, ProductionTextBlockFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"segment", func() (int, error) {
				items, err := s.repo.ListSegments(ctx, SegmentFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"content_unit", func() (int, error) {
				items, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"keyframe", func() (int, error) {
				items, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"preview_timeline", func() (int, error) {
				items, err := s.repo.ListPreviewTimelines(ctx, PreviewTimelineFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"asset_slot", func() (int, error) {
				items, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, ProductionID: itemID, IncludeInternal: "true"})
				return len(items), err
			}},
			deleteBlocker{"delivery_version", func() (int, error) {
				items, err := s.repo.ListDeliveryVersions(ctx, DeliveryVersionFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
			deleteBlocker{"work_item", func() (int, error) {
				items, err := s.repo.ListWorkItems(ctx, WorkItemFilter{ProjectID: projectID, ProductionID: itemID})
				return len(items), err
			}},
		)
	case "production_text_block":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"segment", func() (int, error) {
				items, err := s.repo.ListSegments(ctx, SegmentFilter{ProjectID: projectID, TextBlockID: itemID})
				return len(items), err
			}},
		)
	case "segment":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"scene_moment", func() (int, error) {
				items, err := s.repo.ListSceneMoments(ctx, SceneMomentFilter{ProjectID: projectID, SegmentID: itemID})
				return len(items), err
			}},
			deleteBlocker{"content_unit", func() (int, error) {
				items, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SegmentID: itemID})
				return len(items), err
			}},
			deleteBlocker{"preview_timeline_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "preview_timeline_items", ForeignKey: "segment_id", ForeignKeyID: itemID})
				return count, err
			}},
			deleteBlocker{"asset_slot", func() (int, error) {
				items, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "segment", OwnerID: itemID, IncludeInternal: "true"})
				return len(items), err
			}},
			deleteBlocker{"work_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "work_items", TargetType: "segment", TargetID: itemID})
				return count, err
			}},
		)
	case "scene_moment":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"content_unit", func() (int, error) {
				items, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, SceneMomentID: itemID})
				return len(items), err
			}},
			deleteBlocker{"keyframe", func() (int, error) {
				items, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, SceneMomentID: itemID})
				return len(items), err
			}},
			deleteBlocker{"preview_timeline_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "preview_timeline_items", ForeignKey: "scene_moment_id", ForeignKeyID: itemID})
				return count, err
			}},
			deleteBlocker{"asset_slot", func() (int, error) {
				items, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "scene_moment", OwnerID: itemID, IncludeInternal: "true"})
				return len(items), err
			}},
			deleteBlocker{"work_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "work_items", TargetType: "scene_moment", TargetID: itemID})
				return count, err
			}},
		)
	case "storyboard_script":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"storyboard_version", func() (int, error) {
				items, err := s.repo.ListStoryboardVersions(ctx, StoryboardVersionFilter{ProjectID: projectID, StoryboardScriptID: itemID})
				return len(items), err
			}},
		)
	case "content_unit":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"keyframe", func() (int, error) {
				items, err := s.repo.ListKeyframes(ctx, KeyframeFilter{ProjectID: projectID, ContentUnitID: itemID})
				return len(items), err
			}},
			deleteBlocker{"preview_timeline_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "preview_timeline_items", ForeignKey: "content_unit_id", ForeignKeyID: itemID})
				return count, err
			}},
			deleteBlocker{"asset_slot", func() (int, error) {
				items, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "content_unit", OwnerID: itemID, IncludeInternal: "true"})
				return len(items), err
			}},
			deleteBlocker{"delivery_timeline_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "delivery_timeline_items", ForeignKey: "content_unit_id", ForeignKeyID: itemID})
				return count, err
			}},
			deleteBlocker{"work_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "work_items", TargetType: "content_unit", TargetID: itemID})
				return count, err
			}},
		)
	case "keyframe":
		return s.ensureNoDeleteBlockers(ctx, projectID, kind,
			deleteBlocker{"preview_timeline_item", func() (int, error) {
				count, err := s.repo.CountProjectItems(ctx, ProjectItemCountFilter{ProjectID: projectID, Table: "preview_timeline_items", ForeignKey: "keyframe_id", ForeignKeyID: itemID})
				return count, err
			}},
			deleteBlocker{"asset_slot", func() (int, error) {
				items, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, OwnerType: "keyframe", OwnerID: itemID, IncludeInternal: "true"})
				return len(items), err
			}},
		)
	default:
		return nil
	}
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
