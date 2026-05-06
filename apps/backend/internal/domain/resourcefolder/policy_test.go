package resourcefolder

import "testing"

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
