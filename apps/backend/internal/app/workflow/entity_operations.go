package workflow

import (
	"context"

	domainresourcebinding "github.com/movscript/movscript/internal/domain/resource/binding"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type AttachAssetSlotCandidateInput struct {
	ProjectID   uint
	AssetSlotID uint
	ResourceID  uint
	SourceType  string
	SourceID    *uint
	CanvasID    uint
	RunID       uint
	NodeID      string
	UserID      uint
	Score       float64
	Note        string
	Slot        string
}

type AttachAssetSlotCandidateResult struct {
	AssetSlot       domainsemantic.AssetSlot          `json:"asset_slot"`
	CandidateSlot   domainsemantic.AssetSlot          `json:"candidate_asset_slot"`
	Candidate       domainsemantic.AssetSlotCandidate `json:"candidate"`
	ResourceBinding domainresourcebinding.Binding     `json:"resource_binding"`
}

func (s *EntityIOService) AttachAssetSlotCandidate(ctx context.Context, input AttachAssetSlotCandidateInput) (AttachAssetSlotCandidateResult, error) {
	return s.repo.AttachAssetSlotCandidate(ctx, input)
}
