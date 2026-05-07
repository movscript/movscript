package resource

import "github.com/movscript/movscript/internal/domain/model"

func RawResourceFromModel(resource model.RawResource) RawResource {
	return RawResource{
		ID:             resource.ID,
		OwnerID:        resource.OwnerID,
		Owner:          UserRefFromModel(resource.Owner),
		OrgID:          resource.OrgID,
		FolderID:       resource.FolderID,
		Type:           resource.Type,
		Name:           resource.Name,
		FilePath:       resource.FilePath,
		URL:            resource.URL,
		Size:           resource.Size,
		MimeType:       resource.MimeType,
		StorageBackend: resource.StorageBackend,
		StorageKey:     resource.StorageKey,
		IsShared:       resource.IsShared,
		DirectURL:      resource.DirectURL,
		CloudUploads:   resource.CloudUploads,
		CreatedAt:      resource.CreatedAt,
		UpdatedAt:      resource.UpdatedAt,
	}
}

func (resource RawResource) ToModel() model.RawResource {
	var target model.RawResource
	resource.ApplyToModel(&target)
	return target
}

func (resource RawResource) ApplyToModel(target *model.RawResource) {
	target.Model.ID = resource.ID
	target.Model.CreatedAt = resource.CreatedAt
	target.Model.UpdatedAt = resource.UpdatedAt
	target.OwnerID = resource.OwnerID
	target.OrgID = resource.OrgID
	target.FolderID = resource.FolderID
	target.Type = resource.Type
	target.Name = resource.Name
	target.FilePath = resource.FilePath
	target.URL = resource.URL
	target.Size = resource.Size
	target.MimeType = resource.MimeType
	target.StorageBackend = resource.StorageBackend
	target.StorageKey = resource.StorageKey
	target.IsShared = resource.IsShared
	target.DirectURL = resource.DirectURL
	target.CloudUploads = resource.CloudUploads
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
