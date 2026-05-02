package model

import "gorm.io/gorm"

// Production is the top-level unit for one concrete making effort. It may be
// created from a script/preview flow, or directly as a blank production.
type Production struct {
	gorm.Model
	ProjectID         uint             `gorm:"not null;index" json:"project_id"`
	ScriptVersionID   *uint            `gorm:"index" json:"script_version_id,omitempty"`
	ScriptVersion     *ScriptVersion   `gorm:"foreignKey:ScriptVersionID" json:"script_version,omitempty"`
	PreviewTimelineID *uint            `gorm:"index" json:"preview_timeline_id,omitempty"`
	PreviewTimeline   *PreviewTimeline `gorm:"foreignKey:PreviewTimelineID" json:"preview_timeline,omitempty"`
	Name              string           `gorm:"not null" json:"name"`
	Description       string           `gorm:"type:text" json:"description"`
	Status            string           `gorm:"not null;default:'planning';index" json:"status"`    // planning|previewing|materializing|producing|reviewing|delivered|archived
	SourceType        string           `gorm:"not null;default:'direct';index" json:"source_type"` // direct|script|brief|preview|import
	OwnerLabel        string           `json:"owner_label"`
	Progress          int              `gorm:"not null;default:0" json:"progress"`
	MetadataJSON      string           `gorm:"type:text" json:"metadata_json"`
}

// AssetSlot is the semantic material unit. It can represent a missing production
// need, a candidate result, or the locked material used downstream.
type AssetSlot struct {
	gorm.Model
	ProjectID                uint                    `gorm:"not null;index" json:"project_id"`
	ProductionID             *uint                   `gorm:"index" json:"production_id,omitempty"`
	Production               *Production             `gorm:"foreignKey:ProductionID" json:"production,omitempty"`
	CreativeReferenceID      *uint                   `gorm:"index" json:"creative_reference_id,omitempty"`
	CreativeReference        *CreativeReference      `gorm:"foreignKey:CreativeReferenceID" json:"creative_reference,omitempty"`
	CreativeReferenceStateID *uint                   `gorm:"index" json:"creative_reference_state_id,omitempty"`
	CreativeReferenceState   *CreativeReferenceState `gorm:"foreignKey:CreativeReferenceStateID" json:"creative_reference_state,omitempty"`
	OwnerType                string                  `gorm:"index:idx_asset_slot_owner" json:"owner_type"` // segment|scene_moment|content_unit|keyframe|creative_reference_state
	OwnerID                  *uint                   `gorm:"index:idx_asset_slot_owner" json:"owner_id,omitempty"`
	Kind                     string                  `gorm:"not null;index" json:"kind"` // image|video|audio|text|brand_pack|reference
	Name                     string                  `gorm:"not null" json:"name"`
	Description              string                  `gorm:"type:text" json:"description"`
	SlotKey                  string                  `json:"slot_key"` // front_half_body|prop_detail|environment|voice|logo
	PromptHint               string                  `gorm:"type:text" json:"prompt_hint"`
	Status                   string                  `gorm:"not null;default:'missing';index" json:"status"`  // missing|candidate|locked|waived
	Priority                 string                  `gorm:"not null;default:'normal';index" json:"priority"` // low|normal|high|critical
	ResourceID               *uint                   `gorm:"index" json:"resource_id,omitempty"`
	Resource                 *RawResource            `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
	LockedAssetSlotID        *uint                   `gorm:"index" json:"locked_asset_slot_id,omitempty"`
	LockedAssetSlot          *AssetSlot              `gorm:"foreignKey:LockedAssetSlotID" json:"locked_asset_slot,omitempty"`
	MetadataJSON             string                  `gorm:"type:text" json:"metadata_json"`
}

type AssetSlotCandidate struct {
	gorm.Model
	ProjectID            uint       `gorm:"not null;index" json:"project_id"`
	AssetSlotID          uint       `gorm:"not null;index" json:"asset_slot_id"`
	AssetSlot            *AssetSlot `gorm:"foreignKey:AssetSlotID" json:"asset_slot,omitempty"`
	CandidateAssetSlotID uint       `gorm:"not null;index" json:"candidate_asset_slot_id"`
	CandidateAssetSlot   *AssetSlot `gorm:"foreignKey:CandidateAssetSlotID" json:"candidate_asset_slot,omitempty"`
	SourceType           string     `gorm:"not null;default:'manual';index" json:"source_type"` // upload|job|canvas|manual|import
	SourceID             *uint      `json:"source_id,omitempty"`
	Score                float64    `json:"score"`
	Status               string     `gorm:"not null;default:'candidate';index" json:"status"` // candidate|selected|rejected
	Note                 string     `gorm:"type:text" json:"note"`
}

// CandidateDecision records user or system decisions for generated candidates.
// It supports persisted candidates by ID and draft/runtime candidates by client
// ID so acceptance history is not lost before a candidate becomes a fact.
type CandidateDecision struct {
	gorm.Model
	ProjectID         uint   `gorm:"not null;index" json:"project_id"`
	CandidateType     string `gorm:"not null;index:idx_candidate_decision_candidate" json:"candidate_type"` // segment|scene_moment|storyboard_line|keyframe|asset_slot_candidate|preview_timeline
	CandidateID       *uint  `gorm:"index:idx_candidate_decision_candidate" json:"candidate_id,omitempty"`
	CandidateClientID string `gorm:"index" json:"candidate_client_id"`
	TargetType        string `gorm:"index:idx_candidate_decision_target" json:"target_type"` // optional fact/result object
	TargetID          *uint  `gorm:"index:idx_candidate_decision_target" json:"target_id,omitempty"`
	Decision          string `gorm:"not null;index" json:"decision"`                  // accept|reject|revise|defer|rollback
	Status            string `gorm:"not null;default:'recorded';index" json:"status"` // recorded|applied|superseded|failed
	Reason            string `gorm:"type:text" json:"reason"`
	Note              string `gorm:"type:text" json:"note"`
	Source            string `gorm:"not null;default:'manual';index" json:"source"` // manual|ai|runtime|import
	DecidedByID       *uint  `gorm:"index" json:"decided_by_id,omitempty"`
	AppliedAt         string `json:"applied_at"`
	MetadataJSON      string `gorm:"type:text" json:"metadata_json"`
}

// ReviewEvent is an append-only event stream for review and approval history
// across semantic objects. WorkReview remains task-specific; ReviewEvent covers
// candidates, facts, timelines, delivery items, and canvas outputs.
type ReviewEvent struct {
	gorm.Model
	ProjectID       uint   `gorm:"not null;index" json:"project_id"`
	SubjectType     string `gorm:"not null;index:idx_review_event_subject" json:"subject_type"`
	SubjectID       *uint  `gorm:"index:idx_review_event_subject" json:"subject_id,omitempty"`
	SubjectClientID string `gorm:"index" json:"subject_client_id"`
	EventType       string `gorm:"not null;index" json:"event_type"` // submitted|commented|approved|changes_requested|rejected|resolved|reopened|applied|rolled_back
	FromStatus      string `json:"from_status"`
	ToStatus        string `json:"to_status"`
	Comment         string `gorm:"type:text" json:"comment"`
	Reason          string `gorm:"type:text" json:"reason"`
	Source          string `gorm:"not null;default:'manual';index" json:"source"` // manual|ai|runtime|import
	ActorID         *uint  `gorm:"index" json:"actor_id,omitempty"`
	MetadataJSON    string `gorm:"type:text" json:"metadata_json"`
}

// WorkItem is execution/assignment/review state. It is deliberately not a
// content fact source: completing work does not mean an asset or video is used.
type WorkItem struct {
	gorm.Model
	ProjectID      uint        `gorm:"not null;index" json:"project_id"`
	ProductionID   *uint       `gorm:"index" json:"production_id,omitempty"`
	Production     *Production `gorm:"foreignKey:ProductionID" json:"production,omitempty"`
	TargetType     string      `gorm:"not null;index:idx_work_item_target" json:"target_type"` // segment|scene_moment|content_unit|creative_reference|creative_reference_state|asset_slot|keyframe|delivery_version
	TargetID       uint        `gorm:"not null;index:idx_work_item_target" json:"target_id"`
	Kind           string      `gorm:"not null;index" json:"kind"` // human|ai|hybrid|review|fix
	Title          string      `gorm:"not null" json:"title"`
	Description    string      `gorm:"type:text" json:"description"`
	Status         string      `gorm:"not null;default:'todo';index" json:"status"` // todo|running|blocked|review|done|cancelled
	Priority       string      `gorm:"not null;default:'normal';index" json:"priority"`
	AssigneeID     *uint       `gorm:"index" json:"assignee_id,omitempty"`
	Assignee       *User       `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	SourceJobID    *uint       `gorm:"index" json:"source_job_id,omitempty"`
	SourceCanvasID *uint       `gorm:"index" json:"source_canvas_id,omitempty"`
	MetadataJSON   string      `gorm:"type:text" json:"metadata_json"`
}

type WorkReview struct {
	gorm.Model
	ProjectID    uint      `gorm:"not null;index" json:"project_id"`
	WorkItemID   uint      `gorm:"not null;index" json:"work_item_id"`
	WorkItem     *WorkItem `gorm:"foreignKey:WorkItemID" json:"work_item,omitempty"`
	ReviewerID   *uint     `gorm:"index" json:"reviewer_id,omitempty"`
	Reviewer     *User     `gorm:"foreignKey:ReviewerID" json:"reviewer,omitempty"`
	Status       string    `gorm:"not null;default:'pending';index" json:"status"` // pending|approved|changes_requested|rejected
	Comment      string    `gorm:"type:text" json:"comment"`
	MetadataJSON string    `gorm:"type:text" json:"metadata_json"`
}

type WorkDependency struct {
	gorm.Model
	ProjectID           uint      `gorm:"not null;index" json:"project_id"`
	WorkItemID          uint      `gorm:"not null;index" json:"work_item_id"`
	WorkItem            *WorkItem `gorm:"foreignKey:WorkItemID" json:"work_item,omitempty"`
	DependsOnWorkItemID uint      `gorm:"not null;index" json:"depends_on_work_item_id"`
	DependsOnWorkItem   *WorkItem `gorm:"foreignKey:DependsOnWorkItemID" json:"depends_on_work_item,omitempty"`
	DependencyType      string    `gorm:"not null;default:'blocks';index" json:"dependency_type"`
}

type DeliveryVersion struct {
	gorm.Model
	ProjectID         uint             `gorm:"not null;index" json:"project_id"`
	ProductionID      *uint            `gorm:"index" json:"production_id,omitempty"`
	Production        *Production      `gorm:"foreignKey:ProductionID" json:"production,omitempty"`
	PreviewTimelineID *uint            `gorm:"index" json:"preview_timeline_id,omitempty"`
	PreviewTimeline   *PreviewTimeline `gorm:"foreignKey:PreviewTimelineID" json:"preview_timeline,omitempty"`
	Name              string           `gorm:"not null" json:"name"`
	Description       string           `gorm:"type:text" json:"description"`
	Status            string           `gorm:"not null;default:'draft';index" json:"status"` // draft|checking|approved|exported|archived
	IsPrimary         bool             `gorm:"default:false;index" json:"is_primary"`
	DurationSec       float64          `json:"duration_sec"`
	MetadataJSON      string           `gorm:"type:text" json:"metadata_json"`
}

type DeliveryTimelineItem struct {
	gorm.Model
	ProjectID         uint             `gorm:"not null;index" json:"project_id"`
	DeliveryVersionID uint             `gorm:"not null;index" json:"delivery_version_id"`
	DeliveryVersion   *DeliveryVersion `gorm:"foreignKey:DeliveryVersionID" json:"delivery_version,omitempty"`
	ContentUnitID     *uint            `gorm:"index" json:"content_unit_id,omitempty"`
	AssetSlotID       *uint            `gorm:"index" json:"asset_slot_id,omitempty"`
	ResourceID        *uint            `gorm:"index" json:"resource_id,omitempty"`
	Kind              string           `gorm:"not null;default:'video';index" json:"kind"` // video|image|audio|caption|gap
	Order             int              `gorm:"not null;default:0;index" json:"order"`
	StartSec          float64          `json:"start_sec"`
	DurationSec       float64          `json:"duration_sec"`
	Label             string           `json:"label"`
	Status            string           `gorm:"not null;default:'draft';index" json:"status"` // draft|missing|locked|approved
	MetadataJSON      string           `gorm:"type:text" json:"metadata_json"`
}

type ExportRecord struct {
	gorm.Model
	ProjectID         uint             `gorm:"not null;index" json:"project_id"`
	DeliveryVersionID uint             `gorm:"not null;index" json:"delivery_version_id"`
	DeliveryVersion   *DeliveryVersion `gorm:"foreignKey:DeliveryVersionID" json:"delivery_version,omitempty"`
	ResourceID        *uint            `gorm:"index" json:"resource_id,omitempty"`
	Status            string           `gorm:"not null;default:'pending';index" json:"status"` // pending|running|succeeded|failed
	Format            string           `json:"format"`
	Preset            string           `json:"preset"`
	Error             string           `gorm:"type:text" json:"error"`
	MetadataJSON      string           `gorm:"type:text" json:"metadata_json"`
}
