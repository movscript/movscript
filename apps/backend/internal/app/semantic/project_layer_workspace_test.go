package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestApplyProjectLayerWorkspaceUpdatesProjectStyle(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	project := model.Project{Name: "Style project", Description: "Original", AspectRatio: "1:1", ProjectStyle: `{"camera_language":"locked tripod"}`}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	aspectRatio := "9:16"
	visualStyle := "竖屏短剧写实，肤色自然，道具轮廓清晰"
	lightingStyle := "柔和日光，避免过曝"

	resp, err := service.ApplyProjectLayerWorkspace(context.Background(), project.ID, ApplyProjectLayerWorkspaceRequest{
		Scope: "project_standards_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
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
		t.Fatalf("apply project style workspace: %v", err)
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

func TestApplyProjectLayerWorkspaceUpdatesCustomRules(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	project := model.Project{Name: "Rules project", ProjectStyle: `{"visual_style":"keep"}`}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	enabled := true
	required := false
	order := 20

	resp, err := service.ApplyProjectLayerWorkspace(context.Background(), project.ID, ApplyProjectLayerWorkspaceRequest{
		Scope: "project_standards_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			ProjectStyle: &ProjectStylePatch{
				CustomRules: &[]ProjectStyleCustomRulePatch{{
					Key:        "character_consistency",
					Label:      "角色一致性",
					Category:   "人物",
					Value:      "主角发型、年龄感和服装气质必须保持一致。",
					PromptRole: "constraint",
					Enabled:    &enabled,
					Required:   &required,
					Order:      &order,
				}},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply custom rule workspace: %v", err)
	}
	if resp.Counts.ProjectStyleUpdated != 1 {
		t.Fatalf("project_style_updated = %d, want 1", resp.Counts.ProjectStyleUpdated)
	}

	var updated model.Project
	if err := db.First(&updated, project.ID).Error; err != nil {
		t.Fatalf("load updated project: %v", err)
	}
	var style map[string]any
	if err := json.Unmarshal([]byte(updated.ProjectStyle), &style); err != nil {
		t.Fatalf("parse project style json: %v", err)
	}
	if style["visual_style"] != "keep" {
		t.Fatalf("existing style field was not preserved: %#v", style)
	}
	rules, ok := style["custom_rules"].([]any)
	if !ok || len(rules) != 1 {
		t.Fatalf("custom_rules = %#v, want one rule", style["custom_rules"])
	}
	rule, ok := rules[0].(map[string]any)
	if !ok || rule["key"] != "character_consistency" || rule["prompt_role"] != "constraint" || rule["enabled"] != true {
		t.Fatalf("unexpected custom rule: %#v", rules[0])
	}
	if rule["id"] != "character_consistency" {
		t.Fatalf("generated custom rule id = %#v, want character_consistency", rule["id"])
	}
}

func TestNormalizeProjectStyleRuleIDKeepsUnicodeKeys(t *testing.T) {
	if got := normalizeProjectStyleRuleID("", "角色一致性", "", 0); got != "角色一致性" {
		t.Fatalf("unicode key id = %q, want 角色一致性", got)
	}
	if got := normalizeProjectStyleRuleID("", "", "!!!", 1); got != "custom_rule_2" {
		t.Fatalf("fallback id = %q, want custom_rule_2", got)
	}
}

func TestApplyProjectLayerWorkspaceRejectsProjectScopeLists(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "project_standards_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			ProjectStyle: &ProjectStylePatch{},
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				Name: "Should use setting workspace",
				Kind: "person",
			}},
		},
	})
	if err == nil {
		t.Fatal("expected project standards workspace list rejection")
	}
	if !strings.Contains(err.Error(), "project_standards_workspace only supports project_style") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestApplyProjectLayerWorkspaceMergesPartialReferencesAndAssets(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	settingResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ClientID: "cr_lin_xia",
				Name:     "Lin Xia",
				Kind:     "person",
				Status:   "confirmed",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply setting workspace: %v", err)
	}
	assetResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				Owner:    &ProjectLayerWorkspaceOwnerRef{Type: "creative_reference", ClientID: "cr_lin_xia"},
				Name:     "Lin Xia portrait",
				Kind:     "image",
				Priority: "high",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace: %v", err)
	}
	if settingResp.Counts.CreativeReferencesCreated != 1 || assetResp.Counts.AssetSlotsCreated != 1 {
		t.Fatalf("unexpected counts: setting=%+v asset=%+v", settingResp.Counts, assetResp.Counts)
	}

	var reference model.CreativeReference
	if err := db.Where("project_id = ? AND name = ?", 1, "Lin Xia").First(&reference).Error; err != nil {
		t.Fatalf("load creative reference: %v", err)
	}
	if reference.Kind != "person" || reference.Status != "confirmed" {
		t.Fatalf("unexpected creative reference: %+v", reference)
	}
	if reference.WorkspaceClientID != "cr_lin_xia" {
		t.Fatalf("workspace client id = %q, want cr_lin_xia", reference.WorkspaceClientID)
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

func TestApplyProjectLayerWorkspaceResolvesPersistedCreativeReferenceClientID(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	if _, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ClientID: "char_001",
				Name:     "Su Wan",
				Kind:     "character",
				Status:   "confirmed",
			}},
		},
	}); err != nil {
		t.Fatalf("apply setting workspace: %v", err)
	}

	resp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ClientID: "slot_001",
				Owner:    &ProjectLayerWorkspaceOwnerRef{Type: "creative_reference", ClientID: "char_001"},
				Name:     "Su Wan portrait",
				Kind:     "image",
				Status:   "pending",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace: %v", err)
	}
	if resp.Counts.AssetSlotsCreated != 1 {
		t.Fatalf("asset slot create count = %d, want 1", resp.Counts.AssetSlotsCreated)
	}

	var reference model.CreativeReference
	if err := db.Where("project_id = ? AND workspace_client_id = ?", 1, "char_001").First(&reference).Error; err != nil {
		t.Fatalf("load creative reference by workspace client id: %v", err)
	}
	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "Su Wan portrait").First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != reference.ID {
		t.Fatalf("slot creative_reference_id = %v, want %d", slot.CreativeReferenceID, reference.ID)
	}
	if slot.OwnerType != "creative_reference" || slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("slot owner = %s/%v, want creative_reference/%d", slot.OwnerType, slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectLayerWorkspacePrefersPersistedClientIDOverStaleOwnerID(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	reference := model.CreativeReference{
		ProjectID:        1,
		WorkspaceClientID: "char_001",
		Name:             "Su Wan",
		Kind:             "character",
		Status:           "confirmed",
		Importance:       "main",
	}
	staleReference := model.CreativeReference{
		ProjectID:        2,
		WorkspaceClientID: "char_001",
		Name:             "Other project Su Wan",
		Kind:             "character",
		Status:           "confirmed",
		Importance:       "main",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	if err := db.Create(&staleReference).Error; err != nil {
		t.Fatalf("create stale reference: %v", err)
	}

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ClientID: "slot_001",
				Owner: &ProjectLayerWorkspaceOwnerRef{
					Type:     "creative_reference",
					ID:       &staleReference.ID,
					ClientID: "char_001",
				},
				Name:   "Su Wan portrait",
				Kind:   "image",
				Status: "pending",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace: %v", err)
	}

	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "Su Wan portrait").First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != reference.ID {
		t.Fatalf("slot creative_reference_id = %v, want %d", slot.CreativeReferenceID, reference.ID)
	}
	if slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("slot owner_id = %v, want %d", slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectLayerWorkspaceRebasesStaleCreativeReferenceOwnerIDBySlotText(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	reference := model.CreativeReference{
		ProjectID:   1,
		Name:        "苏晚",
		Kind:        "character",
		Description: "女主，单亲妈妈",
		Status:      "confirmed",
		Importance:  "main",
	}
	staleReference := model.CreativeReference{
		ProjectID:  2,
		Name:       "旧苏晚",
		Kind:       "character",
		Status:     "confirmed",
		Importance: "main",
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	if err := db.Create(&staleReference).Error; err != nil {
		t.Fatalf("create stale reference: %v", err)
	}

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ClientID: "slot_001",
				Owner: &ProjectLayerWorkspaceOwnerRef{
					Type: "creative_reference",
					ID:   &staleReference.ID,
				},
				Name:        "女主形象图",
				Kind:        "image",
				Description: "女主不同阶段的官方人设图",
				Status:      "pending",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace: %v", err)
	}

	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "女主形象图").First(&slot).Error; err != nil {
		t.Fatalf("load asset slot: %v", err)
	}
	if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != reference.ID {
		t.Fatalf("slot creative_reference_id = %v, want %d", slot.CreativeReferenceID, reference.ID)
	}
	if slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("slot owner_id = %v, want %d", slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectLayerWorkspaceSnapshotKeepsCreatedRows(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	settingResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ClientID: "cr_new",
				Name:     "New reference",
				Kind:     "person",
				Status:   "confirmed",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot setting workspace: %v", err)
	}
	assetResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ClientID: "slot_new",
				Owner:    &ProjectLayerWorkspaceOwnerRef{Type: "creative_reference", ClientID: "cr_new"},
				Name:     "New reference portrait",
				Kind:     "image",
				Status:   "missing",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot asset workspace: %v", err)
	}
	if settingResp.Counts.CreativeReferencesCreated != 1 || assetResp.Counts.AssetSlotsCreated != 1 {
		t.Fatalf("unexpected create counts: setting=%+v asset=%+v", settingResp.Counts, assetResp.Counts)
	}
	if settingResp.Counts.CreativeReferencesDeleted != 0 || assetResp.Counts.AssetSlotsDeleted != 0 {
		t.Fatalf("created rows were treated as omitted: setting=%+v asset=%+v", settingResp.Counts, assetResp.Counts)
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
	if assetResp.CanonicalSnapshot == nil || len(assetResp.CanonicalSnapshot.CreativeReferences) != 1 || assetResp.CanonicalSnapshot.CreativeReferences[0].ID == nil {
		t.Fatalf("canonical snapshot did not include created reference with backend id: %#v", assetResp.CanonicalSnapshot)
	}
}

func TestApplyProjectLayerWorkspaceOnlyPatchesMentionedFields(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ID:   &reference.ID,
				Name: "New name",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply setting workspace: %v", err)
	}
	_, err = service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ID: &slot.ID,
				Owner: &ProjectLayerWorkspaceOwnerRef{
					Type: "creative_reference",
					ID:   &reference.ID,
				},
				Priority: "high",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace: %v", err)
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

func TestApplyProjectLayerWorkspaceSoftDeletesSnapshotOmissions(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	settingResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Mode:  "patch",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ID:     &reference.ID,
				Name:   "Removed reference",
				Status: "ignored",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply setting workspace soft delete: %v", err)
	}
	assetResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "patch",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ID:     &slot.ID,
				Name:   "Removed six-view",
				Kind:   "image",
				Status: "waived",
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply asset workspace soft delete: %v", err)
	}
	if settingResp.Counts.CreativeReferencesDeleted != 1 || assetResp.Counts.AssetSlotsDeleted != 1 {
		t.Fatalf("unexpected delete counts: setting=%+v asset=%+v", settingResp.Counts, assetResp.Counts)
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

func TestApplyProjectLayerWorkspaceSnapshotModeDeletesOmittedActiveItems(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	settingResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ID:   &kept.ID,
				Name: kept.Name,
				Kind: kept.Kind,
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot setting workspace: %v", err)
	}
	assetResp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ID:   &keptSlot.ID,
				Name: keptSlot.Name,
				Kind: keptSlot.Kind,
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply snapshot asset workspace: %v", err)
	}
	if settingResp.Counts.CreativeReferencesDeleted != 1 || assetResp.Counts.AssetSlotsDeleted != 1 {
		t.Fatalf("unexpected snapshot delete counts: setting=%+v asset=%+v", settingResp.Counts, assetResp.Counts)
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

func TestApplyProjectLayerWorkspaceSnapshotWaivesOmittedSlotWithStaleOwner(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	missingReferenceID := uint(999)
	staleSlot := model.AssetSlot{
		ProjectID:           1,
		CreativeReferenceID: &missingReferenceID,
		OwnerType:           "creative_reference",
		OwnerID:             &missingReferenceID,
		Kind:                "image",
		Name:                "Stale owner portrait",
		Status:              "missing",
		Priority:            "normal",
	}
	if err := db.Create(&staleSlot).Error; err != nil {
		t.Fatalf("create stale slot: %v", err)
	}

	if _, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope:    "asset_workspace",
		Mode:     "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{},
	}); err != nil {
		t.Fatalf("apply asset workspace: %v", err)
	}

	var updated model.AssetSlot
	if err := db.First(&updated, staleSlot.ID).Error; err != nil {
		t.Fatalf("load stale slot: %v", err)
	}
	if updated.Status != "waived" {
		t.Fatalf("stale slot status = %q, want waived", updated.Status)
	}
}

func TestApplyProjectLayerWorkspaceRejectsAssetSlotReferenceOutsideProjectAndRollsBack(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				Name:                "Foreign portrait",
				Kind:                "image",
				CreativeReferenceID: &foreignReference.ID,
			}},
		},
	})
	if !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("error = %v, want ErrOwnerWrongProject", err)
	}
	var linkErr *ProjectLayerWorkspaceAssetSlotLinkError
	if !errors.As(err, &linkErr) {
		t.Fatalf("error = %T %[1]v, want ProjectLayerWorkspaceAssetSlotLinkError", err)
	}
	if linkErr.SlotName != "Foreign portrait" {
		t.Fatalf("link error slot name = %q, want Foreign portrait", linkErr.SlotName)
	}
	if linkErr.CreativeReferenceID == nil || *linkErr.CreativeReferenceID != foreignReference.ID {
		t.Fatalf("link error creative_reference_id = %v, want %d", linkErr.CreativeReferenceID, foreignReference.ID)
	}

	var slots int64
	if err := db.Model(&model.AssetSlot{}).Where("project_id = ?", 1).Count(&slots).Error; err != nil {
		t.Fatalf("count asset slots: %v", err)
	}
	if slots != 0 {
		t.Fatalf("asset slots after rollback = %d, want 0", slots)
	}
}

func TestApplyProjectLayerWorkspaceRejectsUnresolvedAssetOwnerClientID(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				Name:  "Detached portrait",
				Kind:  "image",
				Owner: &ProjectLayerWorkspaceOwnerRef{Type: "creative_reference", ClientID: "cr_from_old_workspace"},
			}},
		},
	})
	if err == nil {
		t.Fatal("apply project standards workspace succeeded, want unresolved owner client_id error")
	}
	if !strings.Contains(err.Error(), "cannot be resolved") {
		t.Fatalf("error = %v, want unresolved client id", err)
	}
}

func TestApplyProjectLayerWorkspaceWrapsMissingAssetReferenceWithSlotHints(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	missingReferenceID := uint(999)

	_, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Mode:  "snapshot",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				ClientID:            "slot_missing",
				Name:                "Missing portrait",
				Kind:                "image",
				CreativeReferenceID: &missingReferenceID,
			}},
		},
	})
	if !errors.Is(err, ErrOwnerNotFound) {
		t.Fatalf("error = %v, want ErrOwnerNotFound", err)
	}
	var linkErr *ProjectLayerWorkspaceAssetSlotLinkError
	if !errors.As(err, &linkErr) {
		t.Fatalf("error = %T %[1]v, want ProjectLayerWorkspaceAssetSlotLinkError", err)
	}
	if linkErr.SlotName != "Missing portrait" {
		t.Fatalf("link error slot name = %q, want Missing portrait", linkErr.SlotName)
	}
	if linkErr.CreativeReferenceID == nil || *linkErr.CreativeReferenceID != missingReferenceID {
		t.Fatalf("link error creative_reference_id = %v, want %d", linkErr.CreativeReferenceID, missingReferenceID)
	}
}

func TestApplyProjectLayerWorkspaceIgnoresAssetOwnerClientIDWhenIDProvided(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	if _, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "asset_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			AssetSlots: []ProjectLayerWorkspaceAssetSlotPatch{{
				Name:  "Portrait",
				Kind:  "image",
				Owner: &ProjectLayerWorkspaceOwnerRef{Type: "creative_reference", ID: &reference.ID, ClientID: "old_workspace_client_id"},
			}},
		},
	}); err != nil {
		t.Fatalf("apply project standards workspace: %v", err)
	}

	var slot model.AssetSlot
	if err := db.Where("project_id = ? AND name = ?", 1, "Portrait").First(&slot).Error; err != nil {
		t.Fatalf("load slot: %v", err)
	}
	if slot.OwnerType != "creative_reference" || slot.OwnerID == nil || *slot.OwnerID != reference.ID {
		t.Fatalf("asset slot owner = %s/%v, want creative_reference/%d", slot.OwnerType, slot.OwnerID, reference.ID)
	}
}

func TestApplyProjectLayerWorkspaceMergesCreativeReferenceCandidate(t *testing.T) {
	db := newWorkspaceTestDB(t)
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

	resp, err := service.ApplyProjectLayerWorkspace(context.Background(), 1, ApplyProjectLayerWorkspaceRequest{
		Scope: "setting_workspace",
		Workspace: &ProjectLayerWorkspaceTree{
			CreativeReferences: []ProjectLayerWorkspaceCreativeReferencePatch{{
				ID: &target.ID,
				MergeCandidates: []ProjectLayerWorkspaceMergeCandidate{{
					SourceID: &source.ID,
					Reason:   "same character",
				}},
			}},
		},
	})
	if err != nil {
		t.Fatalf("apply project standards workspace merge: %v", err)
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
