package semantic

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestMarkAssetSlotCandidateOnlyMovesUnresolvedSlots(t *testing.T) {
	slot := model.AssetSlot{Status: AssetSlotStatusMissing}
	MarkAssetSlotCandidate(&slot)
	if slot.Status != AssetSlotStatusCandidate {
		t.Fatalf("status = %q, want candidate", slot.Status)
	}

	locked := model.AssetSlot{Status: AssetSlotStatusLocked}
	MarkAssetSlotCandidate(&locked)
	if locked.Status != AssetSlotStatusLocked {
		t.Fatalf("locked slot status changed to %q", locked.Status)
	}
}

func TestMarkAssetSlotLockedToCandidateCopiesLockedResource(t *testing.T) {
	resourceID := uint(42)
	candidateSlotID := uint(9)
	slot := model.AssetSlot{}
	candidate := model.AssetSlotCandidate{
		CandidateAssetSlotID: candidateSlotID,
		CandidateAssetSlot:   &model.AssetSlot{ResourceID: &resourceID},
	}

	MarkAssetSlotLockedToCandidate(&slot, candidate)

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
	candidate := model.AssetSlotCandidate{}
	NormalizeAssetSlotCandidate(&candidate)
	if candidate.Status != AssetSlotCandidateStatusCandidate {
		t.Fatalf("status = %q, want candidate", candidate.Status)
	}

	selected := model.AssetSlotCandidate{Status: AssetSlotCandidateStatusSelected}
	NormalizeAssetSlotCandidate(&selected)
	if selected.Status != AssetSlotCandidateStatusSelected {
		t.Fatalf("selected status changed to %q", selected.Status)
	}
}
