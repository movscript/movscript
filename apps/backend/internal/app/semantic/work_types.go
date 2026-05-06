package semantic

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

type WorkItemResultPayload struct {
	Status               string `json:"status"`
	TargetStatus         string `json:"target_status"`
	AssetSlotCandidateID uint   `json:"asset_slot_candidate_id"`
}

func IsWorkItemManagerRole(role string) bool {
	switch role {
	case "super_admin", "owner", "director":
		return true
	default:
		return false
	}
}
