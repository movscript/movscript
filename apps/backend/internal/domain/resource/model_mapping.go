package resource

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func RawResourceFromModel(resource persistencemodel.RawResource) RawResource {
	return RawResource{
		ID:                   resource.ID,
		OwnerID:              resource.OwnerID,
		Owner:                UserRefFromModel(resource.Owner),
		OrgID:                resource.OrgID,
		FolderID:             resource.FolderID,
		Type:                 resource.Type,
		Name:                 resource.Name,
		FilePath:             resource.FilePath,
		URL:                  resource.URL,
		Size:                 resource.Size,
		MimeType:             resource.MimeType,
		StorageBackend:       resource.StorageBackend,
		StorageKey:           resource.StorageKey,
		IsShared:             resource.IsShared,
		DirectURL:            resource.DirectURL,
		VerificationStatus:   resource.VerificationStatus,
		VerificationRef:      resource.VerificationRef,
		VerifiedAt:           resource.VerifiedAt,
		VerificationProvider: resource.VerificationProvider,
		VerificationError:    resource.VerificationError,
		CloudUploads:         resource.CloudUploads,
		CreatedAt:            resource.CreatedAt,
		UpdatedAt:            resource.UpdatedAt,
	}
}

func (resource RawResource) ToModel() persistencemodel.RawResource {
	var target persistencemodel.RawResource
	resource.ApplyToModel(&target)
	return target
}

func (resource RawResource) ApplyToModel(target *persistencemodel.RawResource) {
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
	target.VerificationStatus = resource.VerificationStatus
	target.VerificationRef = resource.VerificationRef
	target.VerifiedAt = resource.VerifiedAt
	target.VerificationProvider = resource.VerificationProvider
	target.VerificationError = resource.VerificationError
	target.CloudUploads = resource.CloudUploads
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
