package model

import "gorm.io/gorm"

// AssetRequirement is the missing/candidate/locked bridge between creative
// meaning and actual assets. Assets should satisfy requirements instead of
// being direct children of creative references.
type AssetRequirement struct {
	gorm.Model
	ProjectID                uint                    `gorm:"not null;index" json:"project_id"`
	CreativeReferenceID      *uint                   `gorm:"index" json:"creative_reference_id,omitempty"`
	CreativeReference        *CreativeReference      `gorm:"foreignKey:CreativeReferenceID" json:"creative_reference,omitempty"`
	CreativeReferenceStateID *uint                   `gorm:"index" json:"creative_reference_state_id,omitempty"`
	CreativeReferenceState   *CreativeReferenceState `gorm:"foreignKey:CreativeReferenceStateID" json:"creative_reference_state,omitempty"`
	OwnerType                string                  `gorm:"index:idx_asset_requirement_owner" json:"owner_type"` // script_section|situation|content_unit|keyframe|creative_reference_state
	OwnerID                  *uint                   `gorm:"index:idx_asset_requirement_owner" json:"owner_id,omitempty"`
	Kind                     string                  `gorm:"not null;index" json:"kind"` // image|video|audio|text|brand_pack|reference
	Name                     string                  `gorm:"not null" json:"name"`
	Description              string                  `gorm:"type:text" json:"description"`
	RequiredSlot             string                  `json:"required_slot"` // front_half_body|prop_detail|environment|voice|logo
	PromptHint               string                  `gorm:"type:text" json:"prompt_hint"`
	Status                   string                  `gorm:"not null;default:'missing';index" json:"status"`  // missing|candidate|locked|waived
	Priority                 string                  `gorm:"not null;default:'normal';index" json:"priority"` // low|normal|high|critical
	LockedAssetID            *uint                   `gorm:"index" json:"locked_asset_id,omitempty"`
	LockedAsset              *Asset                  `gorm:"foreignKey:LockedAssetID" json:"locked_asset,omitempty"`
	MetadataJSON             string                  `gorm:"type:text" json:"metadata_json"`
}

type AssetRequirementCandidate struct {
	gorm.Model
	ProjectID          uint              `gorm:"not null;index" json:"project_id"`
	AssetRequirementID uint              `gorm:"not null;index" json:"asset_requirement_id"`
	AssetRequirement   *AssetRequirement `gorm:"foreignKey:AssetRequirementID" json:"asset_requirement,omitempty"`
	AssetID            uint              `gorm:"not null;index" json:"asset_id"`
	Asset              *Asset            `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
	SourceType         string            `gorm:"not null;default:'manual';index" json:"source_type"` // upload|job|canvas|manual|import
	SourceID           *uint             `json:"source_id,omitempty"`
	Score              float64           `json:"score"`
	Status             string            `gorm:"not null;default:'candidate';index" json:"status"` // candidate|selected|rejected
	Note               string            `gorm:"type:text" json:"note"`
}

// WorkItem is execution/assignment/review state. It is deliberately not a
// content fact source: completing work does not mean an asset or video is used.
type WorkItem struct {
	gorm.Model
	ProjectID      uint   `gorm:"not null;index" json:"project_id"`
	TargetType     string `gorm:"not null;index:idx_work_item_target" json:"target_type"` // script_section|situation|content_unit|creative_reference|creative_reference_state|asset_requirement|asset|keyframe|delivery_version
	TargetID       uint   `gorm:"not null;index:idx_work_item_target" json:"target_id"`
	Kind           string `gorm:"not null;index" json:"kind"` // human|ai|hybrid|review|fix
	Title          string `gorm:"not null" json:"title"`
	Description    string `gorm:"type:text" json:"description"`
	Status         string `gorm:"not null;default:'todo';index" json:"status"` // todo|running|blocked|review|done|cancelled
	Priority       string `gorm:"not null;default:'normal';index" json:"priority"`
	AssigneeID     *uint  `gorm:"index" json:"assignee_id,omitempty"`
	Assignee       *User  `gorm:"foreignKey:AssigneeID" json:"assignee,omitempty"`
	SourceJobID    *uint  `gorm:"index" json:"source_job_id,omitempty"`
	SourceCanvasID *uint  `gorm:"index" json:"source_canvas_id,omitempty"`
	MetadataJSON   string `gorm:"type:text" json:"metadata_json"`
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
	AssetID           *uint            `gorm:"index" json:"asset_id,omitempty"`
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
