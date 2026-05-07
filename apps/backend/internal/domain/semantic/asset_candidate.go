package semantic

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

func MarkSlotCandidate(slot *AssetSlot) {
	if slot.Status == "" || slot.Status == AssetSlotStatusMissing || slot.Status == AssetSlotStatusDraft {
		slot.Status = AssetSlotStatusCandidate
	}
}

func LockSlotToCandidate(slot *AssetSlot, candidate AssetSlotCandidate, candidateResourceID *uint) {
	lockedAssetSlotID := candidate.CandidateAssetSlotID
	slot.Status = AssetSlotStatusLocked
	slot.LockedAssetSlotID = &lockedAssetSlotID
	if candidateResourceID != nil {
		slot.ResourceID = candidateResourceID
	}
}

func SelectCandidate(candidate *AssetSlotCandidate) {
	candidate.Status = AssetSlotCandidateStatusSelected
}

func RejectCandidate(candidate *AssetSlotCandidate) {
	candidate.Status = AssetSlotCandidateStatusRejected
}

func NormalizeCandidate(candidate *AssetSlotCandidate) {
	if candidate.Status == "" || candidate.Status == "pending" {
		candidate.Status = AssetSlotCandidateStatusCandidate
	}
}
