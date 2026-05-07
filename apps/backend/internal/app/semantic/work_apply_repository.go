package semantic

import (
	"encoding/json"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func applyWorkItemResult(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, actorID *uint, appliedAt string) error {
	application, err := domainsemantic.WorkItemResultApplicationFor(item)
	if err != nil {
		return err
	}
	switch application.Kind {
	case domainsemantic.WorkItemResultApplicationTargetStatus:
		return applyWorkItemTargetStatus(tx, projectID, item, application.TargetType, application.TargetStatus, actorID, appliedAt)
	case domainsemantic.WorkItemResultApplicationLockAssetSlotCandidate:
		return applyWorkItemAssetCandidate(tx, projectID, item, application, actorID, appliedAt)
	default:
		return nil
	}
}

func applyWorkItemAssetCandidate(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, application domainsemantic.WorkItemResultApplication, actorID *uint, appliedAt string) error {
	var candidate persistencemodel.AssetSlotCandidate
	if err := tx.Preload("CandidateAssetSlot").Where("project_id = ?", projectID).First(&candidate, application.AssetSlotCandidateID).Error; err != nil {
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
	var targetSlot persistencemodel.AssetSlot
	if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&targetSlot).Error; err != nil {
		return err
	}
	domainsemantic.MarkAssetSlotLockedToCandidate(&targetSlot, candidate)
	if err := saveCoreEntityWithRelations(tx, &targetSlot); err != nil {
		return err
	}
	var rejected []persistencemodel.AssetSlotCandidate
	if err := tx.Where("project_id = ? AND asset_slot_id = ? AND id <> ?", projectID, item.TargetID, candidate.ID).Find(&rejected).Error; err != nil {
		return err
	}
	for i := range rejected {
		domainsemantic.RejectAssetSlotCandidate(&rejected[i])
		if err := saveCoreEntityWithRelations(tx, &rejected[i]); err != nil {
			return err
		}
	}
	domainsemantic.SelectAssetSlotCandidate(&candidate)
	if err := saveCoreEntityWithRelations(tx, &candidate); err != nil {
		return err
	}
	targetID := item.TargetID
	candidateID := candidate.ID
	decision := domainsemantic.NewCandidateDecision(domainsemantic.CandidateDecisionSpec{
		ProjectID:     projectID,
		CandidateType: domainsemantic.CandidateDecisionTypeAssetSlotCandidate,
		CandidateID:   &candidateID,
		TargetType:    domainsemantic.WorkItemTargetTypeAssetSlot,
		TargetID:      &targetID,
		Decision:      domainsemantic.CandidateDecisionAccept,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
		Source:        domainsemantic.CandidateDecisionSourceManual,
		DecidedByID:   actorID,
		AppliedAt:     appliedAt,
		MetadataJSON:  workItemApplyMetadata(item.ID),
	}).ToModel()
	if err := createCoreEntityWithRelations(tx, &decision); err != nil {
		return err
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func applyWorkItemTargetStatus(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, targetType string, status string, actorID *uint, appliedAt string) error {
	if item.TargetType != targetType {
		return errors.New("任务结果类型与目标类型不匹配")
	}
	switch targetType {
	case domainsemantic.WorkItemTargetTypeContentUnit:
		var target persistencemodel.ContentUnit
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeKeyframe:
		var target persistencemodel.Keyframe
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeAssetSlot:
		var target persistencemodel.AssetSlot
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityWithRelations(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeDeliveryVersion:
		var target persistencemodel.DeliveryVersion
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

func createWorkItemAppliedReviewEvent(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, actorID *uint, appliedAt string) error {
	subjectID := item.TargetID
	metadata := workItemApplyMetadata(item.ID)
	if appliedAt != "" {
		data, _ := json.Marshal(map[string]any{"work_item_id": item.ID, "applied_at": appliedAt})
		metadata = string(data)
	}
	event := domainsemantic.NewReviewEvent(domainsemantic.ReviewEventSpec{
		ProjectID:    projectID,
		SubjectType:  item.TargetType,
		SubjectID:    &subjectID,
		EventType:    domainsemantic.ReviewEventTypeApplied,
		FromStatus:   "",
		ToStatus:     item.ResultType,
		Comment:      "任务完成后应用结果",
		Source:       domainsemantic.ReviewEventSourceManual,
		ActorID:      actorID,
		MetadataJSON: metadata,
	}).ToModel()
	return createCoreEntityWithRelations(tx, &event)
}

func createCoreEntityWithRelations(tx *gorm.DB, item any) error {
	if err := tx.Create(item).Error; err != nil {
		return err
	}
	return syncCoreEntityRelations(tx, item)
}

func saveCoreEntityWithRelations(tx *gorm.DB, item any) error {
	if err := tx.Save(item).Error; err != nil {
		return err
	}
	return syncCoreEntityRelations(tx, item)
}

func syncCoreEntityRelations(tx *gorm.DB, item any) error {
	return entityrelation.SyncCoreEntityRelations(tx, item)
}

func workItemApplyMetadata(workItemID uint) string {
	data, _ := json.Marshal(map[string]any{"work_item_id": workItemID})
	return string(data)
}
