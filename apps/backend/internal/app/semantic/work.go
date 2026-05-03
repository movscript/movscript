package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type WorkAuth struct {
	Role   string
	UserID uint
}

type WorkItemFilter struct {
	ProjectID    uint
	ProductionID uint
	TargetType   string
	Status       string
}

type WorkItemInput struct {
	ProductionID   *uint  `json:"production_id"`
	TargetType     string `json:"target_type" binding:"required"`
	TargetID       uint   `json:"target_id" binding:"required"`
	Kind           string `json:"kind"`
	Title          string `json:"title" binding:"required"`
	Description    string `json:"description"`
	Status         string `json:"status"`
	Priority       string `json:"priority"`
	AssigneeID     *uint  `json:"assignee_id"`
	SourceJobID    *uint  `json:"source_job_id"`
	SourceCanvasID *uint  `json:"source_canvas_id"`
	ResultType     string `json:"result_type"`
	ResultJSON     string `json:"result_json"`
	AppliedAt      string `json:"applied_at"`
	ApplyError     string `json:"apply_error"`
	MetadataJSON   string `json:"metadata_json"`
}

type WorkReviewFilter struct {
	ProjectID  uint
	WorkItemID uint
	Status     string
}

type WorkReviewInput struct {
	WorkItemID   uint   `json:"work_item_id" binding:"required"`
	ReviewerID   *uint  `json:"reviewer_id"`
	Status       string `json:"status"`
	Comment      string `json:"comment"`
	MetadataJSON string `json:"metadata_json"`
}

type WorkDependencyFilter struct {
	ProjectID  uint
	WorkItemID uint
}

type WorkDependencyInput struct {
	WorkItemID          uint   `json:"work_item_id" binding:"required"`
	DependsOnWorkItemID uint   `json:"depends_on_work_item_id" binding:"required"`
	DependencyType      string `json:"dependency_type"`
}

func IsWorkItemManagerRole(role string) bool {
	switch role {
	case "super_admin", "owner", "director":
		return true
	default:
		return false
	}
}

func (s *Service) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]model.WorkItem, error) {
	items := make([]model.WorkItem, 0)
	q := s.db.WithContext(ctx).Preload("Assignee").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("status, priority desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateWorkItem(ctx context.Context, projectID uint, auth WorkAuth, input WorkItemInput) (model.WorkItem, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkItem{}, ErrForbidden{Message: "只有项目负责人或导演可以分配任务"}
	}
	if err := s.validateWorkItemInput(ctx, projectID, input); err != nil {
		return model.WorkItem{}, err
	}
	item := model.WorkItem{
		ProjectID:      projectID,
		ProductionID:   input.ProductionID,
		TargetType:     input.TargetType,
		TargetID:       input.TargetID,
		Kind:           fallbackString(input.Kind, "human"),
		Title:          input.Title,
		Description:    input.Description,
		Status:         fallbackString(input.Status, "todo"),
		Priority:       fallbackString(input.Priority, "normal"),
		AssigneeID:     input.AssigneeID,
		SourceJobID:    input.SourceJobID,
		SourceCanvasID: input.SourceCanvasID,
		ResultType:     fallbackString(input.ResultType, "none"),
		ResultJSON:     input.ResultJSON,
		ApplyStatus:    InitialWorkItemApplyStatus(input.ResultType),
		AppliedAt:      input.AppliedAt,
		ApplyError:     input.ApplyError,
		MetadataJSON:   input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkItem(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkItemInput) (model.WorkItem, error) {
	var item model.WorkItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	isManager := IsWorkItemManagerRole(auth.Role)
	if !isManager && (item.AssigneeID == nil || *item.AssigneeID != auth.UserID) {
		return item, ErrForbidden{Message: "只能推进分配给自己的任务"}
	}
	if err := s.validateWorkItemInput(ctx, projectID, input); err != nil {
		return item, err
	}
	if !isManager {
		if !WorkItemInputKeepsAssignment(item, input) {
			return item, ErrForbidden{Message: "执行人只能更新状态、交付说明和关联产出"}
		}
		switch fallbackString(input.Status, item.Status) {
		case "running", "review":
		default:
			return item, ErrForbidden{Message: "执行人只能将任务推进到进行中或待审核"}
		}
	}
	if !isManager && (input.Status == "done" || input.Status == "cancelled") {
		return item, ErrForbidden{Message: "只有项目负责人或导演可以完成或取消任务"}
	}
	updates := workItemUpdates(item, input)
	if fallbackString(input.Status, item.Status) == "done" {
		return s.completeWorkItem(ctx, projectID, &item, updates, &auth.UserID)
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]model.WorkReview, error) {
	items := make([]model.WorkReview, 0)
	q := s.db.WithContext(ctx).Preload("Reviewer").Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("work_item_id, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateWorkReview(ctx context.Context, projectID uint, auth WorkAuth, input WorkReviewInput) (model.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以审核任务"}
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, true); err != nil {
		return model.WorkReview{}, err
	}
	item := model.WorkReview{
		ProjectID:    projectID,
		WorkItemID:   input.WorkItemID,
		ReviewerID:   input.ReviewerID,
		Status:       fallbackString(input.Status, "pending"),
		Comment:      input.Comment,
		MetadataJSON: input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkReview(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkReviewInput) (model.WorkReview, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkReview{}, ErrForbidden{Message: "只有项目负责人或导演可以修改审核记录"}
	}
	var item model.WorkReview
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateWorkReviewInput(ctx, projectID, &input, auth.UserID, false); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"work_item_id":  input.WorkItemID,
		"reviewer_id":   input.ReviewerID,
		"status":        input.Status,
		"comment":       input.Comment,
		"metadata_json": input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]model.WorkDependency, error) {
	items := make([]model.WorkDependency, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	err := q.Order("work_item_id, id").Find(&items).Error
	return items, err
}

func (s *Service) CreateWorkDependency(ctx context.Context, projectID uint, auth WorkAuth, input WorkDependencyInput) (model.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return model.WorkDependency{}, err
	}
	item := model.WorkDependency{
		ProjectID:           projectID,
		WorkItemID:          input.WorkItemID,
		DependsOnWorkItemID: input.DependsOnWorkItemID,
		DependencyType:      fallbackString(input.DependencyType, "blocks"),
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchWorkDependency(ctx context.Context, projectID uint, id string, auth WorkAuth, input WorkDependencyInput) (model.WorkDependency, error) {
	if !IsWorkItemManagerRole(auth.Role) {
		return model.WorkDependency{}, ErrForbidden{Message: "只有项目负责人或导演可以维护任务依赖"}
	}
	var item model.WorkDependency
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateWorkDependencyInput(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"work_item_id":            input.WorkItemID,
		"depends_on_work_item_id": input.DependsOnWorkItemID,
		"dependency_type":         input.DependencyType,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

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

func (s *Service) validateWorkItemInput(ctx context.Context, projectID uint, input WorkItemInput) error {
	if strings.TrimSpace(input.Title) == "" {
		return ErrInvalidInput{Err: errors.New("任务标题不能为空")}
	}
	if !validWorkItemKind(fallbackString(input.Kind, "human")) {
		return ErrInvalidInput{Err: errors.New("任务类型无效")}
	}
	if !validWorkItemStatus(fallbackString(input.Status, "todo")) {
		return ErrInvalidInput{Err: errors.New("任务状态无效")}
	}
	if !validWorkItemPriority(fallbackString(input.Priority, "normal")) {
		return ErrInvalidInput{Err: errors.New("任务优先级无效")}
	}
	if !validWorkItemResultType(fallbackString(input.ResultType, "none")) {
		return ErrInvalidInput{Err: errors.New("任务结果类型无效")}
	}
	if strings.TrimSpace(input.ResultJSON) != "" && !ValidJSONObject(input.ResultJSON) {
		return ErrInvalidInput{Err: errors.New("任务结果必须是 JSON 对象")}
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return err
		}
	}
	if err := s.ensureOwnerInProject(ctx, projectID, input.TargetType, input.TargetID); err != nil {
		return err
	}
	if input.AssigneeID != nil {
		if err := s.ensureUserInProject(ctx, projectID, *input.AssigneeID); err != nil {
			return err
		}
	}
	if input.SourceJobID != nil {
		if err := s.ensureJobInProject(ctx, projectID, *input.SourceJobID); err != nil {
			return err
		}
	}
	if input.SourceCanvasID != nil {
		if err := s.ensureCanvasInProject(ctx, projectID, *input.SourceCanvasID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateWorkReviewInput(ctx context.Context, projectID uint, input *WorkReviewInput, currentUserID uint, defaultReviewer bool) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "work_item", input.WorkItemID); err != nil {
		return err
	}
	if input.ReviewerID == nil && defaultReviewer {
		input.ReviewerID = &currentUserID
	}
	if input.ReviewerID != nil {
		if err := s.ensureUserInProject(ctx, projectID, *input.ReviewerID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateWorkDependencyInput(ctx context.Context, projectID uint, input WorkDependencyInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "work_item", input.WorkItemID); err != nil {
		return err
	}
	return s.ensureOwnerInProject(ctx, projectID, "work_item", input.DependsOnWorkItemID)
}

func workItemUpdates(item model.WorkItem, input WorkItemInput) map[string]any {
	updates := compactUpdates(map[string]any{
		"production_id":    input.ProductionID,
		"target_type":      input.TargetType,
		"target_id":        input.TargetID,
		"kind":             input.Kind,
		"title":            input.Title,
		"description":      input.Description,
		"status":           input.Status,
		"priority":         input.Priority,
		"assignee_id":      input.AssigneeID,
		"source_job_id":    input.SourceJobID,
		"source_canvas_id": input.SourceCanvasID,
		"metadata_json":    input.MetadataJSON,
	})
	if strings.TrimSpace(input.ResultType) != "" || strings.TrimSpace(input.ResultJSON) != "" {
		updates["result_type"] = fallbackString(input.ResultType, item.ResultType)
		updates["result_json"] = input.ResultJSON
		updates["apply_status"] = ApplyStatusForWorkItemPatch(item, input)
		updates["applied_at"] = input.AppliedAt
		updates["apply_error"] = input.ApplyError
	}
	return updates
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

func WorkItemInputKeepsAssignment(item model.WorkItem, input WorkItemInput) bool {
	if input.TargetType != item.TargetType || input.TargetID != item.TargetID {
		return false
	}
	if input.Title != item.Title || input.Description != item.Description || input.Kind != item.Kind || input.Priority != item.Priority {
		return false
	}
	if !sameUintPtr(input.ProductionID, item.ProductionID) || !sameUintPtr(input.AssigneeID, item.AssigneeID) {
		return false
	}
	return true
}

func sameUintPtr(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func validWorkItemResultType(resultType string) bool {
	switch resultType {
	case "none", "status_change", "lock_asset_candidate", "accept_keyframe", "approve_delivery_version":
		return true
	default:
		return false
	}
}

func validWorkItemKind(kind string) bool {
	switch kind {
	case "human", "ai", "hybrid", "review", "fix":
		return true
	default:
		return false
	}
}

func validWorkItemStatus(status string) bool {
	switch status {
	case "todo", "running", "blocked", "review", "done", "cancelled":
		return true
	default:
		return false
	}
}

func validWorkItemPriority(priority string) bool {
	switch priority {
	case "low", "normal", "high", "critical":
		return true
	default:
		return false
	}
}

type WorkItemResultPayload struct {
	Status               string `json:"status"`
	TargetStatus         string `json:"target_status"`
	AssetSlotCandidateID uint   `json:"asset_slot_candidate_id"`
}

func DecodeWorkItemResultJSON(raw string) (WorkItemResultPayload, error) {
	var payload WorkItemResultPayload
	if strings.TrimSpace(raw) == "" {
		return payload, errors.New("任务结果需要 result_json")
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return payload, errors.New("任务结果 JSON 无效")
	}
	return payload, nil
}

func ValidJSONObject(raw string) bool {
	var value map[string]any
	return json.Unmarshal([]byte(raw), &value) == nil
}

func InitialWorkItemApplyStatus(resultType string) string {
	if fallbackString(resultType, "none") == "none" {
		return "not_applicable"
	}
	return "pending"
}

func ApplyStatusForWorkItemPatch(item model.WorkItem, input WorkItemInput) string {
	resultType := fallbackString(input.ResultType, item.ResultType)
	if resultType == "none" {
		return "not_applicable"
	}
	if resultType != item.ResultType || strings.TrimSpace(input.ResultJSON) != strings.TrimSpace(item.ResultJSON) {
		return "pending"
	}
	if item.ApplyStatus == "" || item.ApplyStatus == "not_applicable" {
		return "pending"
	}
	return item.ApplyStatus
}

func ApplyWorkItemUpdates(item *model.WorkItem, updates map[string]any) {
	if value, ok := updates["production_id"].(*uint); ok {
		item.ProductionID = value
	}
	if value, ok := updates["target_type"].(string); ok {
		item.TargetType = value
	}
	if value, ok := updates["target_id"].(uint); ok {
		item.TargetID = value
	}
	if value, ok := updates["kind"].(string); ok {
		item.Kind = value
	}
	if value, ok := updates["title"].(string); ok {
		item.Title = value
	}
	if value, ok := updates["description"].(string); ok {
		item.Description = value
	}
	if value, ok := updates["status"].(string); ok {
		item.Status = value
	}
	if value, ok := updates["priority"].(string); ok {
		item.Priority = value
	}
	if value, ok := updates["assignee_id"].(*uint); ok {
		item.AssigneeID = value
	}
	if value, ok := updates["source_job_id"].(*uint); ok {
		item.SourceJobID = value
	}
	if value, ok := updates["source_canvas_id"].(*uint); ok {
		item.SourceCanvasID = value
	}
	if value, ok := updates["result_type"].(string); ok {
		item.ResultType = value
	}
	if value, ok := updates["result_json"].(string); ok {
		item.ResultJSON = value
	}
	if value, ok := updates["apply_status"].(string); ok {
		item.ApplyStatus = value
	}
	if value, ok := updates["applied_at"].(string); ok {
		item.AppliedAt = value
	}
	if value, ok := updates["apply_error"].(string); ok {
		item.ApplyError = value
	}
	if value, ok := updates["metadata_json"].(string); ok {
		item.MetadataJSON = value
	}
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

func (s *Service) ensureUserInProject(ctx context.Context, projectID, userID uint) error {
	if userID == 0 {
		return ErrInvalidInput{Err: errors.New("user id is required")}
	}
	var count int64
	s.db.WithContext(ctx).Model(&model.Project{}).Where("id = ? AND owner_id = ?", projectID, userID).Count(&count)
	if count > 0 {
		return nil
	}
	s.db.WithContext(ctx).Model(&model.ProjectMember{}).Where("project_id = ? AND user_id = ?", projectID, userID).Count(&count)
	if count == 0 {
		return ErrInvalidInput{Err: errors.New("执行成员不属于当前项目")}
	}
	return nil
}

func (s *Service) ensureJobInProject(ctx context.Context, projectID, jobID uint) error {
	if jobID == 0 {
		return ErrInvalidInput{Err: errors.New("source job id is required")}
	}
	var job model.Job
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&job, jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if job.ProjectID == nil || *job.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}
