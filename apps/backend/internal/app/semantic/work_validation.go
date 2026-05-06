package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

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
