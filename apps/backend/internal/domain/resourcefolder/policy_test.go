package resourcefolder

import "testing"

func TestNewFolderTrimsMutableText(t *testing.T) {
	folder := NewFolder(NewFolderSpec{OwnerID: 1, Name: " Assets ", StorageBackend: " local "})
	if folder.OwnerID != 1 || folder.Name != "Assets" || folder.StorageBackend != "local" {
		t.Fatalf("unexpected folder: %+v", folder)
	}
	modelFolder := folder.ToModel()
	modelFolder.ID = 15
	roundTrip := FolderFromModel(modelFolder)
	if roundTrip.ID != 15 || roundTrip.Name != "Assets" || roundTrip.StorageBackend != "local" {
		t.Fatalf("unexpected folder round-trip: %+v", roundTrip)
	}
}

func TestNewFolderUpdateSpecTrimsAndPreservesFalse(t *testing.T) {
	shared := false
	spec := NewFolderUpdateSpec(" Assets ", " local ", &shared)
	if spec.Name == nil || *spec.Name != "Assets" || spec.StorageBackend == nil || *spec.StorageBackend != "local" {
		t.Fatalf("unexpected text updates: %+v", spec)
	}
	if spec.IsShared == nil || *spec.IsShared {
		t.Fatalf("expected false sharing update: %+v", spec)
	}
	folder := Folder{Name: "Old", StorageBackend: "old", IsShared: true}
	folder.ApplyUpdate(spec)
	if folder.Name != "Assets" || folder.StorageBackend != "local" || folder.IsShared {
		t.Fatalf("folder update not applied: %+v", folder)
	}
}

func TestNormalizeAndValidatePermission(t *testing.T) {
	if got := NormalizePermission(""); got != PermissionRead {
		t.Fatalf("permission = %q, want read", got)
	}
	if got := NormalizePermission(" Write "); got != PermissionWrite {
		t.Fatalf("permission = %q, want write", got)
	}
	if !ValidPermission(PermissionRead) || !ValidPermission(PermissionWrite) || ValidPermission("admin") {
		t.Fatal("unexpected permission validation result")
	}
}

func TestNewPermissionAppliesDefault(t *testing.T) {
	perm := NewPermission(1, 2, "")
	if perm.FolderID != 1 || perm.UserID != 2 || perm.Permission != PermissionRead {
		t.Fatalf("unexpected permission: %+v", perm)
	}
	modelPerm := perm.ToModel()
	modelPerm.ID = 16
	roundTrip := PermissionFromModel(modelPerm)
	if roundTrip.ID != 16 || roundTrip.Permission != PermissionRead {
		t.Fatalf("unexpected permission round-trip: %+v", roundTrip)
	}
}

func TestFolderInOrgScope(t *testing.T) {
	var org uint = 3
	if !FolderInOrgScope(&org, &org, 1, 2, false) {
		t.Fatal("expected same org to be in scope")
	}
	if !FolderInOrgScope(nil, &org, 7, 7, true) {
		t.Fatal("expected legacy personal folder to be in personal org scope")
	}
	if FolderInOrgScope(nil, &org, 7, 8, true) {
		t.Fatal("expected another owner's legacy folder to be outside scope")
	}
}

func TestParsePermissionID(t *testing.T) {
	id, err := ParsePermissionID("12")
	if err != nil || id != 12 {
		t.Fatalf("unexpected id: %d err=%v", id, err)
	}
}
