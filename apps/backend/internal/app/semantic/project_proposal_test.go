package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestApplyProjectProposalUpdatesProjectStyle(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	project := model.Project{Name: "Style project", Description: "Original", AspectRatio: "1:1", ProjectStyle: `{"camera_language":"locked tripod"}`}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	aspectRatio := "9:16"
	visualStyle := "竖屏短剧写实，肤色自然，道具轮廓清晰"
	lightingStyle := "柔和日光，避免过曝"

	resp, err := service.ApplyProjectProposal(context.Background(), project.ID, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			ProjectStyle: &ProjectStylePatch{
				AspectRatio:    &aspectRatio,
				VisualStyle:    &visualStyle,
				LightingStyle:  &lightingStyle,
				ShotSizeSystem: []string{"特写", "中景", "全景"},
				NegativeRules:  []string{"不要随机改脸", "不要让字幕遮挡主体"},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply project style proposal: %v", err)
	}
	if resp.Counts.ProjectStyleUpdated != 1 {
		t.Fatalf("project_style_updated = %d, want 1", resp.Counts.ProjectStyleUpdated)
	}

	var updated model.Project
	if err := db.First(&updated, project.ID).Error; err != nil {
		t.Fatalf("load updated project: %v", err)
	}
	if updated.AspectRatio != aspectRatio || updated.VisualStyle != visualStyle {
		t.Fatalf("unexpected project globals: aspect=%q visual=%q", updated.AspectRatio, updated.VisualStyle)
	}
	var style map[string]any
	if err := json.Unmarshal([]byte(updated.ProjectStyle), &style); err != nil {
		t.Fatalf("parse project style json: %v", err)
	}
	if style["camera_language"] != "locked tripod" || style["lighting_style"] != lightingStyle {
		t.Fatalf("unexpected merged project style: %#v", style)
	}
}

func TestApplyProjectProposalMergesPartialReferencesAndAssets(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ClientID: "cr_lin_xia",
				Name:     "Lin Xia",
				Kind:     "person",
				Status:   "confirmed",
			}},
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				Owner:    &ProjectProposalOwnerRef{Type: "creative_reference", ClientID: "cr_lin_xia"},
				Name:     "Lin Xia portrait",
				Kind:     "image",
				Priority: "high",
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
	if err := db.Where("project_id = ? AND name = ?", 1, "Lin Xia").First(&reference).Error; err != nil {
		t.Fatalf("load creative reference: %v", err)
	}
	if reference.Kind != "person" || reference.Status != "confirmed" {
		t.Fatalf("unexpected creative reference: %+v", reference)
	}

	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "Lin Xia portrait").First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.Priority != "high" {
		t.Fatalf("asset slot priority = %q, want high", slot.Priority)
	}
	if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != reference.ID {
		t.Fatalf("asset slot creative_reference_id = %v, want %d", slot.CreativeReferenceID, reference.ID)
	}
	if slot.OwnerType != "creative_reference" || slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("asset slot owner = %s/%v, want creative_reference/%d", slot.OwnerType, slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectProposalSnapshotKeepsCreatedRows(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Mode: "snapshot",
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ClientID: "cr_new",
				Name:     "New reference",
				Kind:     "person",
				Status:   "confirmed",
			}},
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				ClientID: "slot_new",
				Owner:    &ProjectProposalOwnerRef{Type: "creative_reference", ClientID: "cr_new"},
				Name:     "New reference portrait",
				Kind:     "image",
				Status:   "missing",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot project proposal: %v", err)
	}
	if resp.Counts.CreativeReferencesCreated != 1 || resp.Counts.AssetSlotsCreated != 1 {
		t.Fatalf("unexpected create counts: %+v", resp.Counts)
	}
	if resp.Counts.CreativeReferencesDeleted != 0 || resp.Counts.AssetSlotsDeleted != 0 {
		t.Fatalf("created rows were treated as omitted: %+v", resp.Counts)
	}

	var reference model.CreativeReference
	if err := db.Where("project_id = ? AND name = ?", 1, "New reference").First(&reference).Error; err != nil {
		t.Fatalf("load creative reference: %v", err)
	}
	if reference.Status != "confirmed" {
		t.Fatalf("reference status = %q, want confirmed", reference.Status)
	}
	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "New reference portrait").First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.Status != "missing" {
		t.Fatalf("slot status = %q, want missing", slot.Status)
	}
	if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != reference.ID {
		t.Fatalf("slot creative_reference_id = %v, want %d", slot.CreativeReferenceID, reference.ID)
	}
	if resp.CanonicalSnapshot == nil || len(resp.CanonicalSnapshot.CreativeReferences) != 1 || resp.CanonicalSnapshot.CreativeReferences[0].ID == nil {
		t.Fatalf("canonical snapshot did not include created reference with backend id: %#v", resp.CanonicalSnapshot)
	}
}

func TestApplyProjectProposalOnlyPatchesMentionedFields(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	reference := model.CreativeReference{
		ProjectID:   1,
		Name:        "Old name",
		Kind:        "person",
		Description: "Original description",
		Importance:  "high",
		Status:      "confirmed",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	slot := model.AssetSlot{
		ProjectID:   1,
		Name:        "Old asset",
		Kind:        "image",
		Description: "Keep description",
		Priority:    "medium",
		Status:      "missing",
	}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}

	_, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ID:   &reference.ID,
				Name: "New name",
			}},
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				ID: &slot.ID,
				Owner: &ProjectProposalOwnerRef{
					Type: "creative_reference",
					ID:   &reference.ID,
				},
				Priority: "high",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project proposal: %v", err)
	}

	var updatedReference model.CreativeReference
	if err := db.First(&updatedReference, reference.ID).Error; err != nil {
		t.Fatalf("load updated reference: %v", err)
	}
	if updatedReference.Name != "New name" || updatedReference.Description != "Original description" || updatedReference.Importance != "high" {
		t.Fatalf("unexpected partial reference patch: %+v", updatedReference)
	}

	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("load updated slot: %v", err)
	}
	if updatedSlot.Priority != "high" || updatedSlot.Description != "Keep description" || updatedSlot.Status != "missing" {
		t.Fatalf("unexpected partial asset patch: %+v", updatedSlot)
	}
	if updatedSlot.OwnerType != "creative_reference" || updatedSlot.OwnerID == nil || *updatedSlot.OwnerID != reference.ID {
		t.Fatalf("asset slot owner = %s/%v, want creative_reference/%d", updatedSlot.OwnerType, updatedSlot.OwnerID, reference.ID)
	}
}

func TestApplyProjectProposalSoftDeletesSnapshotOmissions(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	reference := model.CreativeReference{
		ProjectID:   1,
		Name:        "Removed reference",
		Kind:        "person",
		Description: "No longer needed",
		Status:      "confirmed",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	slot := model.AssetSlot{
		ProjectID:   1,
		Name:        "Removed six-view",
		Kind:        "image",
		Description: "No longer needed",
		Status:      "missing",
	}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Mode: "patch",
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ID:     &reference.ID,
				Name:   "Removed reference",
				Status: "ignored",
			}},
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				ID:     &slot.ID,
				Name:   "Removed six-view",
				Kind:   "image",
				Status: "waived",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project proposal soft delete: %v", err)
	}
	if resp.Counts.CreativeReferencesDeleted != 1 || resp.Counts.AssetSlotsDeleted != 1 {
		t.Fatalf("unexpected delete counts: %+v", resp.Counts)
	}

	var updatedReference model.CreativeReference
	if err := db.First(&updatedReference, reference.ID).Error; err != nil {
		t.Fatalf("load reference: %v", err)
	}
	if updatedReference.Status != "ignored" {
		t.Fatalf("reference status = %q, want ignored", updatedReference.Status)
	}
	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("load slot: %v", err)
	}
	if updatedSlot.Status != "waived" {
		t.Fatalf("slot status = %q, want waived", updatedSlot.Status)
	}
}

func TestApplyProjectProposalSnapshotModeDeletesOmittedActiveItems(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	kept := model.CreativeReference{ProjectID: 1, Name: "Kept", Kind: "person", Status: "confirmed"}
	removed := model.CreativeReference{ProjectID: 1, Name: "Removed", Kind: "prop", Status: "confirmed"}
	ignored := model.CreativeReference{ProjectID: 1, Name: "Already ignored", Kind: "prop", Status: "ignored"}
	if err := db.Create(&kept).Error; err != nil {
		t.Fatalf("create kept reference: %v", err)
	}
	if err := db.Create(&removed).Error; err != nil {
		t.Fatalf("create removed reference: %v", err)
	}
	if err := db.Create(&ignored).Error; err != nil {
		t.Fatalf("create ignored reference: %v", err)
	}
	keptSlot := model.AssetSlot{ProjectID: 1, Name: "Kept front", Kind: "image", Status: "missing"}
	removedSlot := model.AssetSlot{ProjectID: 1, Name: "Removed front", Kind: "image", Status: "missing"}
	if err := db.Create(&keptSlot).Error; err != nil {
		t.Fatalf("create kept slot: %v", err)
	}
	if err := db.Create(&removedSlot).Error; err != nil {
		t.Fatalf("create removed slot: %v", err)
	}

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Mode: "snapshot",
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ID:   &kept.ID,
				Name: kept.Name,
				Kind: kept.Kind,
			}},
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				ID:   &keptSlot.ID,
				Name: keptSlot.Name,
				Kind: keptSlot.Kind,
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot project proposal: %v", err)
	}
	if resp.Counts.CreativeReferencesDeleted != 1 || resp.Counts.AssetSlotsDeleted != 1 {
		t.Fatalf("unexpected snapshot delete counts: %+v", resp.Counts)
	}

	var updatedRemoved model.CreativeReference
	if err := db.First(&updatedRemoved, removed.ID).Error; err != nil {
		t.Fatalf("load removed reference: %v", err)
	}
	if updatedRemoved.Status != "ignored" {
		t.Fatalf("removed reference status = %q, want ignored", updatedRemoved.Status)
	}
	var updatedKept model.CreativeReference
	if err := db.First(&updatedKept, kept.ID).Error; err != nil {
		t.Fatalf("load kept reference: %v", err)
	}
	if updatedKept.Status != "confirmed" {
		t.Fatalf("kept reference status = %q, want confirmed", updatedKept.Status)
	}
	var updatedRemovedSlot model.AssetSlot
	if err := db.First(&updatedRemovedSlot, removedSlot.ID).Error; err != nil {
		t.Fatalf("load removed slot: %v", err)
	}
	if updatedRemovedSlot.Status != "waived" {
		t.Fatalf("removed slot status = %q, want waived", updatedRemovedSlot.Status)
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
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				Name:                "Foreign portrait",
				Kind:                "image",
				CreativeReferenceID: &foreignReference.ID,
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

func TestApplyProjectProposalRejectsUnresolvedAssetOwnerClientID(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	_, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				Name:  "Detached portrait",
				Kind:  "image",
				Owner: &ProjectProposalOwnerRef{Type: "creative_reference", ClientID: "cr_from_old_draft"},
			}},
		},
	})
	if err == nil {
		t.Fatal("apply project proposal succeeded, want unresolved owner client_id error")
	}
	if !strings.Contains(err.Error(), "cannot be resolved") {
		t.Fatalf("error = %v, want unresolved client id", err)
	}
}

func TestApplyProjectProposalIgnoresAssetOwnerClientIDWhenIDProvided(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	reference := model.CreativeReference{
		ProjectID: 1,
		Name:      "Nico",
		Kind:      "person",
		Status:    "confirmed",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}

	if _, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			AssetSlots: []ProjectProposalAssetSlotPatch{{
				Name:  "Portrait",
				Kind:  "image",
				Owner: &ProjectProposalOwnerRef{Type: "creative_reference", ID: &reference.ID, ClientID: "old_draft_client_id"},
			}},
		},
	}); err != nil {
		t.Fatalf("apply project proposal: %v", err)
	}

	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "Portrait").First(&slot).Error; err != nil {
		t.Fatalf("load slot: %v", err)
	}
	if slot.OwnerType != "creative_reference" || slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("asset slot owner = %s/%v, want creative_reference/%d", slot.OwnerType, slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectProposalMergesCreativeReferenceCandidate(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)

	target := model.CreativeReference{ProjectID: 1, Name: "Heroine", Kind: "person", Status: "confirmed"}
	source := model.CreativeReference{ProjectID: 1, Name: "Heroine duplicate", Kind: "person", Status: "confirmed"}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target: %v", err)
	}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create source: %v", err)
	}
	slot := model.AssetSlot{
		ProjectID:           1,
		CreativeReferenceID: &source.ID,
		OwnerType:           "creative_reference",
		OwnerID:             &source.ID,
		Name:                "Source view",
		Kind:                "image",
		Status:              "missing",
	}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("create source slot: %v", err)
	}

	resp, err := service.ApplyProjectProposal(context.Background(), 1, ApplyProjectProposalRequest{
		Proposal: &ProjectProposalTree{
			CreativeReferences: []ProjectProposalCreativeReferencePatch{{
				ID: &target.ID,
				MergeCandidates: []ProjectProposalMergeCandidate{{
					SourceID: &source.ID,
					Reason:   "same character",
				}},
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project proposal merge: %v", err)
	}
	if resp.Counts.CreativeReferencesMerged != 1 || resp.Counts.AssetSlotsReassigned != 1 {
		t.Fatalf("unexpected counts: %+v", resp.Counts)
	}

	var updatedSource model.CreativeReference
	if err := db.First(&updatedSource, source.ID).Error; err != nil {
		t.Fatalf("load source: %v", err)
	}
	if updatedSource.Status != "merged" {
		t.Fatalf("source status = %q, want merged", updatedSource.Status)
	}
	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("load slot: %v", err)
	}
	if updatedSlot.CreativeReferenceID == nil || *updatedSlot.CreativeReferenceID != target.ID {
		t.Fatalf("slot creative_reference_id = %v, want %d", updatedSlot.CreativeReferenceID, target.ID)
	}
}
