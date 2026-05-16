package semantic

import (
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestMarkAssetSlotCandidateOnlyMovesUnresolvedSlots(t *testing.T) {
	slot := AssetSlot{Status: AssetSlotStatusMissing}
	MarkSlotCandidate(&slot)
	if slot.Status != AssetSlotStatusCandidate {
		t.Fatalf("status = %q, want candidate", slot.Status)
	}

	locked := AssetSlot{Status: AssetSlotStatusLocked}
	MarkSlotCandidate(&locked)
	if locked.Status != AssetSlotStatusLocked {
		t.Fatalf("locked slot status changed to %q", locked.Status)
	}
}

func TestMarkAssetSlotLockedToCandidateCopiesLockedResource(t *testing.T) {
	resourceID := uint(42)
	candidateSlotID := uint(9)
	slot := AssetSlot{}
	candidate := AssetSlotCandidate{
		CandidateAssetSlotID: candidateSlotID,
	}

	LockSlotToCandidate(&slot, candidate, &resourceID)

	if slot.Status != AssetSlotStatusLocked {
		t.Fatalf("status = %q, want locked", slot.Status)
	}
	if slot.LockedAssetSlotID == nil || *slot.LockedAssetSlotID != candidateSlotID {
		t.Fatalf("locked candidate = %v, want %d", slot.LockedAssetSlotID, candidateSlotID)
	}
	if slot.ResourceID == nil || *slot.ResourceID != resourceID {
		t.Fatalf("resource = %v, want %d", slot.ResourceID, resourceID)
	}
}

func TestNormalizeAssetSlotCandidateKeepsDecisionStatuses(t *testing.T) {
	candidate := AssetSlotCandidate{}
	NormalizeCandidate(&candidate)
	if candidate.Status != AssetSlotCandidateStatusCandidate {
		t.Fatalf("status = %q, want candidate", candidate.Status)
	}

	selected := AssetSlotCandidate{Status: AssetSlotCandidateStatusSelected}
	NormalizeCandidate(&selected)
	if selected.Status != AssetSlotCandidateStatusSelected {
		t.Fatalf("selected status changed to %q", selected.Status)
	}
}

func TestModelAssetCandidateAdaptersKeepBehavior(t *testing.T) {
	candidateSlotID := uint(9)
	slot := model.AssetSlot{Status: AssetSlotStatusMissing}
	MarkAssetSlotCandidate(&slot)
	if slot.Status != AssetSlotStatusCandidate {
		t.Fatalf("status = %q, want candidate", slot.Status)
	}

	candidate := model.AssetSlotCandidate{
		CandidateAssetSlotID: candidateSlotID,
	}
	MarkAssetSlotLockedToCandidate(&slot, candidate)
	if slot.LockedAssetSlotID == nil || *slot.LockedAssetSlotID != candidateSlotID {
		t.Fatalf("unexpected locked model slot: %+v", slot)
	}
	if slot.ResourceID != nil {
		t.Fatalf("model adapter should not infer candidate resource without an explicit resource id: %+v", slot)
	}
}
