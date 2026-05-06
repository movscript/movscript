package model

import "gorm.io/gorm"

// ResourceFolderPermission grants a user access to a shared folder.
// permission: "read" (view + download) | "write" (read + upload)
type ResourceFolderPermission struct {
	gorm.Model
	FolderID   uint   `gorm:"not null;uniqueIndex:uidx_rfp_folder_user" json:"folder_id"`
	UserID     uint   `gorm:"not null;uniqueIndex:uidx_rfp_folder_user" json:"user_id"`
	User       User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Permission string `gorm:"not null;default:'read'" json:"permission"`
}
