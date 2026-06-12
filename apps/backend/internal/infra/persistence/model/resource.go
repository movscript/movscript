package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type RawResource struct {
	gorm.Model
	OwnerID              uint            `gorm:"not null" json:"owner_id"`
	Owner                User            `json:"owner,omitempty"`
	OrgID                *uint           `gorm:"index" json:"org_id,omitempty"`
	BlobID               *uint           `gorm:"index" json:"blob_id,omitempty"`
	Blob                 *ResourceBlob   `gorm:"foreignKey:BlobID" json:"-"`
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

func (*RawResource) BeforeUpdate(tx *gorm.DB) error {
	if tx.Statement.Changed("FilePath", "StorageBackend", "StorageKey", "Type", "MimeType", "Size") {
		return errors.New("resource content identity is immutable")
	}
	return nil
}

type ResourceBlob struct {
	gorm.Model
	Hash           string `gorm:"uniqueIndex;not null;size:128" json:"hash"`
	StorageBackend string `gorm:"not null;index;uniqueIndex:uidx_resource_blobs_backend_key;size:64" json:"storage_backend"`
	StorageKey     string `gorm:"not null;uniqueIndex:uidx_resource_blobs_backend_key;size:512" json:"storage_key"`
	Size           int64  `json:"size"`
	MimeType       string `json:"mime_type"`
	RefCount       int    `gorm:"not null;default:0" json:"ref_count"`
}

func (*ResourceBlob) BeforeUpdate(tx *gorm.DB) error {
	if tx.Statement.Changed("Hash", "StorageBackend", "StorageKey", "Size", "MimeType") {
		return errors.New("resource blob content identity is immutable")
	}
	return nil
}

type ResourceDerivative struct {
	gorm.Model
	OutputResourceID uint        `gorm:"not null;uniqueIndex" json:"output_resource_id"`
	OutputResource   RawResource `gorm:"foreignKey:OutputResourceID;constraint:OnDelete:CASCADE" json:"-"`
	Operation        string      `gorm:"not null;index;size:128" json:"operation"`
	Tool             string      `gorm:"default:'';size:128" json:"tool,omitempty"`
	InputResourceIDs string      `gorm:"type:text;not null;default:'[]'" json:"input_resource_ids"`
	Params           string      `gorm:"type:text;not null;default:'{}'" json:"params"`
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
