package semantic

import domainsemantic "github.com/movscript/movscript/internal/domain/semantic"

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

func (input WorkItemInput) domainPatch() domainsemantic.WorkItemPatch {
	return domainsemantic.WorkItemPatch{
		ProductionID:   input.ProductionID,
		TargetType:     input.TargetType,
		TargetID:       input.TargetID,
		Kind:           input.Kind,
		Title:          input.Title,
		Description:    input.Description,
		Status:         input.Status,
		Priority:       input.Priority,
		AssigneeID:     input.AssigneeID,
		SourceJobID:    input.SourceJobID,
		SourceCanvasID: input.SourceCanvasID,
		ResultType:     input.ResultType,
		ResultJSON:     input.ResultJSON,
		AppliedAt:      input.AppliedAt,
		ApplyError:     input.ApplyError,
		MetadataJSON:   input.MetadataJSON,
	}
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
	return domainsemantic.IsWorkItemManagerRole(role)
}
