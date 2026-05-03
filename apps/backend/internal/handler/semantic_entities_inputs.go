package handler

type scriptVersionInput struct {
	ScriptID        uint   `json:"script_id" binding:"required"`
	ParentVersionID *uint  `json:"parent_version_id"`
	VersionNumber   int    `json:"version_number"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type scriptVersionPatchInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type segmentInput struct {
	ProductionID    *uint  `json:"production_id"`
	TextBlockID     *uint  `json:"text_block_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type segmentPatchInput struct {
	ProductionID    *uint  `json:"production_id"`
	TextBlockID     *uint  `json:"text_block_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type productionTextBlockInput struct {
	ProductionID  uint   `json:"production_id" binding:"required"`
	ParentBlockID *uint  `json:"parent_block_id"`
	Kind          string `json:"kind"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	Summary       string `json:"summary"`
	SourceType    string `json:"source_type"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type productionTextBlockPatchInput struct {
	ProductionID  *uint  `json:"production_id"`
	ParentBlockID *uint  `json:"parent_block_id"`
	Kind          string `json:"kind"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	Summary       string `json:"summary"`
	SourceType    string `json:"source_type"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type sceneMomentInput struct {
	SegmentID     *uint  `json:"segment_id"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	TimeText      string `json:"time_text"`
	LocationText  string `json:"location_text"`
	ConditionText string `json:"condition_text"`
	ActionText    string `json:"action_text"`
	Mood          string `json:"mood"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type sceneMomentPatchInput = sceneMomentInput

type storyboardScriptInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Status          string `json:"status"`
	IsPrimary       bool   `json:"is_primary"`
	MetadataJSON    string `json:"metadata_json"`
}

type storyboardVersionInput struct {
	StoryboardScriptID uint   `json:"storyboard_script_id" binding:"required"`
	ParentVersionID    *uint  `json:"parent_version_id"`
	VersionNumber      int    `json:"version_number"`
	Title              string `json:"title"`
	Source             string `json:"source"`
	Status             string `json:"status"`
	SnapshotJSON       string `json:"snapshot_json"`
	MetadataJSON       string `json:"metadata_json"`
}

type storyboardVersionPatchInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	Source          string `json:"source"`
	Status          string `json:"status"`
	SnapshotJSON    string `json:"snapshot_json"`
	MetadataJSON    string `json:"metadata_json"`
}

type storyboardLineInput struct {
	StoryboardScriptID  uint    `json:"storyboard_script_id" binding:"required"`
	StoryboardVersionID *uint   `json:"storyboard_version_id"`
	SegmentID           *uint   `json:"segment_id"`
	SceneMomentID       *uint   `json:"scene_moment_id"`
	Order               int     `json:"order"`
	Kind                string  `json:"kind"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Dialogue            string  `json:"dialogue"`
	VisualIntent        string  `json:"visual_intent"`
	DurationSec         float64 `json:"duration_sec"`
	Status              string  `json:"status"`
	MetadataJSON        string  `json:"metadata_json"`
}

type productionInput struct {
	ScriptVersionID   *uint  `json:"script_version_id"`
	PreviewTimelineID *uint  `json:"preview_timeline_id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Status            string `json:"status"`
	SourceType        string `json:"source_type"`
	OwnerLabel        string `json:"owner_label"`
	Progress          int    `json:"progress"`
	MetadataJSON      string `json:"metadata_json"`
}

type contentUnitInput struct {
	ProductionID     *uint   `json:"production_id"`
	SegmentID        *uint   `json:"segment_id"`
	SceneMomentID    *uint   `json:"scene_moment_id"`
	Kind             string  `json:"kind"`
	Order            int     `json:"order"`
	Title            string  `json:"title"`
	Description      string  `json:"description"`
	Prompt           string  `json:"prompt"`
	DurationSec      float64 `json:"duration_sec"`
	ShotSize         string  `json:"shot_size"`
	CameraAngle      string  `json:"camera_angle"`
	CameraHeight     string  `json:"camera_height"`
	CameraMotion     string  `json:"camera_motion"`
	MotionIntensity  string  `json:"motion_intensity"`
	CameraSpeed      string  `json:"camera_speed"`
	Lens             string  `json:"lens"`
	FocalLength      string  `json:"focal_length"`
	FocusSubject     string  `json:"focus_subject"`
	CompositionStart string  `json:"composition_start"`
	CompositionEnd   string  `json:"composition_end"`
	Stabilization    string  `json:"stabilization"`
	CameraParamsJSON string  `json:"camera_params_json"`
	CameraNotes      string  `json:"camera_notes"`
	Status           string  `json:"status"`
	MetadataJSON     string  `json:"metadata_json"`
}

type contentUnitPatchInput = contentUnitInput

type keyframeInput struct {
	ProductionID  *uint  `json:"production_id"`
	SceneMomentID *uint  `json:"scene_moment_id"`
	ContentUnitID *uint  `json:"content_unit_id"`
	ResourceID    *uint  `json:"resource_id"`
	CanvasID      *uint  `json:"canvas_id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	Order         int    `json:"order"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type previewTimelineInput struct {
	ProductionID    *uint   `json:"production_id"`
	ScriptVersionID *uint   `json:"script_version_id"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `json:"is_primary"`
	MetadataJSON    string  `json:"metadata_json"`
}

type previewTimelineItemInput struct {
	PreviewTimelineID uint    `json:"preview_timeline_id"`
	SegmentID         *uint   `json:"segment_id"`
	SceneMomentID     *uint   `json:"scene_moment_id"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	KeyframeID        *uint   `json:"keyframe_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

type creativeReferenceInput struct {
	SourceScriptID   *uint  `json:"source_script_id"`
	SourceAnalysisID *uint  `json:"source_analysis_id"`
	LegacySettingID  *uint  `json:"legacy_setting_id"`
	Kind             string `json:"kind" binding:"required"`
	Name             string `json:"name" binding:"required"`
	Alias            string `json:"alias"`
	Description      string `json:"description"`
	Content          string `json:"content"`
	Importance       string `json:"importance"`
	Status           string `json:"status"`
	ProfileJSON      string `json:"profile_json"`
	TagsJSON         string `json:"tags_json"`
}

type creativeReferenceStateInput struct {
	CreativeReferenceID uint   `json:"creative_reference_id" binding:"required"`
	ScopeType           string `json:"scope_type" binding:"required"`
	ScopeID             *uint  `json:"scope_id"`
	Name                string `json:"name" binding:"required"`
	Description         string `json:"description"`
	VisualNotes         string `json:"visual_notes"`
	Emotion             string `json:"emotion"`
	Costume             string `json:"costume"`
	Props               string `json:"props"`
	Status              string `json:"status"`
	TagsJSON            string `json:"tags_json"`
	MetadataJSON        string `json:"metadata_json"`
}

type creativeReferenceUsageInput struct {
	OwnerType                string `json:"owner_type" binding:"required"`
	OwnerID                  uint   `json:"owner_id" binding:"required"`
	CreativeReferenceID      uint   `json:"creative_reference_id" binding:"required"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	Role                     string `json:"role"`
	Order                    int    `json:"order"`
	Evidence                 string `json:"evidence"`
	Source                   string `json:"source"`
	Status                   string `json:"status"`
	MetadataJSON             string `json:"metadata_json"`
}

type creativeRelationshipInput struct {
	SourceCreativeReferenceID uint   `json:"source_creative_reference_id" binding:"required"`
	TargetCreativeReferenceID uint   `json:"target_creative_reference_id" binding:"required"`
	ScopeType                 string `json:"scope_type"`
	ScopeID                   *uint  `json:"scope_id"`
	Category                  string `json:"category"`
	Type                      string `json:"type"`
	Label                     string `json:"label"`
	Description               string `json:"description"`
	Source                    string `json:"source"`
	Status                    string `json:"status"`
	Evidence                  string `json:"evidence"`
	MetadataJSON              string `json:"metadata_json"`
}

type assetSlotInput struct {
	ProductionID             *uint  `json:"production_id"`
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name" binding:"required"`
	Description              string `json:"description"`
	SlotKey                  string `json:"slot_key"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	ResourceID               *uint  `json:"resource_id"`
	LockedAssetSlotID        *uint  `json:"locked_asset_slot_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type assetSlotPatchInput struct {
	ProductionID             *uint  `json:"production_id"`
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name"`
	Description              string `json:"description"`
	SlotKey                  string `json:"slot_key"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	ResourceID               *uint  `json:"resource_id"`
	LockedAssetSlotID        *uint  `json:"locked_asset_slot_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type assetSlotCandidateInput struct {
	AssetSlotID          uint    `json:"asset_slot_id" binding:"required"`
	CandidateAssetSlotID uint    `json:"candidate_asset_slot_id"`
	ResourceID           *uint   `json:"resource_id"`
	SourceType           string  `json:"source_type"`
	SourceID             *uint   `json:"source_id"`
	Score                float64 `json:"score"`
	Status               string  `json:"status"`
	Note                 string  `json:"note"`
}

type candidateDecisionInput struct {
	CandidateType     string `json:"candidate_type" binding:"required"`
	CandidateID       *uint  `json:"candidate_id"`
	CandidateClientID string `json:"candidate_client_id"`
	TargetType        string `json:"target_type"`
	TargetID          *uint  `json:"target_id"`
	Decision          string `json:"decision" binding:"required"`
	Status            string `json:"status"`
	Reason            string `json:"reason"`
	Note              string `json:"note"`
	Source            string `json:"source"`
	DecidedByID       *uint  `json:"decided_by_id"`
	AppliedAt         string `json:"applied_at"`
	MetadataJSON      string `json:"metadata_json"`
}

type reviewEventInput struct {
	SubjectType     string `json:"subject_type" binding:"required"`
	SubjectID       *uint  `json:"subject_id"`
	SubjectClientID string `json:"subject_client_id"`
	EventType       string `json:"event_type" binding:"required"`
	FromStatus      string `json:"from_status"`
	ToStatus        string `json:"to_status"`
	Comment         string `json:"comment"`
	Reason          string `json:"reason"`
	Source          string `json:"source"`
	ActorID         *uint  `json:"actor_id"`
	MetadataJSON    string `json:"metadata_json"`
}

type workItemInput struct {
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

type workReviewInput struct {
	WorkItemID   uint   `json:"work_item_id" binding:"required"`
	ReviewerID   *uint  `json:"reviewer_id"`
	Status       string `json:"status"`
	Comment      string `json:"comment"`
	MetadataJSON string `json:"metadata_json"`
}

type workDependencyInput struct {
	WorkItemID          uint   `json:"work_item_id" binding:"required"`
	DependsOnWorkItemID uint   `json:"depends_on_work_item_id" binding:"required"`
	DependencyType      string `json:"dependency_type"`
}

type deliveryVersionInput struct {
	ProductionID      *uint   `json:"production_id"`
	PreviewTimelineID *uint   `json:"preview_timeline_id"`
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Status            string  `json:"status"`
	IsPrimary         bool    `json:"is_primary"`
	DurationSec       float64 `json:"duration_sec"`
	MetadataJSON      string  `json:"metadata_json"`
}

type deliveryTimelineItemInput struct {
	DeliveryVersionID uint    `json:"delivery_version_id" binding:"required"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	AssetSlotID       *uint   `json:"asset_slot_id"`
	ResourceID        *uint   `json:"resource_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

type exportRecordInput struct {
	DeliveryVersionID uint   `json:"delivery_version_id" binding:"required"`
	ResourceID        *uint  `json:"resource_id"`
	Status            string `json:"status"`
	Format            string `json:"format"`
	Preset            string `json:"preset"`
	Error             string `json:"error"`
	MetadataJSON      string `json:"metadata_json"`
}

type canvasOutputInput struct {
	CanvasID     uint   `json:"canvas_id" binding:"required"`
	CanvasRunID  *uint  `json:"canvas_run_id"`
	CanvasNodeID string `json:"canvas_node_id"`
	PortID       string `json:"port_id" binding:"required"`
	OwnerType    string `json:"owner_type" binding:"required"`
	OwnerID      uint   `json:"owner_id" binding:"required"`
	OutputType   string `json:"output_type"`
	ResourceID   *uint  `json:"resource_id"`
	TargetField  string `json:"target_field"`
	ValueJSON    string `json:"value_json"`
	Status       string `json:"status"`
	MetadataJSON string `json:"metadata_json"`
}
