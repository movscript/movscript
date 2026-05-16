package semantic

import (
	"strconv"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
)

type SegmentSpec struct {
	ProjectID       uint
	ProductionID    *uint
	TextBlockID     *uint
	ScriptBlockID   *uint
	ParentSegmentID *uint
	Kind            string
	Order           int
	Title           string
	Summary         string
	Content         string
	Status          string
	MetadataJSON    string
}

type Segment struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ProductionID    *uint     `json:"production_id,omitempty"`
	TextBlockID     *uint     `json:"text_block_id,omitempty"`
	ScriptBlockID   *uint     `json:"script_block_id,omitempty"`
	ParentSegmentID *uint     `json:"parent_segment_id,omitempty"`
	Kind            string    `json:"kind"`
	Order           int       `json:"order"`
	Title           string    `json:"title"`
	Summary         string    `json:"summary"`
	Content         string    `json:"content"`
	Status          string    `json:"status"`
	MetadataJSON    string    `json:"metadata_json"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type SegmentPatch struct {
	ProductionID    *uint
	TextBlockID     *uint
	ScriptBlockID   *uint
	ParentSegmentID *uint
	Kind            string
	Order           int
	Title           string
	Summary         string
	Content         string
	Status          string
	MetadataJSON    string
}

func NewSegment(spec SegmentSpec) Segment {
	return Segment{
		ProjectID:       spec.ProjectID,
		ProductionID:    spec.ProductionID,
		TextBlockID:     spec.TextBlockID,
		ScriptBlockID:   spec.ScriptBlockID,
		ParentSegmentID: spec.ParentSegmentID,
		Kind:            FallbackString(spec.Kind, "emotional_function"),
		Order:           spec.Order,
		Title:           spec.Title,
		Summary:         spec.Summary,
		Content:         spec.Content,
		Status:          SemanticDraftStatus(spec.Status),
		MetadataJSON:    spec.MetadataJSON,
	}
}

type ProductionTextBlockSpec struct {
	ProjectID     uint
	ProductionID  uint
	ParentBlockID *uint
	Kind          string
	Order         int
	Title         string
	Content       string
	Summary       string
	SourceType    string
	Status        string
	MetadataJSON  string
}

type ProductionTextBlock struct {
	ID            uint      `json:"ID"`
	ProjectID     uint      `json:"project_id"`
	ProductionID  uint      `json:"production_id"`
	ParentBlockID *uint     `json:"parent_block_id,omitempty"`
	Kind          string    `json:"kind"`
	Order         int       `json:"order"`
	Title         string    `json:"title"`
	Content       string    `json:"content"`
	Summary       string    `json:"summary"`
	SourceType    string    `json:"source_type"`
	Status        string    `json:"status"`
	MetadataJSON  string    `json:"metadata_json"`
	CreatedAt     time.Time `json:"CreatedAt"`
	UpdatedAt     time.Time `json:"UpdatedAt"`
}

type ProductionTextBlockPatch struct {
	ProductionID  *uint
	ParentBlockID *uint
	Kind          string
	Order         int
	Title         string
	Content       string
	Summary       string
	SourceType    string
	Status        string
	MetadataJSON  string
}

func NewProductionTextBlock(spec ProductionTextBlockSpec) ProductionTextBlock {
	return ProductionTextBlock{
		ProjectID:     spec.ProjectID,
		ProductionID:  spec.ProductionID,
		ParentBlockID: spec.ParentBlockID,
		Kind:          FallbackString(spec.Kind, "section"),
		Order:         spec.Order,
		Title:         spec.Title,
		Content:       spec.Content,
		Summary:       spec.Summary,
		SourceType:    FallbackString(spec.SourceType, "manual"),
		Status:        SemanticDraftStatus(spec.Status),
		MetadataJSON:  spec.MetadataJSON,
	}
}

type SceneMomentSpec struct {
	ProjectID     uint
	SegmentID     *uint
	ScriptBlockID *uint
	Order         int
	Title         string
	Description   string
	TimeText      string
	LocationText  string
	ConditionText string
	ActionText    string
	Mood          string
	Status        string
	MetadataJSON  string
}

type SceneMoment struct {
	ID            uint      `json:"ID"`
	ProjectID     uint      `json:"project_id"`
	SegmentID     *uint     `json:"segment_id,omitempty"`
	ScriptBlockID *uint     `json:"script_block_id,omitempty"`
	Order         int       `json:"order"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	TimeText      string    `json:"time_text"`
	LocationText  string    `json:"location_text"`
	ConditionText string    `json:"condition_text"`
	ActionText    string    `json:"action_text"`
	Mood          string    `json:"mood"`
	Status        string    `json:"status"`
	MetadataJSON  string    `json:"metadata_json"`
	CreatedAt     time.Time `json:"CreatedAt"`
	UpdatedAt     time.Time `json:"UpdatedAt"`
}

type SceneMomentPatch struct {
	SegmentID     *uint
	ScriptBlockID *uint
	Order         int
	Title         string
	Description   string
	TimeText      string
	LocationText  string
	ConditionText string
	ActionText    string
	Mood          string
	Status        string
	MetadataJSON  string
}

func NewSceneMoment(spec SceneMomentSpec) SceneMoment {
	return SceneMoment{
		ProjectID:     spec.ProjectID,
		SegmentID:     spec.SegmentID,
		ScriptBlockID: spec.ScriptBlockID,
		Order:         spec.Order,
		Title:         spec.Title,
		Description:   spec.Description,
		TimeText:      spec.TimeText,
		LocationText:  spec.LocationText,
		ConditionText: spec.ConditionText,
		ActionText:    spec.ActionText,
		Mood:          spec.Mood,
		Status:        SemanticDraftStatus(spec.Status),
		MetadataJSON:  spec.MetadataJSON,
	}
}

type ContentUnitSpec struct {
	ProjectID        uint
	ProductionID     *uint
	SegmentID        *uint
	SceneMomentID    *uint
	ScriptBlockID    *uint
	Kind             string
	Order            int
	Title            string
	Description      string
	Prompt           string
	DurationSec      float64
	ShotSize         string
	CameraAngle      string
	CameraHeight     string
	CameraMotion     string
	MotionIntensity  string
	CameraSpeed      string
	Lens             string
	FocalLength      string
	FocusSubject     string
	CompositionStart string
	CompositionEnd   string
	Stabilization    string
	CameraParamsJSON string
	CameraNotes      string
	Status           string
	MetadataJSON     string
}

type ContentUnit struct {
	ID               uint      `json:"ID"`
	ProjectID        uint      `json:"project_id"`
	ProductionID     *uint     `json:"production_id,omitempty"`
	SegmentID        *uint     `json:"segment_id,omitempty"`
	SceneMomentID    *uint     `json:"scene_moment_id,omitempty"`
	ScriptBlockID    *uint     `json:"script_block_id,omitempty"`
	Kind             string    `json:"kind"`
	Order            int       `json:"order"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	Prompt           string    `json:"prompt"`
	DurationSec      float64   `json:"duration_sec"`
	ShotSize         string    `json:"shot_size"`
	CameraAngle      string    `json:"camera_angle"`
	CameraHeight     string    `json:"camera_height"`
	CameraMotion     string    `json:"camera_motion"`
	MotionIntensity  string    `json:"motion_intensity"`
	CameraSpeed      string    `json:"camera_speed"`
	Lens             string    `json:"lens"`
	FocalLength      string    `json:"focal_length"`
	FocusSubject     string    `json:"focus_subject"`
	CompositionStart string    `json:"composition_start"`
	CompositionEnd   string    `json:"composition_end"`
	Stabilization    string    `json:"stabilization"`
	CameraParamsJSON string    `json:"camera_params_json"`
	CameraNotes      string    `json:"camera_notes"`
	Status           string    `json:"status"`
	MetadataJSON     string    `json:"metadata_json"`
	CreatedAt        time.Time `json:"CreatedAt"`
	UpdatedAt        time.Time `json:"UpdatedAt"`
}

type ContentUnitPatch struct {
	ProductionID     *uint
	SegmentID        *uint
	SceneMomentID    *uint
	ScriptBlockID    *uint
	Kind             string
	Order            int
	Title            string
	Description      string
	Prompt           string
	DurationSec      float64
	ShotSize         string
	CameraAngle      string
	CameraHeight     string
	CameraMotion     string
	MotionIntensity  string
	CameraSpeed      string
	Lens             string
	FocalLength      string
	FocusSubject     string
	CompositionStart string
	CompositionEnd   string
	Stabilization    string
	CameraParamsJSON string
	CameraNotes      string
	Status           string
	MetadataJSON     string
}

func NewContentUnit(spec ContentUnitSpec) ContentUnit {
	return ContentUnit{
		ProjectID:        spec.ProjectID,
		ProductionID:     spec.ProductionID,
		SegmentID:        spec.SegmentID,
		SceneMomentID:    spec.SceneMomentID,
		ScriptBlockID:    spec.ScriptBlockID,
		Kind:             FallbackString(spec.Kind, "shot"),
		Order:            spec.Order,
		Title:            spec.Title,
		Description:      spec.Description,
		Prompt:           spec.Prompt,
		DurationSec:      spec.DurationSec,
		ShotSize:         spec.ShotSize,
		CameraAngle:      spec.CameraAngle,
		CameraHeight:     spec.CameraHeight,
		CameraMotion:     spec.CameraMotion,
		MotionIntensity:  spec.MotionIntensity,
		CameraSpeed:      spec.CameraSpeed,
		Lens:             spec.Lens,
		FocalLength:      spec.FocalLength,
		FocusSubject:     spec.FocusSubject,
		CompositionStart: spec.CompositionStart,
		CompositionEnd:   spec.CompositionEnd,
		Stabilization:    spec.Stabilization,
		CameraParamsJSON: spec.CameraParamsJSON,
		CameraNotes:      spec.CameraNotes,
		Status:           SemanticDraftStatus(spec.Status),
		MetadataJSON:     spec.MetadataJSON,
	}
}

type PreviewTimelineItemSpec struct {
	ProjectID         uint
	PreviewTimelineID uint
	SegmentID         *uint
	SceneMomentID     *uint
	ContentUnitID     *uint
	KeyframeID        *uint
	Kind              string
	Order             int
	StartSec          float64
	DurationSec       float64
	Label             string
	Status            string
	MetadataJSON      string
}

type PreviewTimelineItem struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	PreviewTimelineID uint      `json:"preview_timeline_id"`
	SegmentID         *uint     `json:"segment_id,omitempty"`
	SceneMomentID     *uint     `json:"scene_moment_id,omitempty"`
	ContentUnitID     *uint     `json:"content_unit_id,omitempty"`
	KeyframeID        *uint     `json:"keyframe_id,omitempty"`
	Kind              string    `json:"kind"`
	Order             int       `json:"order"`
	StartSec          float64   `json:"start_sec"`
	DurationSec       float64   `json:"duration_sec"`
	Label             string    `json:"label"`
	Status            string    `json:"status"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type PreviewTimelineItemPatch struct {
	PreviewTimelineID uint
	SegmentID         *uint
	SceneMomentID     *uint
	ContentUnitID     *uint
	KeyframeID        *uint
	Kind              string
	Order             int
	StartSec          float64
	DurationSec       float64
	Label             string
	Status            string
	MetadataJSON      string
}

func NewPreviewTimelineItem(spec PreviewTimelineItemSpec) PreviewTimelineItem {
	return PreviewTimelineItem{
		ProjectID:         spec.ProjectID,
		PreviewTimelineID: spec.PreviewTimelineID,
		SegmentID:         spec.SegmentID,
		SceneMomentID:     spec.SceneMomentID,
		ContentUnitID:     spec.ContentUnitID,
		KeyframeID:        spec.KeyframeID,
		Kind:              FallbackString(spec.Kind, "keyframe"),
		Order:             spec.Order,
		StartSec:          spec.StartSec,
		DurationSec:       spec.DurationSec,
		Label:             spec.Label,
		Status:            SemanticDraftStatus(spec.Status),
		MetadataJSON:      spec.MetadataJSON,
	}
}

type AssetSlotSpec struct {
	ProjectID                uint
	ProductionID             *uint
	CreativeReferenceID      *uint
	CreativeReferenceStateID *uint
	OwnerType                string
	OwnerID                  *uint
	Kind                     string
	Name                     string
	Description              string
	SlotKey                  string
	PromptHint               string
	Status                   string
	Priority                 string
	ResourceID               *uint
	LockedAssetSlotID        *uint
	MetadataJSON             string
}

type AssetSlot struct {
	ID                       uint                        `json:"ID"`
	ProjectID                uint                        `json:"project_id"`
	ProductionID             *uint                       `json:"production_id,omitempty"`
	CreativeReferenceID      *uint                       `json:"creative_reference_id,omitempty"`
	CreativeReferenceStateID *uint                       `json:"creative_reference_state_id,omitempty"`
	OwnerType                string                      `json:"owner_type"`
	OwnerID                  *uint                       `json:"owner_id,omitempty"`
	Kind                     string                      `json:"kind"`
	Name                     string                      `json:"name"`
	Description              string                      `json:"description"`
	SlotKey                  string                      `json:"slot_key"`
	PromptHint               string                      `json:"prompt_hint"`
	Status                   string                      `json:"status"`
	Priority                 string                      `json:"priority"`
	ResourceID               *uint                       `json:"resource_id,omitempty"`
	Resource                 *domainresource.RawResource `json:"resource,omitempty"`
	LockedAssetSlotID        *uint                       `json:"locked_asset_slot_id,omitempty"`
	LockedAssetSlot          *AssetSlot                  `json:"locked_asset_slot,omitempty"`
	MetadataJSON             string                      `json:"metadata_json"`
	CreatedAt                time.Time                   `json:"CreatedAt"`
	UpdatedAt                time.Time                   `json:"UpdatedAt"`
}

type AssetSlotPatch struct {
	ProductionID             *uint
	CreativeReferenceID      *uint
	CreativeReferenceStateID *uint
	OwnerType                string
	OwnerID                  *uint
	Kind                     string
	Name                     string
	Description              string
	SlotKey                  string
	PromptHint               string
	Status                   string
	Priority                 string
	ResourceID               *uint
	LockedAssetSlotID        *uint
	MetadataJSON             string
}

func NewAssetSlot(spec AssetSlotSpec) AssetSlot {
	return AssetSlot{
		ProjectID:                spec.ProjectID,
		ProductionID:             spec.ProductionID,
		CreativeReferenceID:      spec.CreativeReferenceID,
		CreativeReferenceStateID: spec.CreativeReferenceStateID,
		OwnerType:                spec.OwnerType,
		OwnerID:                  spec.OwnerID,
		Kind:                     FallbackString(spec.Kind, "image"),
		Name:                     spec.Name,
		Description:              spec.Description,
		SlotKey:                  spec.SlotKey,
		PromptHint:               spec.PromptHint,
		Status:                   FallbackString(spec.Status, AssetSlotStatusMissing),
		Priority:                 FallbackString(spec.Priority, "normal"),
		ResourceID:               spec.ResourceID,
		LockedAssetSlotID:        spec.LockedAssetSlotID,
		MetadataJSON:             spec.MetadataJSON,
	}
}

type AssetSlotCandidateSpec struct {
	ProjectID            uint
	AssetSlotID          uint
	CandidateAssetSlotID uint
	SourceType           string
	SourceID             *uint
	Score                float64
	Status               string
	Note                 string
}

type AssetSlotCandidate struct {
	ID                   uint       `json:"ID"`
	ProjectID            uint       `json:"project_id"`
	AssetSlotID          uint       `json:"asset_slot_id"`
	CandidateAssetSlotID uint       `json:"candidate_asset_slot_id"`
	CandidateAssetSlot   *AssetSlot `json:"candidate_asset_slot,omitempty"`
	SourceType           string     `json:"source_type"`
	SourceID             *uint      `json:"source_id,omitempty"`
	Score                float64    `json:"score"`
	Status               string     `json:"status"`
	Note                 string     `json:"note"`
	CreatedAt            time.Time  `json:"CreatedAt"`
	UpdatedAt            time.Time  `json:"UpdatedAt"`
}

type AssetSlotCandidatePatch struct {
	AssetSlotID          uint
	CandidateAssetSlotID uint
	SourceType           string
	SourceID             *uint
	Score                float64
	Status               string
	Note                 string
}

func NewAssetSlotCandidate(spec AssetSlotCandidateSpec) AssetSlotCandidate {
	return AssetSlotCandidate{
		ProjectID:            spec.ProjectID,
		AssetSlotID:          spec.AssetSlotID,
		CandidateAssetSlotID: spec.CandidateAssetSlotID,
		SourceType:           FallbackString(spec.SourceType, CandidateDecisionSourceManual),
		SourceID:             spec.SourceID,
		Score:                spec.Score,
		Status:               FallbackString(spec.Status, AssetSlotCandidateStatusCandidate),
		Note:                 spec.Note,
	}
}

type CandidateDecisionSpec struct {
	ProjectID         uint
	CandidateType     string
	CandidateID       *uint
	CandidateClientID string
	TargetType        string
	TargetID          *uint
	Decision          string
	Status            string
	Reason            string
	Note              string
	Source            string
	DecidedByID       *uint
	AppliedAt         string
	MetadataJSON      string
}

type CandidateDecision struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	CandidateType     string    `json:"candidate_type"`
	CandidateID       *uint     `json:"candidate_id,omitempty"`
	CandidateClientID string    `json:"candidate_client_id"`
	TargetType        string    `json:"target_type"`
	TargetID          *uint     `json:"target_id,omitempty"`
	Decision          string    `json:"decision"`
	Status            string    `json:"status"`
	Reason            string    `json:"reason"`
	Note              string    `json:"note"`
	Source            string    `json:"source"`
	DecidedByID       *uint     `json:"decided_by_id,omitempty"`
	AppliedAt         string    `json:"applied_at"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type CandidateDecisionPatch struct {
	CandidateType     string
	CandidateID       *uint
	CandidateClientID string
	TargetType        string
	TargetID          *uint
	Decision          string
	Status            string
	Reason            string
	Note              string
	Source            string
	DecidedByID       *uint
	AppliedAt         string
	MetadataJSON      string
}

func NewCandidateDecision(spec CandidateDecisionSpec) CandidateDecision {
	return CandidateDecision{
		ProjectID:         spec.ProjectID,
		CandidateType:     spec.CandidateType,
		CandidateID:       spec.CandidateID,
		CandidateClientID: spec.CandidateClientID,
		TargetType:        spec.TargetType,
		TargetID:          spec.TargetID,
		Decision:          spec.Decision,
		Status:            FallbackString(spec.Status, "recorded"),
		Reason:            spec.Reason,
		Note:              spec.Note,
		Source:            FallbackString(spec.Source, CandidateDecisionSourceManual),
		DecidedByID:       spec.DecidedByID,
		AppliedAt:         spec.AppliedAt,
		MetadataJSON:      spec.MetadataJSON,
	}
}

type ReviewEventSpec struct {
	ProjectID       uint
	SubjectType     string
	SubjectID       *uint
	SubjectClientID string
	EventType       string
	FromStatus      string
	ToStatus        string
	Comment         string
	Reason          string
	Source          string
	ActorID         *uint
	MetadataJSON    string
}

type ReviewEvent struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	SubjectType     string    `json:"subject_type"`
	SubjectID       *uint     `json:"subject_id,omitempty"`
	SubjectClientID string    `json:"subject_client_id"`
	EventType       string    `json:"event_type"`
	FromStatus      string    `json:"from_status"`
	ToStatus        string    `json:"to_status"`
	Comment         string    `json:"comment"`
	Reason          string    `json:"reason"`
	Source          string    `json:"source"`
	ActorID         *uint     `json:"actor_id,omitempty"`
	MetadataJSON    string    `json:"metadata_json"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type ReviewEventPatch struct {
	SubjectType     string
	SubjectID       *uint
	SubjectClientID string
	EventType       string
	FromStatus      string
	ToStatus        string
	Comment         string
	Reason          string
	Source          string
	ActorID         *uint
	MetadataJSON    string
}

func NewReviewEvent(spec ReviewEventSpec) ReviewEvent {
	return ReviewEvent{
		ProjectID:       spec.ProjectID,
		SubjectType:     spec.SubjectType,
		SubjectID:       spec.SubjectID,
		SubjectClientID: spec.SubjectClientID,
		EventType:       spec.EventType,
		FromStatus:      spec.FromStatus,
		ToStatus:        spec.ToStatus,
		Comment:         spec.Comment,
		Reason:          spec.Reason,
		Source:          FallbackString(spec.Source, ReviewEventSourceManual),
		ActorID:         spec.ActorID,
		MetadataJSON:    spec.MetadataJSON,
	}
}

type ExportRecordSpec struct {
	ProjectID         uint
	DeliveryVersionID uint
	ResourceID        *uint
	Status            string
	Format            string
	Preset            string
	Error             string
	MetadataJSON      string
}

type ExportRecord struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	DeliveryVersionID uint      `json:"delivery_version_id"`
	ResourceID        *uint     `json:"resource_id,omitempty"`
	Status            string    `json:"status"`
	Format            string    `json:"format"`
	Preset            string    `json:"preset"`
	Error             string    `json:"error"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type ExportRecordPatch struct {
	DeliveryVersionID uint
	ResourceID        *uint
	Status            string
	Format            string
	Preset            string
	Error             string
	MetadataJSON      string
}

func NewExportRecord(spec ExportRecordSpec) ExportRecord {
	return ExportRecord{
		ProjectID:         spec.ProjectID,
		DeliveryVersionID: spec.DeliveryVersionID,
		ResourceID:        spec.ResourceID,
		Status:            FallbackString(spec.Status, "pending"),
		Format:            spec.Format,
		Preset:            spec.Preset,
		Error:             spec.Error,
		MetadataJSON:      spec.MetadataJSON,
	}
}

type CanvasOutputSpec struct {
	ProjectID    uint
	CanvasID     uint
	CanvasRunID  *uint
	CanvasNodeID string
	PortID       string
	OwnerType    string
	OwnerID      uint
	OutputType   string
	ResourceID   *uint
	TargetField  string
	ValueJSON    string
	Status       string
	MetadataJSON string
}

type CanvasOutput struct {
	ID           uint      `json:"ID"`
	ProjectID    uint      `json:"project_id"`
	CanvasID     uint      `json:"canvas_id"`
	CanvasRunID  *uint     `json:"canvas_run_id,omitempty"`
	CanvasNodeID string    `json:"canvas_node_id"`
	PortID       string    `json:"port_id"`
	OwnerType    string    `json:"owner_type"`
	OwnerID      uint      `json:"owner_id"`
	OutputType   string    `json:"output_type"`
	ResourceID   *uint     `json:"resource_id,omitempty"`
	TargetField  string    `json:"target_field"`
	ValueJSON    string    `json:"value_json"`
	Status       string    `json:"status"`
	MetadataJSON string    `json:"metadata_json"`
	CreatedAt    time.Time `json:"CreatedAt"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
}

type CanvasOutputPatch struct {
	CanvasID     uint
	CanvasRunID  *uint
	CanvasNodeID string
	PortID       string
	OwnerType    string
	OwnerID      uint
	OutputType   string
	ResourceID   *uint
	TargetField  string
	ValueJSON    string
	Status       string
	MetadataJSON string
}

func NewCanvasOutput(spec CanvasOutputSpec) CanvasOutput {
	return CanvasOutput{
		ProjectID:    spec.ProjectID,
		CanvasID:     spec.CanvasID,
		CanvasRunID:  spec.CanvasRunID,
		CanvasNodeID: spec.CanvasNodeID,
		PortID:       spec.PortID,
		OwnerType:    spec.OwnerType,
		OwnerID:      spec.OwnerID,
		OutputType:   FallbackString(spec.OutputType, "resource"),
		ResourceID:   spec.ResourceID,
		TargetField:  spec.TargetField,
		ValueJSON:    spec.ValueJSON,
		Status:       FallbackString(spec.Status, "pending"),
		MetadataJSON: spec.MetadataJSON,
	}
}

type WorkReviewSpec struct {
	ProjectID    uint
	WorkItemID   uint
	ReviewerID   *uint
	Status       string
	Comment      string
	MetadataJSON string
}

type WorkReview struct {
	ID           uint      `json:"ID"`
	ProjectID    uint      `json:"project_id"`
	WorkItemID   uint      `json:"work_item_id"`
	ReviewerID   *uint     `json:"reviewer_id,omitempty"`
	Reviewer     *UserRef  `json:"reviewer,omitempty"`
	Status       string    `json:"status"`
	Comment      string    `json:"comment"`
	MetadataJSON string    `json:"metadata_json"`
	CreatedAt    time.Time `json:"CreatedAt"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
}

type WorkReviewPatch struct {
	WorkItemID   uint
	ReviewerID   *uint
	Status       string
	Comment      string
	MetadataJSON string
}

func NewWorkReview(spec WorkReviewSpec) WorkReview {
	return WorkReview{
		ProjectID:    spec.ProjectID,
		WorkItemID:   spec.WorkItemID,
		ReviewerID:   spec.ReviewerID,
		Status:       FallbackString(spec.Status, WorkItemApplyStatusPending),
		Comment:      spec.Comment,
		MetadataJSON: spec.MetadataJSON,
	}
}

type StoryboardScriptSpec struct {
	ProjectID       uint
	ScriptVersionID *uint
	Name            string
	Description     string
	Status          string
	IsPrimary       bool
	MetadataJSON    string
}

type StoryboardScript struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ScriptVersionID *uint     `json:"script_version_id,omitempty"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	Status          string    `json:"status"`
	IsPrimary       bool      `json:"is_primary"`
	MetadataJSON    string    `json:"metadata_json"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type StoryboardScriptPatch struct {
	ScriptVersionID *uint
	Name            string
	Description     string
	Status          string
	IsPrimary       bool
	MetadataJSON    string
}

func NewStoryboardScript(spec StoryboardScriptSpec) StoryboardScript {
	return StoryboardScript{
		ProjectID:       spec.ProjectID,
		ScriptVersionID: spec.ScriptVersionID,
		Name:            FallbackString(spec.Name, "Storyboard Script"),
		Description:     spec.Description,
		Status:          SemanticDraftStatus(spec.Status),
		IsPrimary:       spec.IsPrimary,
		MetadataJSON:    spec.MetadataJSON,
	}
}

type StoryboardVersionSpec struct {
	ProjectID          uint
	StoryboardScriptID uint
	ParentVersionID    *uint
	VersionNumber      int
	Title              string
	Source             string
	Status             string
	SnapshotJSON       string
	MetadataJSON       string
}

type StoryboardVersion struct {
	ID                 uint      `json:"ID"`
	ProjectID          uint      `json:"project_id"`
	StoryboardScriptID uint      `json:"storyboard_script_id"`
	ParentVersionID    *uint     `json:"parent_version_id,omitempty"`
	VersionNumber      int       `json:"version_number"`
	Title              string    `json:"title"`
	Source             string    `json:"source"`
	Status             string    `json:"status"`
	SnapshotJSON       string    `json:"snapshot_json"`
	MetadataJSON       string    `json:"metadata_json"`
	CreatedAt          time.Time `json:"CreatedAt"`
	UpdatedAt          time.Time `json:"UpdatedAt"`
}

func NewStoryboardVersion(spec StoryboardVersionSpec) StoryboardVersion {
	return StoryboardVersion{
		ProjectID:          spec.ProjectID,
		StoryboardScriptID: spec.StoryboardScriptID,
		ParentVersionID:    spec.ParentVersionID,
		VersionNumber:      spec.VersionNumber,
		Title:              FallbackString(spec.Title, "Storyboard v"+strconv.Itoa(spec.VersionNumber)),
		Source:             FallbackString(spec.Source, CandidateDecisionSourceManual),
		Status:             SemanticDraftStatus(spec.Status),
		SnapshotJSON:       spec.SnapshotJSON,
		MetadataJSON:       spec.MetadataJSON,
	}
}

type CreativeReferenceSpec struct {
	ProjectID        uint
	SourceScriptID   *uint
	SourceAnalysisID *uint
	Kind             string
	Name             string
	Alias            string
	Description      string
	Content          string
	Importance       string
	Status           string
	ProfileJSON      string
	TagsJSON         string
}

type CreativeReference struct {
	ID               uint      `json:"ID"`
	ProjectID        uint      `json:"project_id"`
	SourceScriptID   *uint     `json:"source_script_id,omitempty"`
	SourceAnalysisID *uint     `json:"source_analysis_id,omitempty"`
	Kind             string    `json:"kind"`
	Name             string    `json:"name"`
	Alias            string    `json:"alias"`
	Description      string    `json:"description"`
	Content          string    `json:"content"`
	Importance       string    `json:"importance"`
	Status           string    `json:"status"`
	ProfileJSON      string    `json:"profile_json"`
	TagsJSON         string    `json:"tags_json"`
	CreatedAt        time.Time `json:"CreatedAt"`
	UpdatedAt        time.Time `json:"UpdatedAt"`
}

type CreativeReferencePatch struct {
	SourceScriptID   *uint
	SourceAnalysisID *uint
	Kind             string
	Name             string
	Alias            string
	Description      string
	Content          string
	Importance       string
	Status           string
	ProfileJSON      string
	TagsJSON         string
}

func NewCreativeReference(spec CreativeReferenceSpec) CreativeReference {
	return CreativeReference{
		ProjectID:        spec.ProjectID,
		SourceScriptID:   spec.SourceScriptID,
		SourceAnalysisID: spec.SourceAnalysisID,
		Kind:             FallbackString(spec.Kind, "character"),
		Name:             spec.Name,
		Alias:            spec.Alias,
		Description:      spec.Description,
		Content:          spec.Content,
		Importance:       FallbackString(spec.Importance, "supporting"),
		Status:           SemanticDraftStatus(spec.Status),
		ProfileJSON:      spec.ProfileJSON,
		TagsJSON:         spec.TagsJSON,
	}
}

type CreativeReferenceStateSpec struct {
	ProjectID           uint
	CreativeReferenceID uint
	ScopeType           string
	ScopeID             *uint
	Name                string
	Description         string
	VisualNotes         string
	Emotion             string
	Costume             string
	Props               string
	Status              string
	TagsJSON            string
	MetadataJSON        string
}

type CreativeReferenceState struct {
	ID                  uint      `json:"ID"`
	ProjectID           uint      `json:"project_id"`
	CreativeReferenceID uint      `json:"creative_reference_id"`
	ScopeType           string    `json:"scope_type"`
	ScopeID             *uint     `json:"scope_id,omitempty"`
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	VisualNotes         string    `json:"visual_notes"`
	Emotion             string    `json:"emotion"`
	Costume             string    `json:"costume"`
	Props               string    `json:"props"`
	Status              string    `json:"status"`
	TagsJSON            string    `json:"tags_json"`
	MetadataJSON        string    `json:"metadata_json"`
	CreatedAt           time.Time `json:"CreatedAt"`
	UpdatedAt           time.Time `json:"UpdatedAt"`
}

type CreativeReferenceStatePatch struct {
	CreativeReferenceID uint
	ScopeType           string
	ScopeID             *uint
	Name                string
	Description         string
	VisualNotes         string
	Emotion             string
	Costume             string
	Props               string
	Status              string
	TagsJSON            string
	MetadataJSON        string
}

func NewCreativeReferenceState(spec CreativeReferenceStateSpec) CreativeReferenceState {
	return CreativeReferenceState{
		ProjectID:           spec.ProjectID,
		CreativeReferenceID: spec.CreativeReferenceID,
		ScopeType:           spec.ScopeType,
		ScopeID:             spec.ScopeID,
		Name:                spec.Name,
		Description:         spec.Description,
		VisualNotes:         spec.VisualNotes,
		Emotion:             spec.Emotion,
		Costume:             spec.Costume,
		Props:               spec.Props,
		Status:              SemanticDraftStatus(spec.Status),
		TagsJSON:            spec.TagsJSON,
		MetadataJSON:        spec.MetadataJSON,
	}
}

type CreativeReferenceUsageSpec struct {
	ProjectID                uint
	OwnerType                string
	OwnerID                  uint
	CreativeReferenceID      uint
	CreativeReferenceStateID *uint
	Role                     string
	Order                    int
	Evidence                 string
	Source                   string
	Status                   string
	MetadataJSON             string
}

type CreativeReferenceUsage struct {
	ID                       uint      `json:"ID"`
	ProjectID                uint      `json:"project_id"`
	OwnerType                string    `json:"owner_type"`
	OwnerID                  uint      `json:"owner_id"`
	CreativeReferenceID      uint      `json:"creative_reference_id"`
	CreativeReferenceStateID *uint     `json:"creative_reference_state_id,omitempty"`
	Role                     string    `json:"role"`
	Order                    int       `json:"order"`
	Evidence                 string    `json:"evidence"`
	Source                   string    `json:"source"`
	Status                   string    `json:"status"`
	MetadataJSON             string    `json:"metadata_json"`
	CreatedAt                time.Time `json:"CreatedAt"`
	UpdatedAt                time.Time `json:"UpdatedAt"`
}

type CreativeReferenceUsagePatch struct {
	OwnerType                string
	OwnerID                  uint
	CreativeReferenceID      uint
	CreativeReferenceStateID *uint
	Role                     string
	Order                    int
	Evidence                 string
	Source                   string
	Status                   string
	MetadataJSON             string
}

func NewCreativeReferenceUsage(spec CreativeReferenceUsageSpec) CreativeReferenceUsage {
	return CreativeReferenceUsage{
		ProjectID:                spec.ProjectID,
		OwnerType:                spec.OwnerType,
		OwnerID:                  spec.OwnerID,
		CreativeReferenceID:      spec.CreativeReferenceID,
		CreativeReferenceStateID: spec.CreativeReferenceStateID,
		Role:                     spec.Role,
		Order:                    spec.Order,
		Evidence:                 spec.Evidence,
		Source:                   FallbackString(spec.Source, CandidateDecisionSourceManual),
		Status:                   SemanticDraftStatus(spec.Status),
		MetadataJSON:             spec.MetadataJSON,
	}
}

type CreativeRelationshipSpec struct {
	ProjectID                 uint
	SourceCreativeReferenceID uint
	TargetCreativeReferenceID uint
	ScopeType                 string
	ScopeID                   *uint
	Category                  string
	Type                      string
	Label                     string
	Description               string
	Source                    string
	Status                    string
	Evidence                  string
	MetadataJSON              string
}

type CreativeRelationship struct {
	ID                        uint      `json:"ID"`
	ProjectID                 uint      `json:"project_id"`
	SourceCreativeReferenceID uint      `json:"source_creative_reference_id"`
	TargetCreativeReferenceID uint      `json:"target_creative_reference_id"`
	ScopeType                 string    `json:"scope_type"`
	ScopeID                   *uint     `json:"scope_id,omitempty"`
	Category                  string    `json:"category"`
	Type                      string    `json:"type"`
	Label                     string    `json:"label"`
	Description               string    `json:"description"`
	Source                    string    `json:"source"`
	Status                    string    `json:"status"`
	Evidence                  string    `json:"evidence"`
	MetadataJSON              string    `json:"metadata_json"`
	CreatedAt                 time.Time `json:"CreatedAt"`
	UpdatedAt                 time.Time `json:"UpdatedAt"`
}

type CreativeRelationshipPatch struct {
	SourceCreativeReferenceID uint
	TargetCreativeReferenceID uint
	ScopeType                 string
	ScopeID                   *uint
	Category                  string
	Type                      string
	Label                     string
	Description               string
	Source                    string
	Status                    string
	Evidence                  string
	MetadataJSON              string
}

func NewCreativeRelationship(spec CreativeRelationshipSpec) CreativeRelationship {
	return CreativeRelationship{
		ProjectID:                 spec.ProjectID,
		SourceCreativeReferenceID: spec.SourceCreativeReferenceID,
		TargetCreativeReferenceID: spec.TargetCreativeReferenceID,
		ScopeType:                 spec.ScopeType,
		ScopeID:                   spec.ScopeID,
		Category:                  FallbackString(spec.Category, "relationship"),
		Type:                      spec.Type,
		Label:                     spec.Label,
		Description:               spec.Description,
		Source:                    FallbackString(spec.Source, CandidateDecisionSourceManual),
		Status:                    SemanticDraftStatus(spec.Status),
		Evidence:                  spec.Evidence,
		MetadataJSON:              spec.MetadataJSON,
	}
}

type ProductionSpec struct {
	ProjectID         uint
	ScriptVersionID   *uint
	PreviewTimelineID *uint
	Name              string
	Description       string
	Status            string
	SourceType        string
	OwnerLabel        string
	Progress          int
	MetadataJSON      string
}

type Production struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	ScriptVersionID   *uint     `json:"script_version_id,omitempty"`
	PreviewTimelineID *uint     `json:"preview_timeline_id,omitempty"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	Status            string    `json:"status"`
	SourceType        string    `json:"source_type"`
	OwnerLabel        string    `json:"owner_label"`
	Progress          int       `json:"progress"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type ProductionPatch struct {
	ScriptVersionID   *uint
	PreviewTimelineID *uint
	Name              string
	Description       string
	Status            string
	SourceType        string
	OwnerLabel        string
	Progress          int
	MetadataJSON      string
}

func NewProduction(spec ProductionSpec) Production {
	return Production{
		ProjectID:         spec.ProjectID,
		ScriptVersionID:   spec.ScriptVersionID,
		PreviewTimelineID: spec.PreviewTimelineID,
		Name:              FallbackString(spec.Name, "未命名制作"),
		Description:       spec.Description,
		Status:            FallbackString(spec.Status, "planning"),
		SourceType:        FallbackString(spec.SourceType, "direct"),
		OwnerLabel:        FallbackString(spec.OwnerLabel, "导演组"),
		Progress:          spec.Progress,
		MetadataJSON:      spec.MetadataJSON,
	}
}

type KeyframeSpec struct {
	ProjectID     uint
	ProductionID  *uint
	SceneMomentID *uint
	ContentUnitID *uint
	ResourceID    *uint
	CanvasID      *uint
	Title         string
	Description   string
	Prompt        string
	Order         int
	Status        string
	MetadataJSON  string
}

type Keyframe struct {
	ID            uint                        `json:"ID"`
	ProjectID     uint                        `json:"project_id"`
	ProductionID  *uint                       `json:"production_id,omitempty"`
	SceneMomentID *uint                       `json:"scene_moment_id,omitempty"`
	ContentUnitID *uint                       `json:"content_unit_id,omitempty"`
	ResourceID    *uint                       `json:"resource_id,omitempty"`
	Resource      *domainresource.RawResource `json:"resource,omitempty"`
	CanvasID      *uint                       `json:"canvas_id,omitempty"`
	Title         string                      `json:"title"`
	Description   string                      `json:"description"`
	Prompt        string                      `json:"prompt"`
	Order         int                         `json:"order"`
	Status        string                      `json:"status"`
	MetadataJSON  string                      `json:"metadata_json"`
	CreatedAt     time.Time                   `json:"CreatedAt"`
	UpdatedAt     time.Time                   `json:"UpdatedAt"`
}

type KeyframePatch struct {
	ProductionID  *uint
	SceneMomentID *uint
	ContentUnitID *uint
	ResourceID    *uint
	CanvasID      *uint
	Title         string
	Description   string
	Prompt        string
	Order         int
	Status        string
	MetadataJSON  string
}

func NewKeyframe(spec KeyframeSpec) Keyframe {
	return Keyframe{
		ProjectID:     spec.ProjectID,
		ProductionID:  spec.ProductionID,
		SceneMomentID: spec.SceneMomentID,
		ContentUnitID: spec.ContentUnitID,
		ResourceID:    spec.ResourceID,
		CanvasID:      spec.CanvasID,
		Title:         spec.Title,
		Description:   spec.Description,
		Prompt:        spec.Prompt,
		Order:         spec.Order,
		Status:        FallbackString(spec.Status, "generated"),
		MetadataJSON:  spec.MetadataJSON,
	}
}

type PreviewTimelineSpec struct {
	ProjectID       uint
	ProductionID    *uint
	ScriptVersionID *uint
	Name            string
	Status          string
	DurationSec     float64
	IsPrimary       bool
	MetadataJSON    string
}

type PreviewTimeline struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ProductionID    *uint     `json:"production_id,omitempty"`
	ScriptVersionID *uint     `json:"script_version_id,omitempty"`
	Name            string    `json:"name"`
	Status          string    `json:"status"`
	DurationSec     float64   `json:"duration_sec"`
	IsPrimary       bool      `json:"is_primary"`
	MetadataJSON    string    `json:"metadata_json"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type PreviewTimelinePatch struct {
	ProductionID    *uint
	ScriptVersionID *uint
	Name            string
	Status          string
	DurationSec     float64
	IsPrimary       bool
	MetadataJSON    string
}

func NewPreviewTimeline(spec PreviewTimelineSpec) PreviewTimeline {
	return PreviewTimeline{
		ProjectID:       spec.ProjectID,
		ProductionID:    spec.ProductionID,
		ScriptVersionID: spec.ScriptVersionID,
		Name:            FallbackString(spec.Name, "Preview"),
		Status:          SemanticDraftStatus(spec.Status),
		DurationSec:     spec.DurationSec,
		IsPrimary:       spec.IsPrimary,
		MetadataJSON:    spec.MetadataJSON,
	}
}

type DeliveryVersionSpec struct {
	ProjectID         uint
	ProductionID      *uint
	PreviewTimelineID *uint
	Name              string
	Description       string
	Status            string
	IsPrimary         bool
	DurationSec       float64
	MetadataJSON      string
}

type DeliveryVersion struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	ProductionID      *uint     `json:"production_id,omitempty"`
	PreviewTimelineID *uint     `json:"preview_timeline_id,omitempty"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	Status            string    `json:"status"`
	IsPrimary         bool      `json:"is_primary"`
	DurationSec       float64   `json:"duration_sec"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type DeliveryVersionPatch struct {
	ProductionID      *uint
	PreviewTimelineID *uint
	Name              string
	Description       string
	Status            string
	IsPrimary         bool
	DurationSec       float64
	MetadataJSON      string
}

func NewDeliveryVersion(spec DeliveryVersionSpec) DeliveryVersion {
	return DeliveryVersion{
		ProjectID:         spec.ProjectID,
		ProductionID:      spec.ProductionID,
		PreviewTimelineID: spec.PreviewTimelineID,
		Name:              FallbackString(spec.Name, "Delivery"),
		Description:       spec.Description,
		Status:            SemanticDraftStatus(spec.Status),
		IsPrimary:         spec.IsPrimary,
		DurationSec:       spec.DurationSec,
		MetadataJSON:      spec.MetadataJSON,
	}
}

type DeliveryTimelineItemSpec struct {
	ProjectID         uint
	DeliveryVersionID uint
	ContentUnitID     *uint
	AssetSlotID       *uint
	ResourceID        *uint
	Kind              string
	Order             int
	StartSec          float64
	DurationSec       float64
	Label             string
	Status            string
	MetadataJSON      string
}

type DeliveryTimelineItem struct {
	ID                uint      `json:"ID"`
	ProjectID         uint      `json:"project_id"`
	DeliveryVersionID uint      `json:"delivery_version_id"`
	ContentUnitID     *uint     `json:"content_unit_id,omitempty"`
	AssetSlotID       *uint     `json:"asset_slot_id,omitempty"`
	ResourceID        *uint     `json:"resource_id,omitempty"`
	Kind              string    `json:"kind"`
	Order             int       `json:"order"`
	StartSec          float64   `json:"start_sec"`
	DurationSec       float64   `json:"duration_sec"`
	Label             string    `json:"label"`
	Status            string    `json:"status"`
	MetadataJSON      string    `json:"metadata_json"`
	CreatedAt         time.Time `json:"CreatedAt"`
	UpdatedAt         time.Time `json:"UpdatedAt"`
}

type DeliveryTimelineItemPatch struct {
	DeliveryVersionID uint
	ContentUnitID     *uint
	AssetSlotID       *uint
	ResourceID        *uint
	Kind              string
	Order             int
	StartSec          float64
	DurationSec       float64
	Label             string
	Status            string
	MetadataJSON      string
}

func NewDeliveryTimelineItem(spec DeliveryTimelineItemSpec) DeliveryTimelineItem {
	return DeliveryTimelineItem{
		ProjectID:         spec.ProjectID,
		DeliveryVersionID: spec.DeliveryVersionID,
		ContentUnitID:     spec.ContentUnitID,
		AssetSlotID:       spec.AssetSlotID,
		ResourceID:        spec.ResourceID,
		Kind:              FallbackString(spec.Kind, "video"),
		Order:             spec.Order,
		StartSec:          spec.StartSec,
		DurationSec:       spec.DurationSec,
		Label:             spec.Label,
		Status:            SemanticDraftStatus(spec.Status),
		MetadataJSON:      spec.MetadataJSON,
	}
}

type WorkDependencySpec struct {
	ProjectID           uint
	WorkItemID          uint
	DependsOnWorkItemID uint
	DependencyType      string
}

type WorkDependency struct {
	ID                  uint      `json:"ID"`
	ProjectID           uint      `json:"project_id"`
	WorkItemID          uint      `json:"work_item_id"`
	DependsOnWorkItemID uint      `json:"depends_on_work_item_id"`
	DependencyType      string    `json:"dependency_type"`
	CreatedAt           time.Time `json:"CreatedAt"`
	UpdatedAt           time.Time `json:"UpdatedAt"`
}

type WorkDependencyPatch struct {
	WorkItemID          uint
	DependsOnWorkItemID uint
	DependencyType      string
}

func NewWorkDependency(spec WorkDependencySpec) WorkDependency {
	return WorkDependency{
		ProjectID:           spec.ProjectID,
		WorkItemID:          spec.WorkItemID,
		DependsOnWorkItemID: spec.DependsOnWorkItemID,
		DependencyType:      FallbackString(spec.DependencyType, "blocks"),
	}
}

type ScriptVersionSpec struct {
	ProjectID         uint
	ScriptID          uint
	ParentVersionID   *uint
	VersionNumber     int
	Title             string
	FallbackTitle     string
	SourceType        string
	Content           string
	FallbackContent   string
	RawSource         string
	FallbackRawSource string
	Summary           string
	Status            string
	CreatedByID       *uint
}

type ScriptVersion struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ScriptID        uint      `json:"script_id"`
	ParentVersionID *uint     `json:"parent_version_id,omitempty"`
	VersionNumber   int       `json:"version_number"`
	Title           string    `json:"title"`
	SourceType      string    `json:"source_type"`
	Content         string    `json:"content"`
	RawSource       string    `json:"raw_source"`
	Summary         string    `json:"summary"`
	Status          string    `json:"status"`
	CreatedByID     *uint     `json:"created_by_id,omitempty"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type ScriptBlockSpec struct {
	ProjectID       uint
	ScriptID        uint
	ScriptVersionID uint
	ParentBlockID   *uint
	Order           int
	Kind            string
	Speaker         string
	Content         string
	StartLine       int
	EndLine         int
	StartChar       int
	EndChar         int
	Status          string
	MetadataJSON    string
}

type ScriptBlock struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ScriptID        uint      `json:"script_id"`
	ScriptVersionID uint      `json:"script_version_id"`
	ParentBlockID   *uint     `json:"parent_block_id,omitempty"`
	Order           int       `json:"order"`
	Kind            string    `json:"kind"`
	Speaker         string    `json:"speaker"`
	Content         string    `json:"content"`
	StartLine       int       `json:"start_line"`
	EndLine         int       `json:"end_line"`
	StartChar       int       `json:"start_char"`
	EndChar         int       `json:"end_char"`
	Status          string    `json:"status"`
	MetadataJSON    string    `json:"metadata_json"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type ScriptBlockPatch struct {
	ParentBlockID *uint
	Order         int
	Kind          string
	Speaker       string
	Content       string
	StartLine     int
	EndLine       int
	StartChar     int
	EndChar       int
	Status        string
	MetadataJSON  string
}

func NewScriptBlock(spec ScriptBlockSpec) ScriptBlock {
	return ScriptBlock{
		ProjectID:       spec.ProjectID,
		ScriptID:        spec.ScriptID,
		ScriptVersionID: spec.ScriptVersionID,
		ParentBlockID:   spec.ParentBlockID,
		Order:           spec.Order,
		Kind:            FallbackString(spec.Kind, "action"),
		Speaker:         spec.Speaker,
		Content:         spec.Content,
		StartLine:       spec.StartLine,
		EndLine:         spec.EndLine,
		StartChar:       spec.StartChar,
		EndChar:         spec.EndChar,
		Status:          FallbackString(spec.Status, "active"),
		MetadataJSON:    spec.MetadataJSON,
	}
}

func NewScriptVersion(spec ScriptVersionSpec) ScriptVersion {
	return ScriptVersion{
		ProjectID:       spec.ProjectID,
		ScriptID:        spec.ScriptID,
		ParentVersionID: spec.ParentVersionID,
		VersionNumber:   spec.VersionNumber,
		Title:           FallbackString(spec.Title, spec.FallbackTitle),
		SourceType:      FallbackString(spec.SourceType, "raw"),
		Content:         FallbackString(spec.Content, spec.FallbackContent),
		RawSource:       FallbackString(spec.RawSource, spec.FallbackRawSource),
		Summary:         spec.Summary,
		Status:          SemanticDraftStatus(spec.Status),
		CreatedByID:     spec.CreatedByID,
	}
}
