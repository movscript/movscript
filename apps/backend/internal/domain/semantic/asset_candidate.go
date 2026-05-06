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
	domainSlot := AssetSlotFromModel(*slot)
	MarkSlotCandidate(&domainSlot)
	*slot = domainSlot.ToModel()
}

func MarkAssetSlotLockedToCandidate(slot *model.AssetSlot, candidate model.AssetSlotCandidate) {
	domainSlot := AssetSlotFromModel(*slot)
	domainCandidate := AssetSlotCandidateFromModel(candidate)
	var candidateResourceID *uint
	if candidate.CandidateAssetSlot != nil {
		candidateResourceID = candidate.CandidateAssetSlot.ResourceID
	}
	LockSlotToCandidate(&domainSlot, domainCandidate, candidateResourceID)
	*slot = domainSlot.ToModel()
}

func SelectAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	SelectCandidate(&domainCandidate)
	*candidate = domainCandidate.ToModel()
}

func RejectAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	RejectCandidate(&domainCandidate)
	*candidate = domainCandidate.ToModel()
}

func NormalizeAssetSlotCandidate(candidate *model.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	NormalizeCandidate(&domainCandidate)
	*candidate = domainCandidate.ToModel()
}

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
