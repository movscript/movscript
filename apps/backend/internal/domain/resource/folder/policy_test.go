package folder

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

func TestNewFolderUpdateSpecTrimsText(t *testing.T) {
	spec := NewFolderUpdateSpec(" Assets ", " local ")
	if spec.Name == nil || *spec.Name != "Assets" || spec.StorageBackend == nil || *spec.StorageBackend != "local" {
		t.Fatalf("unexpected text updates: %+v", spec)
	}
	folder := Folder{Name: "Old", StorageBackend: "old"}
	folder.ApplyUpdate(spec)
	if folder.Name != "Assets" || folder.StorageBackend != "local" {
		t.Fatalf("folder update not applied: %+v", folder)
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
