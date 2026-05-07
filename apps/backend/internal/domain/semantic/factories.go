package semantic

import "strconv"

type SegmentSpec struct {
	ProjectID       uint
	ProductionID    *uint
	TextBlockID     *uint
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
	ID              uint
	ProjectID       uint
	ProductionID    *uint
	TextBlockID     *uint
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
		ParentSegmentID: spec.ParentSegmentID,
		Kind:            FallbackString(spec.Kind, "section"),
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
	ID            uint
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
	ID            uint
	ProjectID     uint
	SegmentID     *uint
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
	ID               uint
	ProjectID        uint
	ProductionID     *uint
	SegmentID        *uint
	SceneMomentID    *uint
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
	ID                uint
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
	ID                       uint
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
	ID                   uint
	ProjectID            uint
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
	ID                uint
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
	ID              uint
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
	ID                uint
	ProjectID         uint
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
	ID           uint
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
	ID           uint
	ProjectID    uint
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
	ID              uint
	ProjectID       uint
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
	ID                 uint
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

type StoryboardLineSpec struct {
	ProjectID           uint
	StoryboardScriptID  uint
	StoryboardVersionID *uint
	SegmentID           *uint
	SceneMomentID       *uint
	Order               int
	Kind                string
	Title               string
	Description         string
	Dialogue            string
	VisualIntent        string
	DurationSec         float64
	Status              string
	MetadataJSON        string
}

type StoryboardLine struct {
	ID                  uint
	ProjectID           uint
	StoryboardScriptID  uint
	StoryboardVersionID *uint
	SegmentID           *uint
	SceneMomentID       *uint
	Order               int
	Kind                string
	Title               string
	Description         string
	Dialogue            string
	VisualIntent        string
	DurationSec         float64
	Status              string
	MetadataJSON        string
}

func NewStoryboardLine(spec StoryboardLineSpec) StoryboardLine {
	return StoryboardLine{
		ProjectID:           spec.ProjectID,
		StoryboardScriptID:  spec.StoryboardScriptID,
		StoryboardVersionID: spec.StoryboardVersionID,
		SegmentID:           spec.SegmentID,
		SceneMomentID:       spec.SceneMomentID,
		Order:               spec.Order,
		Kind:                FallbackString(spec.Kind, "beat"),
		Title:               spec.Title,
		Description:         spec.Description,
		Dialogue:            spec.Dialogue,
		VisualIntent:        spec.VisualIntent,
		DurationSec:         spec.DurationSec,
		Status:              SemanticDraftStatus(spec.Status),
		MetadataJSON:        spec.MetadataJSON,
	}
}

type CreativeReferenceSpec struct {
	ProjectID        uint
	SourceScriptID   *uint
	SourceAnalysisID *uint
	LegacySettingID  *uint
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
	ID               uint
	ProjectID        uint
	SourceScriptID   *uint
	SourceAnalysisID *uint
	LegacySettingID  *uint
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
		LegacySettingID:  spec.LegacySettingID,
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
	ID                  uint
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
	ID                       uint
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
	ID                        uint
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
	ID                uint
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
	ID            uint
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
	ID              uint
	ProjectID       uint
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
	ID                uint
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
	ID                uint
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
	ID                  uint
	ProjectID           uint
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
	ID              uint
	ProjectID       uint
	ScriptID        uint
	ParentVersionID *uint
	VersionNumber   int
	Title           string
	SourceType      string
	Content         string
	RawSource       string
	Summary         string
	Status          string
	CreatedByID     *uint
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
