package folder

import (
	"strings"
	"time"
)

type NewFolderSpec struct {
	OwnerID        uint
	OrgID          *uint
	Name           string
	ParentID       *uint
	StorageBackend string
}

type FolderUpdateSpec struct {
	Name           *string
	StorageBackend *string
}

type Folder struct {
	ID             uint      `json:"ID"`
	OwnerID        uint      `json:"owner_id"`
	Owner          *UserRef  `json:"owner,omitempty"`
	OrgID          *uint     `json:"org_id,omitempty"`
	Name           string    `json:"name"`
	ParentID       *uint     `json:"parent_id,omitempty"`
	StorageBackend string    `json:"storage_backend"`
	ResourceCount  int       `json:"resource_count"`
	CreatedAt      time.Time `json:"CreatedAt"`
	UpdatedAt      time.Time `json:"UpdatedAt"`
}

type UserRef struct {
	ID           uint    `json:"ID"`
	Username     string  `json:"username"`
	SystemRole   string  `json:"system_role,omitempty"`
	PrimaryEmail *string `json:"primary_email,omitempty"`
	DisplayName  string  `json:"display_name,omitempty"`
	AvatarURL    string  `json:"avatar_url,omitempty"`
	Status       string  `json:"status,omitempty"`
}

func NewFolderUpdateSpec(name string, storageBackend string) FolderUpdateSpec {
	var spec FolderUpdateSpec
	if strings.TrimSpace(name) != "" {
		trimmed := strings.TrimSpace(name)
		spec.Name = &trimmed
	}
	if strings.TrimSpace(storageBackend) != "" {
		trimmed := strings.TrimSpace(storageBackend)
		spec.StorageBackend = &trimmed
	}
	return spec
}

func (spec FolderUpdateSpec) Empty() bool {
	return spec.Name == nil &&
		spec.StorageBackend == nil
}

func (folder *Folder) ApplyUpdate(spec FolderUpdateSpec) {
	if spec.Name != nil {
		folder.Name = *spec.Name
	}
	if spec.StorageBackend != nil {
		folder.StorageBackend = *spec.StorageBackend
	}
}

func NewFolder(spec NewFolderSpec) Folder {
	return Folder{
		OwnerID:        spec.OwnerID,
		OrgID:          spec.OrgID,
		Name:           strings.TrimSpace(spec.Name),
		ParentID:       spec.ParentID,
		StorageBackend: strings.TrimSpace(spec.StorageBackend),
	}
}

func FolderInOrgScope(folderOrgID, currentOrgID *uint, ownerID uint, userID uint, includeLegacy bool) bool {
	if SameOrg(folderOrgID, currentOrgID) {
		return true
	}
	return includeLegacy && folderOrgID == nil && ownerID == userID
}

func SameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
