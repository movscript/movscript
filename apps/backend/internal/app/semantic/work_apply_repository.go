package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	domainrelation "github.com/movscript/movscript/internal/domain/relation"
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
	case domainsemantic.WorkItemResultApplicationAcceptKeyframeCandidate:
		return applyWorkItemKeyframeCandidate(tx, projectID, item, application, actorID, appliedAt)
	default:
		return nil
	}
}

func applyWorkItemAssetCandidate(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, application domainsemantic.WorkItemResultApplication, actorID *uint, appliedAt string) error {
	var candidate persistencemodel.AssetSlotCandidate
	if err := tx.Where("project_id = ?", projectID).First(&candidate, application.AssetSlotCandidateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("素材候选不存在")
		}
		return err
	}
	if candidate.AssetSlotID != item.TargetID {
		return errors.New("素材候选不属于当前任务目标素材位")
	}
	if candidate.Status == domainsemantic.AssetSlotCandidateStatusRejected {
		return errors.New("素材候选已被拒绝")
	}
	var candidateSlot persistencemodel.AssetSlot
	if err := tx.Where("project_id = ?", projectID).First(&candidateSlot, candidate.CandidateAssetSlotID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("素材候选缺少候选素材位")
		}
		return err
	}
	if candidateSlot.ID == 0 {
		return errors.New("素材候选缺少候选素材位")
	}
	if candidateSlot.ResourceID == nil || *candidateSlot.ResourceID == 0 {
		return errors.New("素材候选缺少资源")
	}
	if err := ensureCandidateRawResourceExists(tx, *candidateSlot.ResourceID, "素材候选资源不存在"); err != nil {
		return err
	}
	var targetSlot persistencemodel.AssetSlot
	if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&targetSlot).Error; err != nil {
		return err
	}
	domainCandidate := domainsemantic.AssetSlotCandidateFromModel(candidate)
	candidateResourceID := candidateSlot.ResourceID
	domainTargetSlot := domainsemantic.AssetSlotFromModel(targetSlot)
	domainsemantic.LockSlotToCandidate(&domainTargetSlot, domainCandidate, candidateResourceID)
	domainTargetSlot.ApplyToModel(&targetSlot)
	if err := saveCoreEntityAndWriteGraph(tx, &targetSlot); err != nil {
		return err
	}
	rejected, err := loadRejectedAssetSlotCandidates(tx, projectID, item.TargetID, candidate.ID)
	if err != nil {
		return err
	}
	for i := range rejected {
		domainsemantic.RejectAssetSlotCandidate(&rejected[i])
		if err := saveCoreEntityAndWriteGraph(tx, &rejected[i]); err != nil {
			return err
		}
	}
	domainsemantic.SelectAssetSlotCandidate(&candidate)
	if err := saveCoreEntityAndWriteGraph(tx, &candidate); err != nil {
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
	if err := createCoreEntityAndWriteGraph(tx, &decision); err != nil {
		return err
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func loadRejectedAssetSlotCandidates(tx *gorm.DB, projectID uint, targetAssetSlotID uint, selectedCandidateID uint) ([]persistencemodel.AssetSlotCandidate, error) {
	relations := make([]persistencemodel.EntityRelation, 0)
	if err := tx.Where(
		"project_id = ? AND category = ? AND type = ? AND target_type = ? AND target_id = ?",
		projectID,
		domainrelation.CategoryAsset,
		domainrelation.TypeCandidateFor,
		"asset_slot",
		targetAssetSlotID,
	).Where("valid_to IS NULL").Find(&relations).Error; err != nil {
		return nil, err
	}
	rejected := make([]persistencemodel.AssetSlotCandidate, 0, len(relations))
	seen := make(map[uint]struct{}, len(relations))
	for _, edge := range relations {
		if edge.SourceType != "asset_slot" {
			continue
		}
		candidateID := relationMetadataUint(edge.MetadataJSON, "asset_slot_candidate_id")
		if candidateID == 0 || candidateID == selectedCandidateID {
			continue
		}
		if _, ok := seen[candidateID]; ok {
			continue
		}
		seen[candidateID] = struct{}{}
		var candidate persistencemodel.AssetSlotCandidate
		if err := tx.Where("project_id = ?", projectID).First(&candidate, candidateID).Error; err != nil {
			return nil, err
		}
		rejected = append(rejected, candidate)
	}
	return rejected, nil
}

func applyWorkItemKeyframeCandidate(tx *gorm.DB, projectID uint, item domainsemantic.WorkItem, application domainsemantic.WorkItemResultApplication, actorID *uint, appliedAt string) error {
	if item.TargetType != domainsemantic.WorkItemTargetTypeKeyframe {
		return errors.New("accept_keyframe 只能应用到 keyframe 任务")
	}
	var candidate persistencemodel.Keyframe
	if err := tx.Where("project_id = ?", projectID).First(&candidate, application.KeyframeCandidateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("关键帧候选不存在")
		}
		return err
	}
	if !isGeneratedKeyframeCandidateMetadata(candidate.MetadataJSON) {
		return errors.New("关键帧候选不是 AI 生成候选")
	}
	if candidate.Status == "rejected" {
		return errors.New("关键帧候选已被拒绝")
	}
	if candidate.ResourceID == nil || *candidate.ResourceID == 0 {
		return errors.New("关键帧候选缺少资源")
	}
	if err := ensureCandidateRawResourceExists(tx, *candidate.ResourceID, "关键帧候选资源不存在"); err != nil {
		return err
	}
	if keyframeCandidateTargetID(candidate.MetadataJSON) != item.TargetID {
		return errors.New("关键帧候选不属于当前任务目标画面锚点")
	}
	var target persistencemodel.Keyframe
	if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
		return err
	}
	target.ResourceID = candidate.ResourceID
	target.CanvasID = candidate.CanvasID
	if strings.TrimSpace(candidate.Description) != "" {
		target.Description = candidate.Description
	}
	if strings.TrimSpace(candidate.Prompt) != "" {
		target.Prompt = candidate.Prompt
	}
	target.Status = domainsemantic.KeyframeStatusAccepted
	if err := saveCoreEntityAndWriteGraph(tx, &target); err != nil {
		return err
	}
	candidate.Status = domainsemantic.KeyframeStatusAccepted
	if err := saveCoreEntityAndWriteGraph(tx, &candidate); err != nil {
		return err
	}
	rejected, err := loadRejectedKeyframeCandidates(tx, projectID, item.TargetID, candidate.ID)
	if err != nil {
		return err
	}
	for i := range rejected {
		rejected[i].Status = "rejected"
		if err := saveCoreEntityAndWriteGraph(tx, &rejected[i]); err != nil {
			return err
		}
	}
	targetID := item.TargetID
	candidateID := candidate.ID
	decision := domainsemantic.NewCandidateDecision(domainsemantic.CandidateDecisionSpec{
		ProjectID:     projectID,
		CandidateType: domainsemantic.WorkItemTargetTypeKeyframe,
		CandidateID:   &candidateID,
		TargetType:    domainsemantic.WorkItemTargetTypeKeyframe,
		TargetID:      &targetID,
		Decision:      domainsemantic.CandidateDecisionAccept,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
		Source:        domainsemantic.CandidateDecisionSourceManual,
		DecidedByID:   actorID,
		AppliedAt:     appliedAt,
		MetadataJSON:  keyframeCandidateApplyMetadata(item.ID, candidate.ID, appliedAt),
	}).ToModel()
	if err := createCoreEntityAndWriteGraph(tx, &decision); err != nil {
		return err
	}
	return createWorkItemAppliedReviewEvent(tx, projectID, item, actorID, appliedAt)
}

func ensureCandidateRawResourceExists(tx *gorm.DB, resourceID uint, message string) error {
	var resource persistencemodel.RawResource
	if err := tx.Select("id").First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New(message)
		}
		return err
	}
	return nil
}

func loadRejectedKeyframeCandidates(tx *gorm.DB, projectID uint, targetKeyframeID uint, selectedCandidateID uint) ([]persistencemodel.Keyframe, error) {
	items := make([]persistencemodel.Keyframe, 0)
	if err := tx.Where("project_id = ? AND id <> ? AND status <> ?", projectID, selectedCandidateID, "rejected").Find(&items).Error; err != nil {
		return nil, err
	}
	rejected := make([]persistencemodel.Keyframe, 0, len(items))
	for _, item := range items {
		if keyframeCandidateTargetID(item.MetadataJSON) == targetKeyframeID {
			rejected = append(rejected, item)
		}
	}
	return rejected, nil
}

func keyframeCandidateTargetID(metadata string) uint {
	var payload struct {
		TargetKeyframeID uint `json:"target_keyframe_id"`
	}
	if err := json.Unmarshal([]byte(metadata), &payload); err != nil {
		return 0
	}
	return payload.TargetKeyframeID
}

func isGeneratedKeyframeCandidateMetadata(metadata string) bool {
	var payload struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal([]byte(metadata), &payload); err != nil {
		return false
	}
	return payload.Source == "ai_generated_keyframe_candidate"
}

func isKeyframeCandidateMetadata(metadata string) bool {
	var payload struct {
		Source           string `json:"source"`
		TargetKeyframeID uint   `json:"target_keyframe_id"`
	}
	if err := json.Unmarshal([]byte(metadata), &payload); err != nil {
		return false
	}
	return payload.Source == "ai_generated_keyframe_candidate" || payload.TargetKeyframeID > 0
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
		if err := saveCoreEntityAndWriteGraph(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeKeyframe:
		var target persistencemodel.Keyframe
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityAndWriteGraph(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeAssetSlot:
		var target persistencemodel.AssetSlot
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityAndWriteGraph(tx, &target); err != nil {
			return err
		}
	case domainsemantic.WorkItemTargetTypeDeliveryVersion:
		var target persistencemodel.DeliveryVersion
		if err := tx.Where("project_id = ? AND id = ?", projectID, item.TargetID).First(&target).Error; err != nil {
			return err
		}
		target.Status = status
		if err := saveCoreEntityAndWriteGraph(tx, &target); err != nil {
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
	return createCoreEntityAndWriteGraph(tx, &event)
}

func createCoreEntityAndWriteGraph(tx *gorm.DB, item any) error {
	if err := tx.Create(item).Error; err != nil {
		return err
	}
	return syncCoreEntityRelations(tx, item)
}

func saveCoreEntityAndWriteGraph(tx *gorm.DB, item any) error {
	if err := tx.Save(item).Error; err != nil {
		return err
	}
	return syncCoreEntityRelations(tx, item)
}

func syncCoreEntityRelations(tx *gorm.DB, item any) error {
	ctx := context.Background()
	if tx.Statement != nil && tx.Statement.Context != nil {
		ctx = tx.Statement.Context
	}
	service := NewService(tx)
	switch v := item.(type) {
	case *persistencemodel.WorkItem:
		return service.upsertWorkItemRelations(ctx, domainsemantic.WorkItemFromModel(*v))
	case *persistencemodel.AssetSlot:
		return service.upsertAssetSlotRelations(ctx, domainsemantic.AssetSlotFromModel(*v))
	case *persistencemodel.AssetSlotCandidate:
		return service.upsertAssetSlotCandidateRelation(ctx, domainsemantic.AssetSlotCandidateFromModel(*v))
	case *persistencemodel.CandidateDecision:
		return service.upsertCandidateDecisionRelations(ctx, domainsemantic.CandidateDecisionFromModel(*v))
	case *persistencemodel.ReviewEvent:
		return service.upsertReviewEventRelation(ctx, domainsemantic.ReviewEventFromModel(*v))
	case *persistencemodel.ContentUnit:
		return service.upsertContentUnitRelations(ctx, domainsemantic.ContentUnitFromModel(*v))
	case *persistencemodel.Keyframe:
		return service.upsertKeyframeRelations(ctx, domainsemantic.KeyframeFromModel(*v))
	case *persistencemodel.DeliveryVersion:
		return service.upsertDeliveryVersionRelations(ctx, domainsemantic.DeliveryVersionFromModel(*v))
	default:
		return nil
	}
}

func workItemApplyMetadata(workItemID uint) string {
	data, _ := json.Marshal(map[string]any{"work_item_id": workItemID})
	return string(data)
}

func keyframeCandidateApplyMetadata(workItemID uint, keyframeCandidateID uint, appliedAt string) string {
	data, _ := json.Marshal(map[string]any{
		"work_item_id":          workItemID,
		"keyframe_candidate_id": keyframeCandidateID,
		"applied_at":            appliedAt,
		"source":                "work_item_keyframe_candidate_selection",
	})
	return string(data)
}
