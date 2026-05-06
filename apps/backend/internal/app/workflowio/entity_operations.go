package workflowio

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
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
	AssetSlot       model.AssetSlot          `json:"asset_slot"`
	CandidateSlot   model.AssetSlot          `json:"candidate_asset_slot"`
	Candidate       model.AssetSlotCandidate `json:"candidate"`
	ResourceBinding model.ResourceBinding    `json:"resource_binding"`
}

func (s *EntityIOService) AttachAssetSlotCandidate(ctx context.Context, input AttachAssetSlotCandidateInput) (AttachAssetSlotCandidateResult, error) {
	return s.repo.AttachAssetSlotCandidate(ctx, input)
}
