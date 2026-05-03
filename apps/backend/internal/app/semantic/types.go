package semantic

type RelationFilter struct {
	ProjectID  uint
	Category   string
	Type       string
	SourceType string
	SourceID   uint
	TargetType string
	TargetID   uint
	Status     string
}

type ScriptVersionFilter struct {
	ProjectID uint
	ScriptID  uint
	Status    string
}

type CreateScriptVersionInput struct {
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

type PatchScriptVersionInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type SegmentFilter struct {
	ProjectID    uint
	ProductionID uint
	TextBlockID  uint
	Status       string
}

type CreateSegmentInput struct {
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

type PatchSegmentInput struct {
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

type ProductionTextBlockFilter struct {
	ProjectID    uint
	ProductionID uint
	Status       string
}

type CreateProductionTextBlockInput struct {
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

type PatchProductionTextBlockInput struct {
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

type SceneMomentFilter struct {
	ProjectID uint
	SegmentID uint
}

type CreateSceneMomentInput struct {
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

type PatchSceneMomentInput struct {
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

type ProductionFilter struct {
	ProjectID  uint
	Status     string
	SourceType string
}

type ProductionInput struct {
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

type ContentUnitFilter struct {
	ProjectID     uint
	ProductionID  uint
	SegmentID     uint
	SceneMomentID uint
}

type ContentUnitInput struct {
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

type KeyframeFilter struct {
	ProjectID     uint
	ProductionID  uint
	SceneMomentID uint
	ContentUnitID uint
}

type KeyframeInput struct {
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

type PreviewTimelineFilter struct {
	ProjectID    uint
	ProductionID uint
}

type PreviewTimelineInput struct {
	ProductionID    *uint   `json:"production_id"`
	ScriptVersionID *uint   `json:"script_version_id"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `json:"is_primary"`
	MetadataJSON    string  `json:"metadata_json"`
}

type PreviewTimelineItemFilter struct {
	ProjectID         uint
	PreviewTimelineID uint
	Status            string
}

type PreviewTimelineItemInput struct {
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
