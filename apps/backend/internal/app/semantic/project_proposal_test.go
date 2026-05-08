package semantic

import (
	"context"
	"errors"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestApplyProjectProposalCreatesProjectOwnedReferencesAndAssets(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalOperation{{
				Action: "create",
				Entity: "creativeReferences",
				Payload: map[string]any{
					"name":   "Lin Xia",
					"kind":   "person",
					"status": "confirmed",
				},
			}},
			AssetSlots: []ProjectProposalOperation{{
				Action: "create",
				Entity: "assetSlots",
				Payload: map[string]any{
					"name":     "Lin Xia portrait",
					"kind":     "image",
					"priority": "high",
				},
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project proposal: %v", err)
	}
	if resp.Counts.CreativeReferencesCreated != 1 || resp.Counts.AssetSlotsCreated != 1 {
		t.Fatalf("unexpected counts: %+v", resp.Counts)
	}

	var reference model.CreativeReference
	if err := db.First(&reference).Error; err != nil {
		t.Fatalf("load creative reference: %v", err)
	}
	if reference.ProjectID != 1 || reference.Name != "Lin Xia" || reference.Kind != "person" {
		t.Fatalf("unexpected creative reference: %+v", reference)
	}

	var slot model.AssetSlot
	if err := db.First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.ProjectID != 1 || slot.Name != "Lin Xia portrait" || slot.Priority != "high" {
		t.Fatalf("unexpected asset slot: %+v", slot)
	}
}

func TestApplyProjectProposalRejectsAssetSlotReferenceOutsideProjectAndRollsBack(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	foreignReference := model.CreativeReference{
		ProjectID: 2,
		Name:      "Foreign",
		Kind:      "person",
		Status:    "confirmed",
	}
	if err := db.Create(&foreignReference).Error; err != nil {
		t.Fatalf("create foreign reference: %v", err)
	}

	_, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			AssetSlots: []ProjectProposalOperation{{
				Action: "create",
				Entity: "assetSlots",
				Payload: map[string]any{
					"name":                  "Foreign portrait",
					"kind":                  "image",
					"creative_reference_id": float64(foreignReference.ID),
				},
			}},
		},
	})
	if !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("error = %v, want ErrOwnerWrongProject", err)
	}

	var slots int64
	if err := db.Model(&model.AssetSlot{}).Where("project_id = ?", 1).Count(&slots).Error; err != nil {
		t.Fatalf("count asset slots: %v", err)
	}
	if slots != 0 {
		t.Fatalf("asset slots after rollback = %d, want 0", slots)
	}
}

func TestApplyProjectProposalTreatsReuseAsNoop(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	reference := model.CreativeReference{
		ProjectID: 1,
		Name:      "Existing",
		Kind:      "person",
		Status:    "confirmed",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}

	asset := model.AssetSlot{
		ProjectID:            1,
		CreativeReferenceID:  &reference.ID,
		Name:                 "Existing asset",
		Kind:                 "image",
		Status:               "missing",
	}
	if err := db.Create(&asset).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalOperation{{
				Action: "reuse",
				Entity: "creativeReferences",
				ID:     &reference.ID,
			}},
			AssetSlots: []ProjectProposalOperation{{
				Action: "reuse",
				Entity: "assetSlots",
				ID:     &asset.ID,
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project proposal reuse noop: %v", err)
	}
	if resp.Counts.CreativeReferencesCreated != 0 || resp.Counts.CreativeReferencesUpdated != 0 || resp.Counts.AssetSlotsCreated != 0 || resp.Counts.AssetSlotsUpdated != 0 {
		t.Fatalf("unexpected counts for reuse noop: %+v", resp.Counts)
	}

	var referenceCount int64
	if err := db.Model(&model.CreativeReference{}).Where("project_id = ? AND status <> ?", 1, "merged").Count(&referenceCount).Error; err != nil {
		t.Fatalf("count creative references: %v", err)
	}
	if referenceCount != 1 {
		t.Fatalf("creative references = %d, want 1", referenceCount)
	}

	var assetCount int64
	if err := db.Model(&model.AssetSlot{}).Where("project_id = ?", 1).Count(&assetCount).Error; err != nil {
		t.Fatalf("count asset slots: %v", err)
	}
	if assetCount != 1 {
		t.Fatalf("asset slots = %d, want 1", assetCount)
	}
}
