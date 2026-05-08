package model

import "gorm.io/gorm"

// ResourceBinding gives a RawResource product meaning.
// RawResource owns storage metadata; ResourceBinding says which creative entity
// uses that file and whether it is a reference, input, output, final, etc.
type ResourceBinding struct {
	gorm.Model
	ProjectID uint `gorm:"not null;index:idx_resource_binding_project_owner" json:"project_id"`

	ResourceID uint         `gorm:"not null;index" json:"resource_id"`
	Resource   *RawResource `gorm:"foreignKey:ResourceID" json:"resource,omitempty"`

	OwnerType string `gorm:"not null;index:idx_resource_binding_project_owner" json:"owner_type"` // script|asset_slot|semantic entities|canvas
	OwnerID   uint   `gorm:"not null;index:idx_resource_binding_project_owner" json:"owner_id"`

	Role         string `gorm:"not null;default:'attachment';index" json:"role"` // reference|input|output|draft|final|thumbnail|attachment|source
	Slot         string `gorm:"default:''" json:"slot"`
	SortOrder    int    `json:"sort_order"`
	Version      int    `gorm:"not null;default:1" json:"version"`
	IsPrimary    bool   `gorm:"default:false" json:"is_primary"`
	Status       string `gorm:"not null;default:'draft';index" json:"status"` // draft|selected|rejected|approved|archived
	SourceType   string `gorm:"not null;default:'manual'" json:"source_type"` // upload|job|canvas|import|manual|legacy
	SourceID     *uint  `json:"source_id,omitempty"`
	MetadataJSON string `gorm:"type:text" json:"metadata_json"`
	CreatedByID  *uint  `json:"created_by_id,omitempty"`
}
