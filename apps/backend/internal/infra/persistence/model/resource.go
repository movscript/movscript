package model

import (
	"time"

	"gorm.io/gorm"
)

type RawResource struct {
	gorm.Model
	OwnerID              uint            `gorm:"not null" json:"owner_id"`
	Owner                User            `json:"owner,omitempty"`
	OrgID                *uint           `gorm:"index" json:"org_id,omitempty"`
	FolderID             *uint           `json:"folder_id,omitempty"`
	Folder               *ResourceFolder `gorm:"foreignKey:FolderID" json:"folder,omitempty"`
	Type                 string          `gorm:"not null" json:"type"` // image | video | audio | text
	Name                 string          `gorm:"not null" json:"name"`
	FilePath             string          `gorm:"not null" json:"-"`
	URL                  string          `gorm:"-" json:"url"`
	Size                 int64           `json:"size"`
	MimeType             string          `json:"mime_type"`
	StorageBackend       string          `gorm:"default:'minio'" json:"storage_backend"`
	StorageKey           string          `json:"storage_key"`
	IsShared             bool            `gorm:"default:false" json:"is_shared"`
	DirectURL            string          `gorm:"-" json:"direct_url,omitempty"` // presigned URL for cloud resources
	VerificationStatus   string          `gorm:"default:'';index" json:"verification_status,omitempty"`
	VerificationRef      string          `gorm:"default:''" json:"verification_ref,omitempty"`
	VerifiedAt           *time.Time      `json:"verified_at,omitempty"`
	VerificationProvider string          `gorm:"default:''" json:"verification_provider,omitempty"`
	VerificationError    string          `gorm:"default:''" json:"verification_error,omitempty"`

	// CloudUploads is a JSON map of cloud_file_config_id -> CloudUploadEntry.
	// Populated lazily when a job needs to pass the file to an AI model via URL/file_id.
	CloudUploads string `gorm:"default:'{}'" json:"-"`
}

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

// ResourceFolderPermission grants a user access to a shared folder.
// permission: "read" (view + download) | "write" (read + upload)
type ResourceFolderPermission struct {
	gorm.Model
	FolderID   uint   `gorm:"not null;uniqueIndex:uidx_rfp_folder_user" json:"folder_id"`
	UserID     uint   `gorm:"not null;uniqueIndex:uidx_rfp_folder_user" json:"user_id"`
	User       User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Permission string `gorm:"not null;default:'read'" json:"permission"`
}
