package semantic

import "testing"

func TestProposalDraftStatusDefaultsToDraft(t *testing.T) {
	if got := ProposalDraftStatus(""); got != ProposalDraftStatusValue {
		t.Fatalf("status = %q, want draft", got)
	}
	if got := ProposalDraftStatus("confirmed"); got != "confirmed" {
		t.Fatalf("status = %q, want confirmed", got)
	}
}
