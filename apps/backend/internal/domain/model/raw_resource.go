package model

import "gorm.io/gorm"

type RawResource struct {
	gorm.Model
	OwnerID        uint            `gorm:"not null" json:"owner_id"`
	Owner          User            `json:"owner,omitempty"`
	OrgID          *uint           `gorm:"index" json:"org_id,omitempty"`
	FolderID       *uint           `json:"folder_id,omitempty"`
	Folder         *ResourceFolder `gorm:"foreignKey:FolderID" json:"folder,omitempty"`
	Type           string          `gorm:"not null" json:"type"` // image | video | audio | text
	Name           string          `gorm:"not null" json:"name"`
	FilePath       string          `gorm:"not null" json:"-"`
	URL            string          `gorm:"-" json:"url"`
	Size           int64           `json:"size"`
	MimeType       string          `json:"mime_type"`
	StorageBackend string          `gorm:"default:'minio'" json:"storage_backend"`
	StorageKey     string          `json:"storage_key"`
	IsShared       bool            `gorm:"default:false" json:"is_shared"`
	DirectURL      string          `gorm:"-" json:"direct_url,omitempty"` // presigned URL for cloud resources

	// CloudUploads is a JSON map of cloud_file_config_id → CloudUploadEntry.
	// Populated lazily when a job needs to pass the file to an AI model via URL/file_id.
	CloudUploads string `gorm:"default:'{}'" json:"-"`
}
