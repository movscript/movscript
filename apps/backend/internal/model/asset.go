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
	VariantType    string `gorm:"default:'base'" json:"variant_type"` // base|costume|time_of_day|period|state|expression|custom
	VariantName    string `json:"variant_name"`
	Costume        string `json:"costume"`
	TimeOfDay      string `json:"time_of_day"`
	Period         string `json:"period"`
	State          string `json:"state"`
	StyleProfile   string `json:"style_profile"`
	Prompt         string `gorm:"type:text" json:"prompt"`
	NegativePrompt string `gorm:"type:text" json:"negative_prompt"`
	IsPrimary      bool   `json:"is_primary"`
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
	AssetID            uint         `gorm:"not null" json:"asset_id"`
	ViewType           string       `gorm:"default:'front'" json:"view_type"`
	Label              string       `json:"label"`
	ShotType           string       `json:"shot_type"` // full_body|half_body|closeup|environment|prop_detail
	Resource           *RawResource `gorm:"-" json:"resource,omitempty"`
	CanvasID           *uint        `json:"canvas_id,omitempty"`
	ImageURL           string       `json:"image_url"` // fallback for direct URL
	Prompt             string       `gorm:"type:text" json:"prompt"`
	Seed               string       `json:"seed"`
	GenerationMetaJSON string       `gorm:"type:text" json:"generation_meta_json"`
	QualityStatus      string       `gorm:"default:'draft'" json:"quality_status"` // draft|selected|rejected|final
}
