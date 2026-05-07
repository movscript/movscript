package resourcefolder

import "github.com/movscript/movscript/internal/domain/model"

func FolderFromModel(folder model.ResourceFolder) Folder {
	return Folder{
		ID:             folder.ID,
		OwnerID:        folder.OwnerID,
		OrgID:          folder.OrgID,
		Name:           folder.Name,
		ParentID:       folder.ParentID,
		StorageBackend: folder.StorageBackend,
		IsShared:       folder.IsShared,
		ResourceCount:  folder.ResourceCount,
	}
}

func (folder Folder) ToModel() model.ResourceFolder {
	var target model.ResourceFolder
	folder.ApplyToModel(&target)
	return target
}

func (folder Folder) ApplyToModel(target *model.ResourceFolder) {
	target.Model.ID = folder.ID
	target.OwnerID = folder.OwnerID
	target.OrgID = folder.OrgID
	target.Name = folder.Name
	target.ParentID = folder.ParentID
	target.StorageBackend = folder.StorageBackend
	target.IsShared = folder.IsShared
	target.ResourceCount = folder.ResourceCount
}

func PermissionFromModel(permission model.ResourceFolderPermission) Permission {
	return Permission{
		ID:         permission.ID,
		FolderID:   permission.FolderID,
		UserID:     permission.UserID,
		Permission: permission.Permission,
	}
}

func (permission Permission) ToModel() model.ResourceFolderPermission {
	var target model.ResourceFolderPermission
	permission.ApplyToModel(&target)
	return target
}

func (permission Permission) ApplyToModel(target *model.ResourceFolderPermission) {
	target.Model.ID = permission.ID
	target.FolderID = permission.FolderID
	target.UserID = permission.UserID
	target.Permission = permission.Permission
}
