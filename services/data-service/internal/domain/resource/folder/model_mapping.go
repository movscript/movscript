package folder

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func FolderFromModel(folder persistencemodel.ResourceFolder) Folder {
	return Folder{
		ID:             folder.ID,
		OwnerID:        folder.OwnerID,
		OrgID:          folder.OrgID,
		Name:           folder.Name,
		ParentID:       folder.ParentID,
		StorageBackend: folder.StorageBackend,
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
	target.ResourceCount = folder.ResourceCount
}
