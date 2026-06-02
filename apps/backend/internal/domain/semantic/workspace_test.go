package semantic

import "testing"

func TestWorkspaceWorkspaceStatusDefaultsToWorkspace(t *testing.T) {
	if got := WorkspaceWorkspaceStatus(""); got != WorkspaceWorkspaceStatusValue {
		t.Fatalf("status = %q, want workspace", got)
	}
	if got := WorkspaceWorkspaceStatus("confirmed"); got != "confirmed" {
		t.Fatalf("status = %q, want confirmed", got)
	}
}
