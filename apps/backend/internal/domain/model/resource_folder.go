package model

import "gorm.io/gorm"

type ResourceFolder struct {
	gorm.Model
	OwnerID        uint   `gorm:"not null" json:"owner_id"`
	Owner          *User  `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	OrgID          *uint  `gorm:"index" json:"org_id,omitempty"`
	Name           string `gorm:"not null" json:"name"`
	ParentID       *uint  `json:"parent_id,omitempty"`
	StorageBackend string `gorm:"default:''" json:"storage_backend"`
	IsShared       bool   `gorm:"default:false" json:"is_shared"`
	ResourceCount  int    `gorm:"-" json:"resource_count"`
}
