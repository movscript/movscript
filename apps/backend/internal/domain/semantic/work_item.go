package semantic

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

type WorkAuth struct {
	Role   string
	UserID uint
}

type WorkItemPatch struct {
	ProductionID   *uint
	TargetType     string
	TargetID       uint
	Kind           string
	Title          string
	Description    string
	Status         string
	Priority       string
	AssigneeID     *uint
	SourceJobID    *uint
	SourceCanvasID *uint
	ResultType     string
	ResultJSON     string
	AppliedAt      string
	ApplyError     string
	MetadataJSON   string
}

type WorkItemResultPayload struct {
	Status               string `json:"status"`
	TargetStatus         string `json:"target_status"`
	AssetSlotCandidateID uint   `json:"asset_slot_candidate_id"`
}

const (
	WorkItemResultNone                   = "none"
	WorkItemResultStatusChange           = "status_change"
	WorkItemResultLockAssetCandidate     = "lock_asset_candidate"
	WorkItemResultAcceptKeyframe         = "accept_keyframe"
	WorkItemResultApproveDeliveryVersion = "approve_delivery_version"

	WorkItemStatusTodo      = "todo"
	WorkItemStatusRunning   = "running"
	WorkItemStatusBlocked   = "blocked"
	WorkItemStatusReview    = "review"
	WorkItemStatusDone      = "done"
	WorkItemStatusCancelled = "cancelled"

	WorkItemApplyStatusNotApplicable = "not_applicable"
	WorkItemApplyStatusPending       = "pending"
	WorkItemApplyStatusApplied       = "applied"
	WorkItemApplyStatusFailed        = "failed"
)

func NewWorkItem(projectID uint, patch WorkItemPatch) model.WorkItem {
	return model.WorkItem{
		ProjectID:      projectID,
		ProductionID:   patch.ProductionID,
		TargetType:     patch.TargetType,
		TargetID:       patch.TargetID,
		Kind:           FallbackString(patch.Kind, "human"),
		Title:          patch.Title,
		Description:    patch.Description,
		Status:         FallbackString(patch.Status, WorkItemStatusTodo),
		Priority:       FallbackString(patch.Priority, "normal"),
		AssigneeID:     patch.AssigneeID,
		SourceJobID:    patch.SourceJobID,
		SourceCanvasID: patch.SourceCanvasID,
		ResultType:     FallbackString(patch.ResultType, WorkItemResultNone),
		ResultJSON:     patch.ResultJSON,
		ApplyStatus:    InitialWorkItemApplyStatus(patch.ResultType),
		AppliedAt:      patch.AppliedAt,
		ApplyError:     patch.ApplyError,
		MetadataJSON:   patch.MetadataJSON,
	}
}

func ValidateWorkItemPatch(patch WorkItemPatch) error {
	if strings.TrimSpace(patch.Title) == "" {
		return errors.New("任务标题不能为空")
	}
	if !ValidWorkItemKind(FallbackString(patch.Kind, "human")) {
		return errors.New("任务类型无效")
	}
	if !ValidWorkItemStatus(FallbackString(patch.Status, WorkItemStatusTodo)) {
		return errors.New("任务状态无效")
	}
	if !ValidWorkItemPriority(FallbackString(patch.Priority, "normal")) {
		return errors.New("任务优先级无效")
	}
	if !ValidWorkItemResultType(FallbackString(patch.ResultType, WorkItemResultNone)) {
		return errors.New("任务结果类型无效")
	}
	if strings.TrimSpace(patch.ResultJSON) != "" && !ValidJSONObject(patch.ResultJSON) {
		return errors.New("任务结果必须是 JSON 对象")
	}
	return nil
}

func WorkItemUpdates(item model.WorkItem, patch WorkItemPatch) map[string]any {
	updates := CompactUpdates(map[string]any{
		"production_id":    patch.ProductionID,
		"target_type":      patch.TargetType,
		"target_id":        patch.TargetID,
		"kind":             patch.Kind,
		"title":            patch.Title,
		"description":      patch.Description,
		"status":           patch.Status,
		"priority":         patch.Priority,
		"assignee_id":      patch.AssigneeID,
		"source_job_id":    patch.SourceJobID,
		"source_canvas_id": patch.SourceCanvasID,
		"metadata_json":    patch.MetadataJSON,
	})
	if strings.TrimSpace(patch.ResultType) != "" || strings.TrimSpace(patch.ResultJSON) != "" {
		updates["result_type"] = FallbackString(patch.ResultType, item.ResultType)
		updates["result_json"] = patch.ResultJSON
		updates["apply_status"] = ApplyStatusForWorkItemPatch(item, patch)
		updates["applied_at"] = patch.AppliedAt
		updates["apply_error"] = patch.ApplyError
	}
	return updates
}

func WorkItemPatchKeepsAssignment(item model.WorkItem, patch WorkItemPatch) bool {
	if patch.TargetType != item.TargetType || patch.TargetID != item.TargetID {
		return false
	}
	if patch.Title != item.Title || patch.Description != item.Description || patch.Kind != item.Kind || patch.Priority != item.Priority {
		return false
	}
	if !sameUintPtr(patch.ProductionID, item.ProductionID) || !sameUintPtr(patch.AssigneeID, item.AssigneeID) {
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

func ValidWorkItemResultType(resultType string) bool {
	switch resultType {
	case WorkItemResultNone, WorkItemResultStatusChange, WorkItemResultLockAssetCandidate, WorkItemResultAcceptKeyframe, WorkItemResultApproveDeliveryVersion:
		return true
	default:
		return false
	}
}

func ValidWorkItemKind(kind string) bool {
	switch kind {
	case "human", "ai", "hybrid", "review", "fix":
		return true
	default:
		return false
	}
}

func ValidWorkItemStatus(status string) bool {
	switch status {
	case WorkItemStatusTodo, WorkItemStatusRunning, WorkItemStatusBlocked, WorkItemStatusReview, WorkItemStatusDone, WorkItemStatusCancelled:
		return true
	default:
		return false
	}
}

func ValidWorkItemPriority(priority string) bool {
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

func FallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func FallbackInt(value int, fallback int) int {
	if value != 0 {
		return value
	}
	return fallback
}

func CompactUpdates(values map[string]any) map[string]any {
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

func TruthyFilter(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "yes", "y", "on":
		return true
	}
	return value == "true" || value == "1"
}

func InitialWorkItemApplyStatus(resultType string) string {
	if FallbackString(resultType, WorkItemResultNone) == WorkItemResultNone {
		return WorkItemApplyStatusNotApplicable
	}
	return WorkItemApplyStatusPending
}

func ApplyStatusForWorkItemPatch(item model.WorkItem, patch WorkItemPatch) string {
	resultType := FallbackString(patch.ResultType, item.ResultType)
	if resultType == WorkItemResultNone {
		return WorkItemApplyStatusNotApplicable
	}
	if resultType != item.ResultType || strings.TrimSpace(patch.ResultJSON) != strings.TrimSpace(item.ResultJSON) {
		return WorkItemApplyStatusPending
	}
	if item.ApplyStatus == "" || item.ApplyStatus == WorkItemApplyStatusNotApplicable {
		return WorkItemApplyStatusPending
	}
	return item.ApplyStatus
}

func PrepareWorkItemResultApplication(item *model.WorkItem) {
	item.ResultType = FallbackString(item.ResultType, WorkItemResultNone)
	if item.ResultType == WorkItemResultNone {
		item.ApplyStatus = WorkItemApplyStatusNotApplicable
		item.AppliedAt = ""
		item.ApplyError = ""
		return
	}
	item.ApplyStatus = WorkItemApplyStatusPending
	item.ApplyError = ""
}

func MarkWorkItemResultApplied(item *model.WorkItem, appliedAt string) {
	item.ApplyStatus = WorkItemApplyStatusApplied
	item.AppliedAt = appliedAt
	item.ApplyError = ""
}

func MarkWorkItemResultApplyFailed(item *model.WorkItem, errMsg string) {
	item.ApplyStatus = WorkItemApplyStatusFailed
	item.ApplyError = errMsg
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

func IsWorkItemManagerRole(role string) bool {
	switch role {
	case "super_admin", "owner", "director":
		return true
	default:
		return false
	}
}
