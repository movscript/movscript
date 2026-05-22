package semantic

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/coregraph"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	sceneMomentAbandonedStatus       = "ignored"
	contentUnitAbandonedStatus       = "ignored"
	previewTimelineItemRemovedStatus = "removed"
)

func (s *Service) AbandonSceneMoment(ctx context.Context, projectID uint, id string) (AbandonSceneMomentResult, error) {
	sceneMomentID, err := parseDeleteItemID(id)
	if err != nil {
		return AbandonSceneMomentResult{}, err
	}
	result, err := s.repo.AbandonSceneMoment(ctx, projectID, sceneMomentID)
	if err != nil {
		return result, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return result, nil
}

func (s *Service) AbandonContentUnit(ctx context.Context, projectID uint, id string) (AbandonContentUnitResult, error) {
	contentUnitID, err := parseDeleteItemID(id)
	if err != nil {
		return AbandonContentUnitResult{}, err
	}
	result, err := s.repo.AbandonContentUnit(ctx, projectID, contentUnitID)
	if err != nil {
		return result, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return result, nil
}

func (r *gormRepository) AbandonSceneMoment(ctx context.Context, projectID uint, sceneMomentID uint) (AbandonSceneMomentResult, error) {
	result := AbandonSceneMomentResult{SceneMomentID: sceneMomentID}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		writer := coregraph.NewWriter(tx)

		var moment persistencemodel.SceneMoment
		if err := tx.Where("project_id = ?", projectID).First(&moment, sceneMomentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}

		var units []persistencemodel.ContentUnit
		if err := tx.Where("project_id = ? AND scene_moment_id = ?", projectID, sceneMomentID).
			Order(`"order", id`).
			Find(&units).Error; err != nil {
			return err
		}
		unitIDs := make([]uint, 0, len(units))
		for _, unit := range units {
			unitIDs = append(unitIDs, unit.ID)
		}

		var timelineItems []persistencemodel.PreviewTimelineItem
		timelineQuery := tx.Where("project_id = ? AND scene_moment_id = ?", projectID, sceneMomentID)
		if len(unitIDs) > 0 {
			timelineQuery = tx.Where("project_id = ? AND (scene_moment_id = ? OR content_unit_id IN ?)", projectID, sceneMomentID, unitIDs)
		}
		if err := timelineQuery.Order(`preview_timeline_id, "order", id`).Find(&timelineItems).Error; err != nil {
			return err
		}

		if moment.Status != sceneMomentAbandonedStatus {
			if err := tx.Model(&moment).Update("status", sceneMomentAbandonedStatus).Error; err != nil {
				return err
			}
			if err := tx.First(&moment, moment.ID).Error; err != nil {
				return err
			}
		}
		if err := writer.Write(ctx, &moment); err != nil {
			return err
		}

		for i := range units {
			if units[i].Status != contentUnitAbandonedStatus {
				if err := tx.Model(&units[i]).Update("status", contentUnitAbandonedStatus).Error; err != nil {
					return err
				}
				if err := tx.First(&units[i], units[i].ID).Error; err != nil {
					return err
				}
				result.ContentUnitsUpdated++
			}
			if err := writer.Write(ctx, &units[i]); err != nil {
				return err
			}
		}

		for i := range timelineItems {
			if timelineItems[i].Status != previewTimelineItemRemovedStatus {
				if err := tx.Model(&timelineItems[i]).Update("status", previewTimelineItemRemovedStatus).Error; err != nil {
					return err
				}
				if err := tx.First(&timelineItems[i], timelineItems[i].ID).Error; err != nil {
					return err
				}
				result.TimelineItemsRemoved++
			}
			if err := writer.Write(ctx, &timelineItems[i]); err != nil {
				return err
			}
		}

		return nil
	})
	return result, err
}

func (r *gormRepository) AbandonContentUnit(ctx context.Context, projectID uint, contentUnitID uint) (AbandonContentUnitResult, error) {
	result := AbandonContentUnitResult{ContentUnitID: contentUnitID}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		writer := coregraph.NewWriter(tx)

		var unit persistencemodel.ContentUnit
		if err := tx.Where("project_id = ?", projectID).First(&unit, contentUnitID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}

		var timelineItems []persistencemodel.PreviewTimelineItem
		if err := tx.Where("project_id = ? AND content_unit_id = ?", projectID, contentUnitID).
			Order(`preview_timeline_id, "order", id`).
			Find(&timelineItems).Error; err != nil {
			return err
		}

		if unit.Status != contentUnitAbandonedStatus {
			if err := tx.Model(&unit).Update("status", contentUnitAbandonedStatus).Error; err != nil {
				return err
			}
			if err := tx.First(&unit, unit.ID).Error; err != nil {
				return err
			}
		}
		if err := writer.Write(ctx, &unit); err != nil {
			return err
		}

		for i := range timelineItems {
			if timelineItems[i].Status != previewTimelineItemRemovedStatus {
				if err := tx.Model(&timelineItems[i]).Update("status", previewTimelineItemRemovedStatus).Error; err != nil {
					return err
				}
				if err := tx.First(&timelineItems[i], timelineItems[i].ID).Error; err != nil {
					return err
				}
				result.TimelineItemsRemoved++
			}
			if err := writer.Write(ctx, &timelineItems[i]); err != nil {
				return err
			}
		}

		return nil
	})
	return result, err
}
