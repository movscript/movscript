package model

import "gorm.io/gorm"

// AssetType: character | scene | prop
type Asset struct {
	gorm.Model
	ProjectID      uint   `gorm:"not null" json:"project_id"`
	PipelineNodeID *uint  `json:"pipeline_node_id,omitempty"`
	Name           string `gorm:"not null" json:"name"`
	Type           string `gorm:"not null" json:"type"`
	Description    string `json:"description"`
	// Reserved for legacy entity-level review. Disabled in the frontend for now;
	// pipeline node status is the active review source of truth.
	ReviewStatus string      `gorm:"default:'draft'" json:"review_status"`
	SettingID    *uint       `json:"setting_id,omitempty"` // optional link to a Setting
	Setting      *Setting    `gorm:"foreignKey:SettingID" json:"setting,omitempty"`
	Views        []AssetView `gorm:"foreignKey:AssetID" json:"views,omitempty"`
}

// AssetView represents one visual angle/variant of an asset.
// ViewType: front|back|left|right|detail|custom
type AssetView struct {
	gorm.Model
	AssetID    uint         `gorm:"not null" json:"asset_id"`
	ViewType   string       `gorm:"default:'front'" json:"view_type"`
	Label      string       `json:"label"`
	ResourceID *uint        `json:"resource_id,omitempty"`
	Resource   *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`
	CanvasID   *uint        `json:"canvas_id,omitempty"`
	ImageURL   string       `json:"image_url"` // fallback for direct URL
}
