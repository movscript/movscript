package model

import "gorm.io/gorm"

// ScriptVersion is the immutable-ish working version of imported script text.
// Script remains the legacy/project-facing record; new V2 structure hangs from
// versions so AI parsing and user edits can be compared or rolled back.
type ScriptVersion struct {
	gorm.Model
	ProjectID       uint    `gorm:"not null;index" json:"project_id"`
	ScriptID        uint    `gorm:"not null;index" json:"script_id"`
	Script          *Script `gorm:"foreignKey:ScriptID" json:"script,omitempty"`
	ParentVersionID *uint   `gorm:"index" json:"parent_version_id,omitempty"`
	VersionNumber   int     `gorm:"not null;default:1" json:"version_number"`
	Title           string  `json:"title"`
	SourceType      string  `gorm:"default:'raw';index" json:"source_type"` // raw|adapted|revised|ai
	Content         string  `gorm:"type:text" json:"content"`
	RawSource       string  `gorm:"type:text" json:"raw_source"`
	Summary         string  `gorm:"type:text" json:"summary"`
	Status          string  `gorm:"not null;default:'draft';index" json:"status"` // draft|active|archived
	CreatedByID     *uint   `json:"created_by_id,omitempty"`
}

// ScriptSection is the first V2 semantic cut of a script version. It is not a
// scene synonym; it can represent a scene, montage, product beat, narration,
// title card, transition, or any other meaningful production segment.
type ScriptSection struct {
	gorm.Model
	ProjectID       uint           `gorm:"not null;index" json:"project_id"`
	ScriptID        uint           `gorm:"not null;index" json:"script_id"`
	Script          *Script        `gorm:"foreignKey:ScriptID" json:"script,omitempty"`
	ScriptVersionID uint           `gorm:"not null;index" json:"script_version_id"`
	ScriptVersion   *ScriptVersion `gorm:"foreignKey:ScriptVersionID" json:"script_version,omitempty"`
	ParentSectionID *uint          `gorm:"index" json:"parent_section_id,omitempty"`
	Kind            string         `gorm:"not null;default:'section';index" json:"kind"` // scene|montage|narration|product_showcase|title_card|transition|section
	Order           int            `gorm:"not null;default:0;index" json:"order"`
	Title           string         `json:"title"`
	Summary         string         `gorm:"type:text" json:"summary"`
	Content         string         `gorm:"type:text" json:"content"`
	SourceRange     string         `json:"source_range"`
	Status          string         `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|ignored
	MetadataJSON    string         `gorm:"type:text" json:"metadata_json"`
}

// Situation is the core AI-generation context: when, where, under what
// conditions, who/what is doing what. It is intentionally separate from
// locations, characters, and shots.
type Situation struct {
	gorm.Model
	ProjectID       uint           `gorm:"not null;index" json:"project_id"`
	ScriptSectionID *uint          `gorm:"index" json:"script_section_id,omitempty"`
	ScriptSection   *ScriptSection `gorm:"foreignKey:ScriptSectionID" json:"script_section,omitempty"`
	Order           int            `gorm:"not null;default:0;index" json:"order"`
	Title           string         `json:"title"`
	Description     string         `gorm:"type:text" json:"description"`
	TimeText        string         `json:"time_text"`
	LocationText    string         `json:"location_text"`
	ConditionText   string         `gorm:"type:text" json:"condition_text"`
	ActionText      string         `gorm:"type:text" json:"action_text"`
	Mood            string         `json:"mood"`
	Status          string         `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|ignored
	MetadataJSON    string         `gorm:"type:text" json:"metadata_json"`
}

// ContentUnit is the preview and production grain. A traditional shot is just
// one kind of content unit.
type ContentUnit struct {
	gorm.Model
	ProjectID       uint           `gorm:"not null;index" json:"project_id"`
	ScriptSectionID *uint          `gorm:"index" json:"script_section_id,omitempty"`
	ScriptSection   *ScriptSection `gorm:"foreignKey:ScriptSectionID" json:"script_section,omitempty"`
	SituationID     *uint          `gorm:"index" json:"situation_id,omitempty"`
	Situation       *Situation     `gorm:"foreignKey:SituationID" json:"situation,omitempty"`
	Kind            string         `gorm:"not null;default:'shot';index" json:"kind"` // shot|visual_segment|product_showcase|caption_card|narration|transition|music_beat
	Order           int            `gorm:"not null;default:0;index" json:"order"`
	Title           string         `json:"title"`
	Description     string         `gorm:"type:text" json:"description"`
	Prompt          string         `gorm:"type:text" json:"prompt"`
	DurationSec     float64        `json:"duration_sec"`
	Status          string         `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|in_production|locked
	MetadataJSON    string         `gorm:"type:text" json:"metadata_json"`
}

// Keyframe is a visual anchor for a situation or content unit. In early V2 it
// can power the whole preview timeline before final video segments exist.
type Keyframe struct {
	gorm.Model
	ProjectID     uint         `gorm:"not null;index" json:"project_id"`
	SituationID   *uint        `gorm:"index" json:"situation_id,omitempty"`
	Situation     *Situation   `gorm:"foreignKey:SituationID" json:"situation,omitempty"`
	ContentUnitID *uint        `gorm:"index" json:"content_unit_id,omitempty"`
	ContentUnit   *ContentUnit `gorm:"foreignKey:ContentUnitID" json:"content_unit,omitempty"`
	ResourceID    *uint        `gorm:"index" json:"resource_id,omitempty"`
	Resource      *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
	CanvasID      *uint        `gorm:"index" json:"canvas_id,omitempty"`
	Title         string       `json:"title"`
	Description   string       `gorm:"type:text" json:"description"`
	Prompt        string       `gorm:"type:text" json:"prompt"`
	Order         int          `gorm:"not null;default:0;index" json:"order"`
	Status        string       `gorm:"not null;default:'generated';index" json:"status"` // generated|candidate|attached|accepted|rejected
	MetadataJSON  string       `gorm:"type:text" json:"metadata_json"`
}

type PreviewTimeline struct {
	gorm.Model
	ProjectID       uint           `gorm:"not null;index" json:"project_id"`
	ScriptVersionID *uint          `gorm:"index" json:"script_version_id,omitempty"`
	ScriptVersion   *ScriptVersion `gorm:"foreignKey:ScriptVersionID" json:"script_version,omitempty"`
	Name            string         `gorm:"not null" json:"name"`
	Status          string         `gorm:"not null;default:'draft';index" json:"status"` // draft|playable|confirmed|archived
	DurationSec     float64        `json:"duration_sec"`
	IsPrimary       bool           `gorm:"default:false;index" json:"is_primary"`
	MetadataJSON    string         `gorm:"type:text" json:"metadata_json"`
}

type PreviewTimelineItem struct {
	gorm.Model
	ProjectID         uint             `gorm:"not null;index" json:"project_id"`
	PreviewTimelineID uint             `gorm:"not null;index" json:"preview_timeline_id"`
	PreviewTimeline   *PreviewTimeline `gorm:"foreignKey:PreviewTimelineID" json:"preview_timeline,omitempty"`
	ScriptSectionID   *uint            `gorm:"index" json:"script_section_id,omitempty"`
	SituationID       *uint            `gorm:"index" json:"situation_id,omitempty"`
	ContentUnitID     *uint            `gorm:"index" json:"content_unit_id,omitempty"`
	KeyframeID        *uint            `gorm:"index" json:"keyframe_id,omitempty"`
	Kind              string           `gorm:"not null;default:'keyframe';index" json:"kind"` // keyframe|content_unit|gap|note
	Order             int              `gorm:"not null;default:0;index" json:"order"`
	StartSec          float64          `json:"start_sec"`
	DurationSec       float64          `json:"duration_sec"`
	Label             string           `json:"label"`
	Status            string           `gorm:"not null;default:'draft';index" json:"status"` // draft|confirmed|needs_asset|locked
	MetadataJSON      string           `gorm:"type:text" json:"metadata_json"`
}
