package semantic

import (
	"context"
	"fmt"
	"reflect"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
)

func (s *Service) LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	return s.repo.LoadProjectItem(ctx, projectID, item, id)
}

func (s *Service) DeleteItemByKind(ctx context.Context, projectID uint, kind string, id string) error {
	item, err := newDeleteItemModel(kind)
	if err != nil {
		return err
	}
	if err := s.repo.LoadProjectItem(ctx, projectID, item, id); err != nil {
		return err
	}
	return s.DeleteItem(ctx, item)
}

func (s *Service) CreateItem(ctx context.Context, item any) error {
	if err := s.repo.CreateItem(ctx, item); err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, projectIDOf(item))
	return nil
}

func newDeleteItemModel(kind string) (any, error) {
	switch kind {
	case domainworkflow.EntityKindScriptVersion:
		return &model.ScriptVersion{}, nil
	case domainworkflow.EntityKindSegment:
		return &model.Segment{}, nil
	case "production_text_block":
		return &model.ProductionTextBlock{}, nil
	case domainworkflow.EntityKindSceneMoment:
		return &model.SceneMoment{}, nil
	case "storyboard_script":
		return &model.StoryboardScript{}, nil
	case "storyboard_version":
		return &model.StoryboardVersion{}, nil
	case "storyboard_line":
		return &model.StoryboardLine{}, nil
	case "production":
		return &model.Production{}, nil
	case domainworkflow.EntityKindContentUnit:
		return &model.ContentUnit{}, nil
	case domainworkflow.EntityKindKeyframe:
		return &model.Keyframe{}, nil
	case "preview_timeline":
		return &model.PreviewTimeline{}, nil
	case "preview_timeline_item":
		return &model.PreviewTimelineItem{}, nil
	case domainworkflow.EntityKindCreativeReference:
		return &model.CreativeReference{}, nil
	case "creative_reference_state":
		return &model.CreativeReferenceState{}, nil
	case "creative_reference_usage":
		return &model.CreativeReferenceUsage{}, nil
	case "creative_relationship":
		return &model.CreativeRelationship{}, nil
	case domainworkflow.EntityKindAssetSlot:
		return &model.AssetSlot{}, nil
	case "asset_slot_candidate":
		return &model.AssetSlotCandidate{}, nil
	case "candidate_decision":
		return &model.CandidateDecision{}, nil
	case "review_event":
		return &model.ReviewEvent{}, nil
	case domainworkflow.EntityKindDeliveryVersion:
		return &model.DeliveryVersion{}, nil
	case "delivery_timeline_item":
		return &model.DeliveryTimelineItem{}, nil
	case "export_record":
		return &model.ExportRecord{}, nil
	case "canvas_output":
		return &model.CanvasOutput{}, nil
	default:
		return nil, fmt.Errorf("%w: unsupported delete kind %q", ErrOwnerInvalidType, kind)
	}
}

func (s *Service) PatchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	if err := s.repo.PatchItem(ctx, item, updates); err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, projectIDOf(item))
	return nil
}

func (s *Service) ReloadItem(ctx context.Context, item any) error {
	return s.repo.ReloadItem(ctx, item)
}

func (s *Service) DeleteItem(ctx context.Context, item any) error {
	projectID := projectIDOf(item)
	if err := s.repo.DeleteItem(ctx, item); err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, projectID)
	return nil
}

func projectIDOf(item any) uint {
	value := reflect.ValueOf(item)
	if !value.IsValid() {
		return 0
	}
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return 0
		}
		value = value.Elem()
	}
	if value.Kind() != reflect.Struct {
		return 0
	}
	field := value.FieldByName("ProjectID")
	if !field.IsValid() {
		return 0
	}
	switch field.Kind() {
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return uint(field.Uint())
	default:
		return 0
	}
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

func (s *Service) validateContentUnitOwners(ctx context.Context, projectID uint, productionID *uint, segmentID *uint, sceneMomentID *uint) error {
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

func (s *Service) ensurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	return s.repo.EnsurePreviewTimelineInProject(ctx, projectID, previewTimelineID)
}

func (s *Service) ensureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	return s.repo.EnsureSceneMomentInProject(ctx, projectID, sceneMomentID)
}

func (s *Service) ensureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	return s.repo.EnsureContentUnitInProject(ctx, projectID, contentUnitID)
}

func fallbackString(value string, fallback string) string {
	return domainsemantic.FallbackString(value, fallback)
}

func fallbackInt(value int, fallback int) int {
	return domainsemantic.FallbackInt(value, fallback)
}

func compactUpdates(values map[string]any) map[string]any {
	return domainsemantic.CompactUpdates(values)
}
