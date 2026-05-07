package resourcefolder

import "github.com/movscript/movscript/internal/domain/model"

func FolderFromModel(folder model.ResourceFolder) Folder {
	return Folder{
		ID:             folder.ID,
		OwnerID:        folder.OwnerID,
		Owner:          UserRefFromModelPointer(folder.Owner),
		OrgID:          folder.OrgID,
		Name:           folder.Name,
		ParentID:       folder.ParentID,
		StorageBackend: folder.StorageBackend,
		IsShared:       folder.IsShared,
		ResourceCount:  folder.ResourceCount,
		CreatedAt:      folder.CreatedAt,
		UpdatedAt:      folder.UpdatedAt,
	}
}

func (folder Folder) ToModel() model.ResourceFolder {
	var target model.ResourceFolder
	folder.ApplyToModel(&target)
	return target
}

func (folder Folder) ApplyToModel(target *model.ResourceFolder) {
	target.Model.ID = folder.ID
	target.Model.CreatedAt = folder.CreatedAt
	target.Model.UpdatedAt = folder.UpdatedAt
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
		User:       UserRefFromModel(permission.User),
		Permission: permission.Permission,
		CreatedAt:  permission.CreatedAt,
		UpdatedAt:  permission.UpdatedAt,
	}
}

func (permission Permission) ToModel() model.ResourceFolderPermission {
	var target model.ResourceFolderPermission
	permission.ApplyToModel(&target)
	return target
}

func (permission Permission) ApplyToModel(target *model.ResourceFolderPermission) {
	target.Model.ID = permission.ID
	target.Model.CreatedAt = permission.CreatedAt
	target.Model.UpdatedAt = permission.UpdatedAt
	target.FolderID = permission.FolderID
	target.UserID = permission.UserID
	target.Permission = permission.Permission
}

func UserRefFromModelPointer(user *model.User) *UserRef {
	if user == nil {
		return nil
	}
	return UserRefFromModel(*user)
}

func UserRefFromModel(user model.User) *UserRef {
	if user.ID == 0 {
		return nil
	}
	return &UserRef{
		ID:           user.ID,
		Username:     user.Username,
		SystemRole:   user.SystemRole,
		PrimaryEmail: user.PrimaryEmail,
		DisplayName:  user.DisplayName,
		AvatarURL:    user.AvatarURL,
		Status:       user.Status,
	}
}
