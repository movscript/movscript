package semantic

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (s *Service) completeWorkItem(ctx context.Context, projectID uint, item *model.WorkItem, updates map[string]any, actorID *uint) (model.WorkItem, error) {
	return s.repo.CompleteWorkItem(ctx, projectID, item, updates, actorID)
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
	var targetSlot model.AssetSlot
	if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&targetSlot).Error; err != nil {
		return err
	}
	lockedAssetSlotID := candidate.CandidateAssetSlotID
	targetSlot.Status = "locked"
	targetSlot.LockedAssetSlotID = &lockedAssetSlotID
	targetSlot.ResourceID = candidate.CandidateAssetSlot.ResourceID
	if err := saveCoreEntityWithRelations(tx, &targetSlot); err != nil {
		return err
	}
	var rejected []model.AssetSlotCandidate
	if err := tx.Where("project_id = ? AND asset_slot_id = ? AND id <> ?", projectID, item.TargetID, candidate.ID).Find(&rejected).Error; err != nil {
		return err
	}
	for i := range rejected {
		rejected[i].Status = "rejected"
		if err := saveCoreEntityWithRelations(tx, &rejected[i]); err != nil {
			return err
		}
	}
	candidate.Status = "selected"
	if err := saveCoreEntityWithRelations(tx, &candidate); err != nil {
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
	if err := entityrelation.SyncCoreEntityRelations(tx, &decision); err != nil {
		return err
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func applyWorkItemTargetStatus(tx *gorm.DB, projectID uint, item model.WorkItem, targetType string, status string, actorID *uint, appliedAt string) error {
	if item.TargetType != targetType {
		return errors.New("任务结果类型与目标类型不匹配")
	}
	switch targetType {
	case "content_unit":
		var target model.ContentUnit
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case "keyframe":
		var target model.Keyframe
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case "asset_slot":
		var target model.AssetSlot
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case "delivery_version":
		var target model.DeliveryVersion
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	default:
		return errors.New("该目标类型暂不支持由任务结果更新状态")
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
	if err := entityrelation.SyncCoreEntityRelations(tx, &event); err != nil {
		return err
	}
	return nil
}

func saveCoreEntityWithRelations(tx *gorm.DB, item any) error {
	if err := tx.Save(item).Error; err != nil {
		return err
	}
	return entityrelation.SyncCoreEntityRelations(tx, item)
}

func workItemApplyMetadata(workItemID uint) string {
	data, _ := json.Marshal(map[string]any{"work_item_id": workItemID})
	return string(data)
}
