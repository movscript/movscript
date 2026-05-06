package semantic

import "github.com/movscript/movscript/internal/domain/model"

const (
	AssetSlotStatusMissing   = "missing"
	AssetSlotStatusCandidate = "candidate"
	AssetSlotStatusLocked    = "locked"
	AssetSlotStatusWaived    = "waived"
	AssetSlotStatusDraft     = "draft"

	AssetSlotCandidateStatusCandidate = "candidate"
	AssetSlotCandidateStatusSelected  = "selected"
	AssetSlotCandidateStatusRejected  = "rejected"

	CandidateDecisionTypeAssetSlotCandidate = "asset_slot_candidate"
	CandidateDecisionAccept                 = "accept"
	CandidateDecisionStatusApplied          = "applied"
	CandidateDecisionSourceManual           = "manual"

	ReviewEventTypeApplied  = "applied"
	ReviewEventSourceManual = "manual"
)

func MarkAssetSlotCandidate(slot *model.AssetSlot) {
	if slot.Status == "" || slot.Status == AssetSlotStatusMissing || slot.Status == AssetSlotStatusDraft {
		slot.Status = AssetSlotStatusCandidate
	}
}

func MarkAssetSlotLockedToCandidate(slot *model.AssetSlot, candidate model.AssetSlotCandidate) {
	lockedAssetSlotID := candidate.CandidateAssetSlotID
	slot.Status = AssetSlotStatusLocked
	slot.LockedAssetSlotID = &lockedAssetSlotID
	if candidate.CandidateAssetSlot != nil {
		slot.ResourceID = candidate.CandidateAssetSlot.ResourceID
	}
}

func SelectAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	candidate.Status = AssetSlotCandidateStatusSelected
}

func RejectAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	candidate.Status = AssetSlotCandidateStatusRejected
}

func NormalizeAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	if candidate.Status == "" || candidate.Status == "pending" {
		candidate.Status = AssetSlotCandidateStatusCandidate
	}
}
