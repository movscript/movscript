package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (s *Service) completeWorkItem(ctx context.Context, projectID uint, item *model.WorkItem, updates map[string]any, actorID *uint) (model.WorkItem, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	var applyErr error
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		next := *item
		ApplyWorkItemUpdates(&next, updates)
		next.ResultType = fallbackString(next.ResultType, "none")
		if next.ResultType == "none" {
			updates["apply_status"] = "not_applicable"
			updates["applied_at"] = ""
			updates["apply_error"] = ""
		} else {
			updates["apply_status"] = "pending"
			updates["apply_error"] = ""
		}
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		if next.ResultType != "none" {
			applyErr = applyWorkItemResult(tx, projectID, next, actorID, now)
			if applyErr != nil {
				return applyErr
			}
			if err := tx.Model(item).Updates(map[string]any{
				"apply_status": "applied",
				"applied_at":   now,
				"apply_error":  "",
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if applyErr != nil {
			_ = s.db.WithContext(ctx).Model(item).Updates(map[string]any{
				"apply_status": "failed",
				"apply_error":  applyErr.Error(),
			}).Error
			return *item, ErrInvalidInput{Err: applyErr}
		}
		return *item, err
	}
	if err := s.db.WithContext(ctx).Preload("Assignee").First(item, item.ID).Error; err != nil {
		return *item, err
	}
	return *item, nil
}

func applyWorkItemResult(tx *gorm.DB, projectID uint, item model.WorkItem, actorID *uint, appliedAt string) error {
	switch fallbackString(item.ResultType, "none") {
	case "status_change":
		return applyWorkItemStatusChange(tx, projectID, item, actorID, appliedAt)
	case "lock_asset_candidate":
		return applyWorkItemAssetCandidate(tx, projectID, item, actorID, appliedAt)
	case "accept_keyframe":
		return applyWorkItemTargetStatus(tx, projectID, item, "keyframe", "accepted", actorID, appliedAt)
	case "approve_delivery_version":
		return applyWorkItemTargetStatus(tx, projectID, item, "delivery_version", "approved", actorID, appliedAt)
	default:
		return nil
	}
}

func applyWorkItemStatusChange(tx *gorm.DB, projectID uint, item model.WorkItem, actorID *uint, appliedAt string) error {
	payload, err := DecodeWorkItemResultJSON(item.ResultJSON)
	if err != nil {
		return err
	}
	status := fallbackString(payload.Status, payload.TargetStatus)
	if status == "" {
		return errors.New("status_change 需要在 result_json.status 中声明目标状态")
	}
	return applyWorkItemTargetStatus(tx, projectID, item, item.TargetType, status, actorID, appliedAt)
}

func applyWorkItemAssetCandidate(tx *gorm.DB, projectID uint, item model.WorkItem, actorID *uint, appliedAt string) error {
	if item.TargetType != "asset_slot" {
		return errors.New("lock_asset_candidate 只能应用到 asset_slot 任务")
	}
	payload, err := DecodeWorkItemResultJSON(item.ResultJSON)
	if err != nil {
		return err
	}
	if payload.AssetSlotCandidateID == 0 {
		return errors.New("lock_asset_candidate 需要 result_json.asset_slot_candidate_id")
	}
	var candidate model.AssetSlotCandidate
	if err := tx.Preload("CandidateAssetSlot").Where("project_id = ?", projectID).First(&candidate, payload.AssetSlotCandidateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("素材候选不存在")
		}
		return err
	}
	if candidate.AssetSlotID != item.TargetID {
		return errors.New("素材候选不属于当前任务目标素材位")
	}
	if candidate.CandidateAssetSlot == nil {
		return errors.New("素材候选缺少候选素材位")
	}
	if err := tx.Model(&model.AssetSlot{}).
		Where("project_id = ? AND id = ?", projectID, item.TargetID).
		Updates(map[string]any{
			"status":               "locked",
			"locked_asset_slot_id": candidate.CandidateAssetSlotID,
			"resource_id":          candidate.CandidateAssetSlot.ResourceID,
		}).Error; err != nil {
		return err
	}
	var targetSlot model.AssetSlot
	if err := tx.First(&targetSlot, item.TargetID).Error; err == nil {
		if err := model.SyncCoreEntityRelations(tx, &targetSlot); err != nil {
			return err
		}
	}
	if err := tx.Model(&model.AssetSlotCandidate{}).
		Where("project_id = ? AND asset_slot_id = ? AND id <> ?", projectID, item.TargetID, candidate.ID).
		Update("status", "rejected").Error; err != nil {
		return err
	}
	if err := tx.Model(&candidate).Update("status", "selected").Error; err != nil {
		return err
	}
	if err := model.SyncCoreEntityRelations(tx, &candidate); err != nil {
		return err
	}
	targetID := item.TargetID
	candidateID := candidate.ID
	decision := model.CandidateDecision{
		ProjectID:     projectID,
		CandidateType: "asset_slot_candidate",
		CandidateID:   &candidateID,
		TargetType:    "asset_slot",
		TargetID:      &targetID,
		Decision:      "accept",
		Status:        "applied",
		Source:        "manual",
		DecidedByID:   actorID,
		AppliedAt:     appliedAt,
		MetadataJSON:  workItemApplyMetadata(item.ID),
	}
	if err := tx.Create(&decision).Error; err != nil {
		return err
	}
	if err := model.SyncCoreEntityRelations(tx, &decision); err != nil {
		return err
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func applyWorkItemTargetStatus(tx *gorm.DB, projectID uint, item model.WorkItem, targetType string, status string, actorID *uint, appliedAt string) error {
	if item.TargetType != targetType {
		return errors.New("任务结果类型与目标类型不匹配")
	}
	var target any
	switch targetType {
	case "content_unit":
		target = &model.ContentUnit{}
	case "keyframe":
		target = &model.Keyframe{}
	case "asset_slot":
		target = &model.AssetSlot{}
	case "delivery_version":
		target = &model.DeliveryVersion{}
	default:
		return errors.New("该目标类型暂不支持由任务结果更新状态")
	}
	if err := tx.Model(target).Where("project_id = ? AND id = ?", projectID, item.TargetID).Update("status", status).Error; err != nil {
		return err
	}
	if err := tx.First(target, item.TargetID).Error; err == nil {
		if err := model.SyncCoreEntityRelations(tx, target); err != nil {
			return err
		}
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func createWorkItemAppliedReviewEvent(tx *gorm.DB, projectID uint, item model.WorkItem, actorID *uint, appliedAt string) error {
	subjectID := item.TargetID
	metadata := workItemApplyMetadata(item.ID)
	if appliedAt != "" {
		data, _ := json.Marshal(map[string]any{"work_item_id": item.ID, "applied_at": appliedAt})
		metadata = string(data)
	}
	event := model.ReviewEvent{
		ProjectID:    projectID,
		SubjectType:  item.TargetType,
		SubjectID:    &subjectID,
		EventType:    "applied",
		FromStatus:   "",
		ToStatus:     item.ResultType,
		Comment:      "任务完成后应用结果",
		Source:       "manual",
		ActorID:      actorID,
		MetadataJSON: metadata,
	}
	if err := tx.Create(&event).Error; err != nil {
		return err
	}
	return model.SyncCoreEntityRelations(tx, &event)
}

func workItemApplyMetadata(workItemID uint) string {
	data, _ := json.Marshal(map[string]any{"work_item_id": workItemID})
	return string(data)
}
