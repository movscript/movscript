package semantic

import (
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func AssetSlotFromModel(slot model.AssetSlot) AssetSlot {
	return AssetSlot{
		ID:                       slot.ID,
		ProjectID:                slot.ProjectID,
		ProductionID:             slot.ProductionID,
		CreativeReferenceID:      slot.CreativeReferenceID,
		CreativeReferenceStateID: slot.CreativeReferenceStateID,
		OwnerType:                slot.OwnerType,
		OwnerID:                  slot.OwnerID,
		Kind:                     slot.Kind,
		Name:                     slot.Name,
		Description:              slot.Description,
		SlotKey:                  slot.SlotKey,
		PromptHint:               slot.PromptHint,
		Status:                   slot.Status,
		Priority:                 slot.Priority,
		ResourceID:               slot.ResourceID,
		LockedAssetSlotID:        slot.LockedAssetSlotID,
		MetadataJSON:             slot.MetadataJSON,
	}
}

func (slot AssetSlot) ToModel() model.AssetSlot {
	return model.AssetSlot{
		Model:                    gorm.Model{ID: slot.ID},
		ProjectID:                slot.ProjectID,
		ProductionID:             slot.ProductionID,
		CreativeReferenceID:      slot.CreativeReferenceID,
		CreativeReferenceStateID: slot.CreativeReferenceStateID,
		OwnerType:                slot.OwnerType,
		OwnerID:                  slot.OwnerID,
		Kind:                     slot.Kind,
		Name:                     slot.Name,
		Description:              slot.Description,
		SlotKey:                  slot.SlotKey,
		PromptHint:               slot.PromptHint,
		Status:                   slot.Status,
		Priority:                 slot.Priority,
		ResourceID:               slot.ResourceID,
		LockedAssetSlotID:        slot.LockedAssetSlotID,
		MetadataJSON:             slot.MetadataJSON,
	}
}

func AssetSlotCandidateFromModel(candidate model.AssetSlotCandidate) AssetSlotCandidate {
	return AssetSlotCandidate{
		ID:                   candidate.ID,
		ProjectID:            candidate.ProjectID,
		AssetSlotID:          candidate.AssetSlotID,
		CandidateAssetSlotID: candidate.CandidateAssetSlotID,
		SourceType:           candidate.SourceType,
		SourceID:             candidate.SourceID,
		Score:                candidate.Score,
		Status:               candidate.Status,
		Note:                 candidate.Note,
	}
}

func (candidate AssetSlotCandidate) ToModel() model.AssetSlotCandidate {
	return model.AssetSlotCandidate{
		Model:                gorm.Model{ID: candidate.ID},
		ProjectID:            candidate.ProjectID,
		AssetSlotID:          candidate.AssetSlotID,
		CandidateAssetSlotID: candidate.CandidateAssetSlotID,
		SourceType:           candidate.SourceType,
		SourceID:             candidate.SourceID,
		Score:                candidate.Score,
		Status:               candidate.Status,
		Note:                 candidate.Note,
	}
}
