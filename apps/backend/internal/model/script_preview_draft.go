package model

import "gorm.io/gorm"

// ScriptPreviewDraft stores the product-level draft snapshot used by the V2
// script preview flow. It is intentionally a thin snapshot and not a public
// replacement for ScriptVersion, ContentUnit, or PreviewTimeline.
type ScriptPreviewDraft struct {
	gorm.Model
	ProjectID            uint    `gorm:"not null;index;uniqueIndex:idx_script_preview_draft_project_draft" json:"project_id"`
	DraftID              string  `gorm:"not null;uniqueIndex:idx_script_preview_draft_project_draft" json:"draft_id"`
	Title                string  `json:"title"`
	SourceType           string  `gorm:"default:'script';index" json:"source_type"`
	SourceText           string  `gorm:"type:text" json:"source_text"`
	Status               string  `gorm:"not null;default:'draft';index" json:"status"`
	PreviewStatus        string  `gorm:"not null;default:'draft';index" json:"preview_status"`
	ConfirmedAt          string  `json:"confirmed_at"`
	StoryboardRevisionID string  `json:"storyboard_revision_id"`
	PreviewTimelineID    string  `json:"preview_timeline_id"`
	SnapshotJSON         string  `gorm:"type:text" json:"snapshot_json"`
	DurationSec          float64 `json:"duration_sec"`
	SavedAt              string  `json:"saved_at"`
}
