package resourcefolder

import (
	"strconv"
	"strings"
)

const (
	PermissionRead  = "read"
	PermissionWrite = "write"
)

type NewFolderSpec struct {
	OwnerID        uint
	OrgID          *uint
	Name           string
	ParentID       *uint
	StorageBackend string
	IsShared       bool
}

type Folder struct {
	ID             uint
	OwnerID        uint
	OrgID          *uint
	Name           string
	ParentID       *uint
	StorageBackend string
	IsShared       bool
	ResourceCount  int
}

type Permission struct {
	ID         uint
	FolderID   uint
	UserID     uint
	Permission string
}

func NewFolder(spec NewFolderSpec) Folder {
	return Folder{
		OwnerID:        spec.OwnerID,
		OrgID:          spec.OrgID,
		Name:           strings.TrimSpace(spec.Name),
		ParentID:       spec.ParentID,
		StorageBackend: strings.TrimSpace(spec.StorageBackend),
		IsShared:       spec.IsShared,
	}
}

func NormalizePermission(permission string) string {
	permission = strings.TrimSpace(strings.ToLower(permission))
	if permission == "" {
		return PermissionRead
	}
	return permission
}

func ValidPermission(permission string) bool {
	switch permission {
	case PermissionRead, PermissionWrite:
		return true
	default:
		return false
	}
}

func NewPermission(folderID uint, userID uint, permission string) Permission {
	return Permission{
		FolderID:   folderID,
		UserID:     userID,
		Permission: NormalizePermission(permission),
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

func ParsePermissionID(raw string) (uint, error) {
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(n), nil
}
