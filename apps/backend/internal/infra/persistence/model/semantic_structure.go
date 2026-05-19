package model

import (
	"errors"

	"gorm.io/gorm"
)

// ScriptVersion is an immutable snapshot of imported or revised script text.
// Script remains the editable project-facing draft; semantic structure hangs from
// versions so downstream references stay stable across later draft edits.
type ScriptVersion struct {
	gorm.Model
	ProjectID       uint   `gorm:"not null;index" json:"project_id"`
	ScriptID        uint   `gorm:"not null;index" json:"script_id"`
	ParentVersionID *uint  `gorm:"index" json:"parent_version_id,omitempty"`
	VersionNumber   int    `gorm:"not null;default:1" json:"version_number"`
	Title           string `json:"title"`
	SourceType      string `gorm:"default:'raw';index" json:"source_type"` // raw|adapted|revised|ai
	Content         string `gorm:"type:text" json:"content"`
	RawSource       string `gorm:"type:text" json:"raw_source"`
	Summary         string `gorm:"type:text" json:"summary"`
	Status          string `gorm:"not null;default:'draft';index" json:"status"` // draft|active|archived
	CreatedByID     *uint  `json:"created_by_id,omitempty"`
}

func (*ScriptVersion) BeforeUpdate(*gorm.DB) error {
	return errors.New("script version is immutable")
}

func (*ScriptVersion) BeforeDelete(*gorm.DB) error {
	return errors.New("script version is immutable")
}

// ScriptBlock is a structured, addressable slice of a script version. Scene
// moments and content units can cite blocks instead of copying raw script text.
type ScriptBlock struct {
	gorm.Model
	ProjectID       uint   `gorm:"not null;index" json:"project_id"`
	ScriptID        uint   `gorm:"not null;index" json:"script_id"`
	ScriptVersionID uint   `gorm:"not null;index" json:"script_version_id"`
	ParentBlockID   *uint  `gorm:"index" json:"parent_block_id,omitempty"`
	Order           int    `gorm:"not null;default:0;index" json:"order"`
	Kind            string `gorm:"not null;default:'action';index" json:"kind"` // scene_heading|action|dialogue|parenthetical|transition|note
	Speaker         string `gorm:"index" json:"speaker"`
	Content         string `gorm:"type:text" json:"content"`
	StartLine       int    `gorm:"not null;default:0;index" json:"start_line"`
	EndLine         int    `gorm:"not null;default:0;index" json:"end_line"`
	StartChar       int    `gorm:"not null;default:0" json:"start_char"`
	EndChar         int    `gorm:"not null;default:0" json:"end_char"`
	Status          string `gorm:"not null;default:'active';index" json:"status"` // active|draft|archived
	MetadataJSON    string `gorm:"type:text" json:"metadata_json"`
}

// Segment is an episode-level orchestration unit. It represents an internal
// emotional, rhythm, or dramatic-function phase of the episode, not a script
// paragraph, scene synonym, or raw footage fragment.
type Segment struct {
	gorm.Model
	ProjectID       uint   `gorm:"not null;index" json:"project_id"`
	ProductionID    *uint  `gorm:"index" json:"production_id,omitempty"`
	TextBlockID     *uint  `gorm:"index" json:"text_block_id,omitempty"`
	ScriptBlockID   *uint  `gorm:"index" json:"script_block_id,omitempty"`
	ParentSegmentID *uint  `gorm:"index" json:"parent_segment_id,omitempty"`
	Kind            string `gorm:"not null;default:'emotional_function';index" json:"kind"` // emotional_function|rhythm_shift|dramatic_function|setup|escalation|release|reversal|transition
	Order           int    `gorm:"not null;default:0;index" json:"order"`
	Title           string `json:"title"`
	Summary         string `gorm:"type:text" json:"summary"`
	Content         string `gorm:"type:text" json:"content"`
	Status          string `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|ignored
	MetadataJSON    string `gorm:"type:text" json:"metadata_json"`
}

// SceneMoment is the core AI-generation context: when, where, under what
// conditions, who/what is doing what. It is intentionally separate from
// locations, characters, and shots.
type SceneMoment struct {
	gorm.Model
	ProjectID     uint   `gorm:"not null;index" json:"project_id"`
	SegmentID     *uint  `gorm:"index" json:"segment_id,omitempty"`
	ScriptBlockID *uint  `gorm:"index" json:"script_block_id,omitempty"`
	Order         int    `gorm:"not null;default:0;index" json:"order"`
	Title         string `json:"title"`
	Description   string `gorm:"type:text" json:"description"`
	TimeText      string `json:"time_text"`
	LocationText  string `json:"location_text"`
	ConditionText string `gorm:"type:text" json:"condition_text"`
	ActionText    string `gorm:"type:text" json:"action_text"`
	Mood          string `json:"mood"`
	Status        string `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|ignored
	MetadataJSON  string `gorm:"type:text" json:"metadata_json"`
}

// WritingExpression is the screenwriter-facing expression line under a scene
// moment. It stores dialogue, action, silence, narration, subtitles, and visual
// information as first-class editable writing units.
type WritingExpression struct {
	gorm.Model
	ProjectID     uint   `gorm:"not null;index" json:"project_id"`
	SceneMomentID uint   `gorm:"not null;index" json:"scene_moment_id"`
	ScriptBlockID *uint  `gorm:"index" json:"script_block_id,omitempty"`
	Order         int    `gorm:"not null;default:0;index" json:"order"`
	Kind          string `gorm:"not null;default:'action';index" json:"kind"` // dialogue|action|silence|narration|subtitle|visual
	Speaker       string `gorm:"index" json:"speaker"`
	Text          string `gorm:"type:text" json:"text"`
	Note          string `gorm:"type:text" json:"note"`
	Intent        string `gorm:"type:text" json:"intent"`
	MetadataJSON  string `gorm:"type:text" json:"metadata_json"`
}

// StoryboardScript is the structured written plan that bridges confirmed
// SceneMoments and content units.
type StoryboardScript struct {
	gorm.Model
	ProjectID       uint   `gorm:"not null;index" json:"project_id"`
	ScriptVersionID *uint  `gorm:"index" json:"script_version_id,omitempty"`
	Name            string `gorm:"not null" json:"name"`
	Description     string `gorm:"type:text" json:"description"`
	Status          string `gorm:"not null;default:'draft';index" json:"status"` // draft|active|locked|archived
	IsPrimary       bool   `gorm:"default:false;index" json:"is_primary"`
	MetadataJSON    string `gorm:"type:text" json:"metadata_json"`
}

// StoryboardVersion stores revision snapshots for a structured storyboard
// script so generated proposals and user edits can be compared.
type StoryboardVersion struct {
	gorm.Model
	ProjectID          uint   `gorm:"not null;index" json:"project_id"`
	StoryboardScriptID uint   `gorm:"not null;index" json:"storyboard_script_id"`
	ParentVersionID    *uint  `gorm:"index" json:"parent_version_id,omitempty"`
	VersionNumber      int    `gorm:"not null;default:1" json:"version_number"`
	Title              string `json:"title"`
	Source             string `gorm:"not null;default:'manual';index" json:"source"` // ai|manual|import
	Status             string `gorm:"not null;default:'draft';index" json:"status"`  // draft|active|archived
	SnapshotJSON       string `gorm:"type:text" json:"snapshot_json"`
	MetadataJSON       string `gorm:"type:text" json:"metadata_json"`
}

// ContentUnit is the preview and production grain. A traditional shot is just
// one kind of content unit.
type ContentUnit struct {
	gorm.Model
	ProjectID        uint    `gorm:"not null;index" json:"project_id"`
	ProductionID     *uint   `gorm:"index" json:"production_id,omitempty"`
	SegmentID        *uint   `gorm:"index" json:"segment_id,omitempty"`
	SceneMomentID    *uint   `gorm:"index" json:"scene_moment_id,omitempty"`
	ScriptBlockID    *uint   `gorm:"index" json:"script_block_id,omitempty"`
	Kind             string  `gorm:"not null;default:'shot';index" json:"kind"` // shot|voiceover|dialogue_audio|sound|music_beat|subtitle|caption_card|transition
	Order            int     `gorm:"not null;default:0;index" json:"order"`
	Title            string  `json:"title"`
	Description      string  `gorm:"type:text" json:"description"`
	Prompt           string  `gorm:"type:text" json:"prompt"`
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
	CompositionStart string  `gorm:"type:text" json:"composition_start"`
	CompositionEnd   string  `gorm:"type:text" json:"composition_end"`
	Stabilization    string  `json:"stabilization"`
	CameraParamsJSON string  `gorm:"type:text" json:"camera_params_json"`
	CameraNotes      string  `gorm:"type:text" json:"camera_notes"`
	Status           string  `gorm:"not null;default:'draft';index" json:"status"` // draft|candidate|confirmed|in_production|locked
	MetadataJSON     string  `gorm:"type:text" json:"metadata_json"`
}

// Keyframe is a visual anchor for a scene moment or content unit. In early semantic model it
// can power the whole preview timeline before final video segments exist.
type Keyframe struct {
	gorm.Model
	ProjectID     uint   `gorm:"not null;index" json:"project_id"`
	ProductionID  *uint  `gorm:"index" json:"production_id,omitempty"`
	SceneMomentID *uint  `gorm:"index" json:"scene_moment_id,omitempty"`
	ContentUnitID *uint  `gorm:"index" json:"content_unit_id,omitempty"`
	ResourceID    *uint  `gorm:"index" json:"resource_id,omitempty"`
	CanvasID      *uint  `gorm:"index" json:"canvas_id,omitempty"`
	Title         string `json:"title"`
	Description   string `gorm:"type:text" json:"description"`
	Prompt        string `gorm:"type:text" json:"prompt"`
	Order         int    `gorm:"not null;default:0;index" json:"order"`
	Status        string `gorm:"not null;default:'generated';index" json:"status"` // generated|candidate|attached|accepted|rejected
	MetadataJSON  string `gorm:"type:text" json:"metadata_json"`
}

type PreviewTimeline struct {
	gorm.Model
	ProjectID       uint    `gorm:"not null;index" json:"project_id"`
	ProductionID    *uint   `gorm:"index" json:"production_id,omitempty"`
	ScriptVersionID *uint   `gorm:"index" json:"script_version_id,omitempty"`
	Name            string  `gorm:"not null" json:"name"`
	Status          string  `gorm:"not null;default:'draft';index" json:"status"` // draft|playable|confirmed|archived
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `gorm:"default:false;index" json:"is_primary"`
	MetadataJSON    string  `gorm:"type:text" json:"metadata_json"`
}

type PreviewTimelineItem struct {
	gorm.Model
	ProjectID         uint    `gorm:"not null;index" json:"project_id"`
	PreviewTimelineID uint    `gorm:"not null;index" json:"preview_timeline_id"`
	SegmentID         *uint   `gorm:"index" json:"segment_id,omitempty"`
	SceneMomentID     *uint   `gorm:"index" json:"scene_moment_id,omitempty"`
	ContentUnitID     *uint   `gorm:"index" json:"content_unit_id,omitempty"`
	KeyframeID        *uint   `gorm:"index" json:"keyframe_id,omitempty"`
	Kind              string  `gorm:"not null;default:'keyframe';index" json:"kind"` // keyframe|content_unit|video|image|audio|caption|gap|note
	Order             int     `gorm:"not null;default:0;index" json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|needs_asset|locked
	MetadataJSON      string  `gorm:"type:text" json:"metadata_json"`
}
