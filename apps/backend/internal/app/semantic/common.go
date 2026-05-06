package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (s *Service) LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	if err := s.db.WithContext(ctx).Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) CreateItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		return model.SyncCoreEntityRelations(tx, item)
	})
}

func (s *Service) PatchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		return model.SyncCoreEntityRelations(tx, item)
	})
}

func (s *Service) ReloadItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).First(item).Error
}

func (s *Service) DeleteItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(item).Error; err != nil {
			return err
		}
		return model.DeleteCoreEntityRelations(tx, item)
	})
}

func (s *Service) ensureProductionInProject(ctx context.Context, projectID uint, productionID uint) error {
	if productionID == 0 {
		return ErrOwnerNotFound
	}
	var production model.Production
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&production, productionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if production.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error {
	if blockID == 0 {
		return ErrOwnerNotFound
	}
	var block model.ProductionTextBlock
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&block, blockID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if block.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error {
	if segmentID == 0 {
		return ErrOwnerNotFound
	}
	var segment model.Segment
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&segment, segmentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if segment.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
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
	if scriptVersionID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ScriptVersion
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, scriptVersionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	if previewTimelineID == 0 {
		return ErrOwnerNotFound
	}
	var item model.PreviewTimeline
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, previewTimelineID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	if sceneMomentID == 0 {
		return ErrOwnerNotFound
	}
	var item model.SceneMoment
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, sceneMomentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	if contentUnitID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ContentUnit
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, contentUnitID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func fallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func fallbackInt(value int, fallback int) int {
	if value != 0 {
		return value
	}
	return fallback
}

func compactUpdates(values map[string]any) map[string]any {
	updates := map[string]any{}
	for key, value := range values {
		switch v := value.(type) {
		case string:
			if strings.TrimSpace(v) == "" {
				continue
			}
		case *uint:
			if v == nil {
				continue
			}
		case nil:
			continue
		}
		updates[key] = value
	}
	return updates
}
