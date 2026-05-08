package resourcefolder

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func FolderFromModel(folder persistencemodel.ResourceFolder) Folder {
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

func (folder Folder) ToModel() persistencemodel.ResourceFolder {
	var target persistencemodel.ResourceFolder
	folder.ApplyToModel(&target)
	return target
}

func (folder Folder) ApplyToModel(target *persistencemodel.ResourceFolder) {
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

func PermissionFromModel(permission persistencemodel.ResourceFolderPermission) Permission {
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

func (permission Permission) ToModel() persistencemodel.ResourceFolderPermission {
	var target persistencemodel.ResourceFolderPermission
	permission.ApplyToModel(&target)
	return target
}

func (permission Permission) ApplyToModel(target *persistencemodel.ResourceFolderPermission) {
	target.Model.ID = permission.ID
	target.Model.CreatedAt = permission.CreatedAt
	target.Model.UpdatedAt = permission.UpdatedAt
	target.FolderID = permission.FolderID
	target.UserID = permission.UserID
	target.Permission = permission.Permission
}

func UserRefFromModelPointer(user any) *UserRef {
	return UserRefFromModel(user)
}

func UserRefFromModel(input any) *UserRef {
	user := userRefFields(input)
	if user.id == 0 {
		return nil
	}
	return &UserRef{
		ID:           user.id,
		Username:     user.username,
		SystemRole:   user.systemRole,
		PrimaryEmail: user.primaryEmail,
		DisplayName:  user.displayName,
		AvatarURL:    user.avatarURL,
		Status:       user.status,
	}
}

type userRefSnapshot struct {
	id           uint
	username     string
	systemRole   string
	primaryEmail *string
	displayName  string
	avatarURL    string
	status       string
}

func userRefFields(input any) userRefSnapshot {
	switch user := input.(type) {
	case persistencemodel.User:
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, displayName: user.DisplayName, avatarURL: user.AvatarURL, status: user.Status}
	case *persistencemodel.User:
		if user == nil {
			return userRefSnapshot{}
		}
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, displayName: user.DisplayName, avatarURL: user.AvatarURL, status: user.Status}
	default:
		return userRefSnapshot{}
	}
}
