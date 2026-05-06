package resourcefolder

import "strconv"

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
